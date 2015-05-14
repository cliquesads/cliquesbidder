var node_utils = require('cliques_node_utils');
var tags = node_utils.tags;
var bigQueryUtils = node_utils.google.bigQueryUtils;
var googleAuth = node_utils.google.auth;
var logging = require('./lib/bidder_logging.js');
var pubsub = node_utils.google.pubsub;
var AgentConfig = require('./bidding-agents/nodebidagent-config.js').AgentConfig;

var config = require('config');
var path = require('path');
var winston = require('winston');
var util = require('util');
var fs = require('fs');
var jsonminify = require('jsonminify');
var child_process = require('child_process');


/* ------------------- LOGGER ------------------------ */

var logfile = path.join(
    process.env['HOME'],
    'rtbkit_logs',
    'nodebidagent',
    util.format('bidagent_%s.log',node_utils.dates.isoFormatUTCNow())
);
var bq_config = bigQueryUtils.loadFullBigQueryConfig('./bq_config.json');
var eventStreamer = new bigQueryUtils.BigQueryEventStreamer(bq_config,
    googleAuth.DEFAULT_JWT_SECRETS_FILE,20);
logger = new logging.BidderCLogger({
    transports: [
        new (winston.transports.Console)({timestamp:true}),
        new (winston.transports.File)({filename:logfile,timestamp:true}),
        new (winston.transports.RedisEventCache)({
            eventStreamer: eventStreamer,
            redis_port: 6380 }
        )
    ]
});

/*------------------- MONGO CONNECTION ----------------*/

var mongoURI = util.format('mongodb://%s:%s/%s',
    config.get('Bidder.mongodb.exchange.secondary.host'),
    config.get('Bidder.mongodb.exchange.secondary.port'),
    config.get('Bidder.mongodb.exchange.db'));
var mongoOptions = {
    user: config.get('Bidder.mongodb.exchange.user'),
    pass: config.get('Bidder.mongodb.exchange.pwd'),
    auth: {authenticationDatabase: config.get('Bidder.mongodb.exchange.db')}
};
var mongo_connection = node_utils.mongodb.createConnectionWrapper(mongoURI, mongoOptions, function(err, logstring){
    if (err) throw err;
    console.log(logstring);
});

// TODO: technically if subscriber gets a message before the connection opens,
// TODO: any reference to these models will fail.
var advertiserModels;
mongo_connection.once('open', function(callback){
    advertiserModels = new node_utils.mongodb.models.AdvertiserModels(mongo_connection,{readPreference: 'secondary'});
});

/* -------------------- BIDAGENT CONFIGURATION -------------- */

// Get environment configs to connect bidAgents to RTBKit core services like Zookeeper, carbon
// These should be stored in JSON file bootstrap.json use by RTBKit
var BOOTSTRAP_FILE = './config/rtbkit/bootstrap.json';

/**
 * Parses out environment config from bootstrap.json file, used to
 * configure RTBKit core services.
 *
 * @param bootstrap_file
 * @returns {*}
 * @private
 */
function _parseEnvConfig(bootstrap_file){
    var bootstrap_config = JSON.parse(jsonminify(fs.readFileSync(bootstrap_file, 'utf8')));
    return JSON.stringify({
        "zookeeper-uri": bootstrap_config["zookeeper-uri"],
        "carbon-uri": bootstrap_config["carbon-uri"]
    });
}

// Configs for tag  object
var ADSERVER_HOST= config.get('AdServer.http.external.hostname');
var ADSERVER_PORT = config.get('AdServer.http.external.port');

/**
 * Translates Advertiser document from MongoDB into config compatible with
 * node bidagent.
 * @param campaign object. Nested in Advertiser but need to specify precise campaign
 *      as config <-> campaign is 1-1, currently.
 * @param {Object} [options={}]
 */
function _parseCoreConfig(campaign, options){
    options             = options || {};
    var maxInFlight     = options.max_in_flight || 50;
    var bidProbability  = options.bidProbability || 1.0;

    // tag object used to generate creative markup from config stored in DB
    var tag = new tags.ImpTag(ADSERVER_HOST, { port: ADSERVER_PORT});

    var coreConfig = {
        account: [campaign.parent_advertiser.id,campaign.id],
        bidProbability: bidProbability,
        providerConfig: {
            cliques: {
                seat: campaign.clique
            }
        },
        augmentations:{
            "frequency-cap-ex":{
                required:true,
                config: campaign.frequency,
                filters:{"include":["pass-frequency-cap-ex"]}
            }
        },
        maxInFlight: maxInFlight,
        creatives: []
    };
    // push creatives into config
    for (var i=0; i < campaign.creativegroups.length; i++){
        var crg = campaign.creativegroups[i];
        coreConfig.creatives.push({
            format: { width: crg.w, height: crg.h },
            id: i,
            name: crg.name,
            tagId: crg.id, //don't know why this is necessary, don't even know what it means
            providerConfig: {
                cliques: {
                    adm: tag.render(crg),
                    adomain: [campaign.parent_advertiser.website]
                }
            }
        });
    }
    return coreConfig;
}

function _parseTargetingConfig(campaign){
    return {
        base_bid: campaign.base_bid,
        max_bid: campaign.max_bid,
        country_targets: campaign.country_targets,
        dma_targets: campaign.dma_targets,
        placement_targets: campaign.placement_targets
    };
}

/**
 * Gets serialized AgentConfig object to pass to child bidAgent.
 *
 * Calls three private parsers to get core, env & targeting configs.
 *
 * @param {String} campaign_id Mongo campaign.id
 * @param callback takes (err, serialized_config, campaign_obj)
 */
function getAgentConfig(campaign_id, callback){
    // get campaign object from DB first
    advertiserModels.getNestedObjectById(campaign_id, 'Campaign', function(err, campaign){
        // create config objects to pass to bidagent
        if (err) return callback(err);

        // parse individual configs
        var coreConfig = _parseCoreConfig(campaign);
        var targetingConfig = _parseTargetingConfig(campaign);
        var envConfig = _parseEnvConfig(BOOTSTRAP_FILE);

        var agentConfig = new AgentConfig(coreConfig, targetingConfig, envConfig);

        return callback(null, agentConfig.serialize(), campaign);
    });
}

/* ------------------ CONTROLLER CLASS ------------------- */

/**
 * Controller object just helps to manage creation & lookup of bidAgent child processes.
 *
 * Provides simple methods to create, update & stop bidAgent child processes, which can
 * be hooked to signals or messages.
 *
 * NOTE: Assumes strict 1-1 mapping between campaign objects and bidagents.
 *
 * @param {Object} [bidAgents={}] optional mapping between campaign_ids and agent processes.
 * @constructor
 * @private
 */
var _Controller = function(bidAgents){
    //Path to bidagent executable script
    this.BIDAGENT_EXECUTABLE = './bidding-agents/nodebidagent.js';
    // TODO: might want to make this object contain campaign-keyed configs / PID's
    // TODO: instead of child process objects so that they can be re-spawned in the event
    // TODO: of a server fault.  Would have to persist this object somewhere like redis,
    // TODO: mongo, whatever
    this.bidAgents = bidAgents || {};
};

_Controller.prototype._registerBidAgent = function(campaign_id, bidAgent){
    this.bidAgents[campaign_id] = bidAgent;
};

_Controller.prototype._getBidAgent = function(campaign_id){
    return this.bidAgents[campaign_id]
};

/**
 * Spawns bidAgent child process and registers process with the
 * controller.
 *
 * @param campaign_id
 */
_Controller.prototype.createBidAgent = function(campaign_id){
    var self = this;

    // First check to make sure no other agent is running for this campaign already,
    // which would mean that this method has been called in error
    if (self._getBidAgent(campaign_id)){
        // TODO: Might want to throw a bigger hissy-fit if this happens rather than
        // TODO: just logging it...
        var msg = util.format('createBidAgent was called for campaign_id %s, but a ' +
        'bidAgent for this campaign_id already exists!!!', campaign_id);
        logger.error(msg);
        return;
    }

    // wrap creation of bidAgent in call to DB to get config data
    getAgentConfig(campaign_id, function(err, serialized_config, campaign) {
        // spawn child process, i.e. spin up new bidding agent
        var agent = child_process.spawn(self.BIDAGENT_EXECUTABLE, [serialized_config]);
        self._registerBidAgent(campaign_id, agent);

        // handle stdout
        agent.stdout.on('data', function (data) {
            var logline = data.toString();
            // hacky, I know.
            // log using bid method if logline begins with 'BID: '
            if (logline.indexOf(logging.BID_PREFIX) === 0) {
                var meta = JSON.parse(logline.slice(logging.BID_PREFIX.length));
                // call logger method, pass campaign and advertiser in.
                logger.bid(meta, campaign, campaign.parent_advertiser);
            } else {
                logger.info(data.toString());
            }
        });

        // handle stderr
        agent.stderr.on('data', function (data){
            logger.error(data.toString());
        });
    });
};

/**
 * Sends message to bidAgent child process with updated config data.
 *
 * @param campaign_id
 */
_Controller.prototype.updateBidAgent = function(campaign_id){
    var self = this;
    var agent = self._getBidAgent(campaign_id);
    if (!agent){
        // TODO: Might want to throw a bigger hissy-fit if this happens rather than
        // TODO: just logging it...
        var msg = util.format('updateBidAgent was called for campaign_id %s, but a ' +
        'bidAgent for this campaign_id does not exist!!!', campaign_id);
        logger.error(msg);
        return;
    }
    // wrap updating of bidAgent in call to DB to get config data
    getAgentConfig(campaign_id, function(err, serialized_config, campaign){
        // send message to child process with new configs
        agent.stdin.write(serialized_config);
    });
};

/**
 * Kills bidAgent child process.
 *
 * @param campaign_id
 */
_Controller.prototype.stopBidAgent = function(campaign_id){
    var self = this;
    var agent = self._getBidAgent(campaign_id);
    if (!agent){
        // TODO: Might want to throw a bigger hissy-fit if this happens rather than
        // TODO: just logging it...
        var msg = util.format('stopBidAgent was called for campaign_id %s, but a ' +
        'bidAgent for this campaign_id does not exist!!!', campaign_id);
        logger.error(msg);
        return;
    }
    // send kill signal to child process w/ custom signal
    agent.kill('SIGUSR2');
};

// Instantiate empty controller
var controller = new _Controller();


/* ---------------- BIDDER PUBSUB INSTANCE & LISTENERS ----------------- */

// Here's where the Controller methods actually get hooked to signals from
// the outside world via Google PubSub api.

if (process.env.NODE_ENV == 'local-test'){
    var pubsub_options = {
        projectId: 'mimetic-codex-781',
        test: true,
        logger: logger
    }
} else {
    pubsub_options = {projectId: 'mimetic-codex-781'};
}
var bidderPubSub = new pubsub.BidderPubSub(pubsub_options);

/**
 * Create bidder using controller on message from pubsub topic createBidder.
 *
 * On message, will spawn new child process, running BIDAGENT_EXECUTABLE with
 * campaign config as args.
 */
bidderPubSub.subscriptions.createBidder(function(err, subscription){

    if (err) throw new Error('Error creating subscription to createBidder topic: ' + err);

    // message listener
    subscription.on('message', function(message){
        var campaign_id = message.data;
        logger.info('Received createBidder message for campaignId '+ campaign_id + ', spawning bidagent...');
        controller.createBidAgent(campaign_id);
    });

    subscription.on('error', function(err){
        logger.error(err);
    });
});

/**
 * Handle updates to bidder config, received from updateBidder topic messages
 */
bidderPubSub.subscriptions.updateBidder(function(err, subscription){
    if (err) throw new Error('Error creating subscription to updateeBidder topic: ' + err);

    subscription.on('message', function(message){
        var campaign_id = message.data;
        logger.info('Received updateBidder message for campaignId '+ campaign_id+ ', updating config...');
        controller.updateBidAgent(campaign_id);
    });
    subscription.on('error', function(err){
        logger.error(err);
    });
});

/**
 * Handle stopping bidAgents
 */
bidderPubSub.subscriptions.stopBidder(function(err, subscription){
    if (err) throw new Error('Error creating subscription to stopBidder topic: ' + err);

    subscription.on('message', function(message){
        var campaign_id = message.data;
        logger.info('Received stopBidder message for campaignId '+ campaign_id + ', killing bidAgent now...');
        controller.stopBidAgent(campaign_id);
    });
    subscription.on('error', function(err){
        logger.error(err);
    });
});