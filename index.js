var node_utils = require('@cliques/cliques-node-utils');
var tags = node_utils.tags;
var urls = node_utils.urls;
var bigQueryUtils = node_utils.google.bigQueryUtils;
var metadataServer = node_utils.google.metadataServer;
var googleAuth = node_utils.google.auth;
var logging = require('./lib/bidder_logging.js');
var pubsub = node_utils.google.pubsub;
var AgentConfig = require('./bidding-agents/nodebidagent-config.js').AgentConfig;
var BidAgentAccount = require('./bidding-agents/nodebidagent-config.js').BidAgentAccount;

var config = require('config');
var path = require('path');
var winston = require('winston');
var util = require('util');
var redis = require('redis');
var fs = require('fs');
var jsonminify = require('jsonminify');
var child_process = require('child_process');


/* ------------------- LOGGER & REDIS ------------------------ */
var REDIS_PORT = 6380;
var redisClient = redis.createClient(REDIS_PORT, '127.0.0.1');

var logfile = path.join(
    process.env['HOME'],
    'rtbkit_logs',
    'nodebidagent',
    util.format('bidagent_%s.log',node_utils.dates.isoFormatUTCNow())
);

const adEventDataset = config.get("Bidder.logger.bigQuery.adEventDataset");
const httpEventDataset = config.get("Bidder.logger.bigQuery.httpEventDataset");
var bq_config = bigQueryUtils.loadFullBigQueryConfig('./bq_config.json', httpEventDataset, adEventDataset);
var chunkSize = config.get('Bidder.logger.redis_event_cache.chunkSize');
var eventStreamer = new bigQueryUtils.BigQueryEventStreamer(bq_config,
    googleAuth.DEFAULT_JWT_SECRETS_FILE,chunkSize);
logger = new logging.BidderCLogger({
    transports: [
        new (winston.transports.Console)({timestamp:true}),
        new (winston.transports.File)({ filename:logfile, timestamp:true, maxsize: 1073741824, zippedArchive: true }),
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
var controller;
mongo_connection.once('open', function(callback){
    advertiserModels = new node_utils.mongodb.models.AdvertiserModels(mongo_connection,{readPreference: 'secondary'});
    /* -------------------- CONTROLLER INIT ---------------------- */
    // Use redis to store list of campaigns for currently active
    controller = new _Controller(redisClient);
});

/* ---------------- BIDDER CLIQUE SET ON INSTANCE METADATA ----------------- */
var client = new metadataServer.MetadataServerAPI();
var CLIQUE;
client.getInstanceMetadataVal('clique', function(err, res){
    if (err) return logger.error(err);
    CLIQUE = res;
    logger.info('Bidder clique = ' + CLIQUE);
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
    return {
        "zookeeper-uri": bootstrap_config["zookeeper-uri"],
        "carbon-uri": bootstrap_config["carbon-uri"]
    };
}

// Configs for tag  object
var ADSERVER_HOST= config.get('AdServer.http.external.hostname');
var ADSERVER_SECURE_HOST= config.get('AdServer.https.external.hostname');
var ADSERVER_PORT = config.get('AdServer.http.external.port');
var ADSERVER_SECURE_PORT = config.get('AdServer.https.external.port');

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
    var tag = new tags.ImpTag(ADSERVER_HOST, {
        port: ADSERVER_SECURE_PORT,
        secure_hostname: ADSERVER_SECURE_HOST,
        //TODO: Default to secure for now for all ads because markup generated statically, fix this!!
        secure: true
    });

    var url = new urls.ImpURL(ADSERVER_HOST, ADSERVER_SECURE_HOST, ADSERVER_SECURE_PORT);

    // small sub-function to render proper ad markup, depending on creative type
    function _getCreativeGroupMarkup(crg){
        var markup;
        // if creativeGroup is Native, just return URL, otherwise render whole tag
        if (crg.type === 'native'){
            markup = url.format({ crgid: crg.id, type: 'native'}, true);
        } else {
            markup = tag.render(crg);
        }
        return markup;
    }

    var account = new BidAgentAccount(campaign.id);

    var coreConfig = {
        account: account.accountArray,
        bidProbability: bidProbability,
        providerConfig: {
            cliques: {
                seat: campaign.clique,
                pricing: config.get('Pricing')
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
    // get domain name, may be entered as website.  Convert to base domain for OpenRTB compatibility.
    var adomain = [campaign.parent_advertiser.website.split('.').slice(-2).join('.')];
    for (var i=0; i < campaign.creativegroups.length; i++){
        var crg = campaign.creativegroups[i];
        if (crg.active){
            coreConfig.creatives.push({
                format: { width: crg.w, height: crg.h },
                id: i,
                name: crg.name,
                tagId: crg.id, //don't know why this is necessary, don't even know what it means
                providerConfig: {
                    cliques: {
                        adm: _getCreativeGroupMarkup(crg),
                        adomain: adomain
                    }
                }
            });
        }
    }
    return coreConfig;
}

function _parseTargetingConfig(campaign){
    return {
        base_bid: campaign.base_bid,
        max_bid: campaign.max_bid,
        country_targets: campaign.country_targets,
        dma_targets: campaign.dma_targets,

        geo_targets: campaign.geo_targets,
        blocked_geos: campaign.blocked_geos,
        target_only_geos: campaign.target_only_geos,

        keyword_targets: campaign.keyword_targets,
        blocked_keywords: campaign.blocked_keywords,

        placement_targets: campaign.placement_targets,
        multi_bid: campaign.multi_bid,
        inventory_targets: campaign.inventory_targets,
        blocked_inventory: campaign.blocked_inventory,
        start_date: campaign.start_date,
        end_date: campaign.end_date,
        even_pacing: campaign.even_pacing,
        budget: campaign.budget,
        blocked_cliques: campaign.blocked_cliques
    };
}

/**
 * Primitive but effective way to pass functions to AgentConfig for use by nodebidagent
 * More of a placeholder for now, but can be used in the future to pass arbitrary helper
 * functions to AgentConfig object for serialization & deserialization in nodebidagent.
 *
 * @returns {{getInventoryWeight: *}}
 * @private
 */
function _getHelperFunctions(){
    return {
        getInventoryWeight: advertiserModels.Campaign.getInventoryWeight,
        getInventoryBlockStatus: advertiserModels.Campaign.getInventoryBlockStatus,
        getGeoWeight: advertiserModels.Campaign.getGeoWeight,
        getGeoBlockStatus: advertiserModels.Campaign.getGeoBlockStatus,
        getKeywordWeight: advertiserModels.Campaign.getKeywordWeight,
        getKeywordBlockStatus: advertiserModels.Campaign.getKeywordBlockStatus
    };
}

/**
 * Gets serialized AgentConfig object to pass to child bidAgent.
 *
 * Calls three private parsers to get core, env & targeting configs.
 *
 * @param {String} campaign Mongoose campaign object
 * @param callback takes (err, serialized_config, campaign_obj)
 */
function getAgentConfig(campaign, callback){
    // get campaign object from DB first

    // parse individual configs
    var coreConfig = _parseCoreConfig(campaign);
    var targetingConfig = _parseTargetingConfig(campaign);
    var envConfig = _parseEnvConfig(BOOTSTRAP_FILE);
    var helpers = _getHelperFunctions();

    var agentConfig = new AgentConfig(coreConfig, targetingConfig, envConfig, helpers);
    return callback(null, agentConfig.serialize(), campaign);
}
exports.getAgentConfig = getAgentConfig;

/* ------------------ CONTROLLER CLASS ------------------- */

/**
 * Controller object just helps to manage creation & lookup of bidAgent child processes.
 *
 * Provides simple methods to create, update & stop bidAgent child processes, which can
 * be hooked to signals or messages.
 *
 * NOTE: Assumes strict 1-1 mapping between campaign objects and bidagents.
 *
 * Will also persist campaigns for which agents are currently running Redis so that,
 * in the event of a process crash or termination, agents can be started back
 * up again automatically.
 *
 * @param {Object} [redisClient]
 * @class
 * @private
 */
var _Controller = function(redisClient){
    //Path to bidagent executable script
    this.BIDAGENT_EXECUTABLE = './bidding-agents/nodebidagent.js';
    this.redisClient = redisClient || redis.createClient();
    // internal object to store mapping of campaign ID's to processes
    this.bidAgents = {};

    // if campaigns provided, create bidAgents for each campaignId.
    // persistence to redis allows for auto recovery of bidagents if the controller
    // crashes or something
    var self = this;
    this.REDIS_CAMPAIGNS_KEY = 'bidagent_campaigns';
    this.redisClient.SMEMBERS(this.REDIS_CAMPAIGNS_KEY, function(err, campaigns){
        if (err) throw new Error('Error retrieving campaigns from redis: ' + err);
        if (campaigns.length > 0){
            campaigns.forEach(function(campaign_id){
                advertiserModels.getNestedObjectById(campaign_id, 'Campaign', function(err, campaign) {
                    if (err) throw new Error(err);
                    self.createBidAgent(campaign);
                });
            });
        }
    });
};

_Controller.prototype._registerBidAgent = function(campaign_id, bidAgent){
    this.bidAgents[campaign_id] = bidAgent;
    this.redisClient.SADD(this.REDIS_CAMPAIGNS_KEY, campaign_id, function(err, res){
        if (err) throw new Error("Error adding campaign ID to redis: " + err);
    })
};

_Controller.prototype._getBidAgent = function(campaign_id){
    return this.bidAgents[campaign_id]
};

_Controller.prototype._deleteBidAgent = function(campaign_id){
    delete(this.bidAgents[campaign_id]);
    this.redisClient.SREM(this.REDIS_CAMPAIGNS_KEY, campaign_id, function(err, res){
        if (err) throw new Error("Error removing campaign ID from redis: " + err);
    })
};

/**
 * Spawns bidAgent child process and registers process with the
 * controller.
 *
 * @param campaign
 */
_Controller.prototype.createBidAgent = function(campaign){
    var self = this;
    var campaign_id = campaign.id;
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
    getAgentConfig(campaign, function(err, serialized_config, campaign) {
        // spawn child process, i.e. spin up new bidding agent
        var agent = child_process.spawn(self.BIDAGENT_EXECUTABLE, [serialized_config]);
        self._registerBidAgent(campaign_id, agent);

        // handle stdout
        agent.stdout.on('data', function (data){
            var logline = data.toString();
            // hacky, I know.
            // log using bid method if logline begins with 'BID: '
            if (logline.indexOf(logging.BID_PREFIX) === 0) {
                try {
                    //TODO: have to wrap in try catch as this throws weird
                    //TODO: parsing bugs once in a while, figure out root cause
                    // stdout stream sometimes emits data event for multiple lines at a time
                    // even if sent to stdout as separate log lines, so split on \n
                    var loglines = logline.split('\n');

                    loglines.forEach(function(line){
                        // split above will create empty last line
                        if (line){
                            var meta = JSON.parse(line.slice(logging.BID_PREFIX.length));
                            // call logger method, pass campaign and advertiser in.
                            logger.bid(meta, campaign, campaign.parent_advertiser);    
                        }
                    });
                } catch (e) {
                    logger.error("ERROR parsing bid logline -- tried to parse the following:");
                    logger.info(logline);
                }
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
 * @param campaign
 */
_Controller.prototype.updateBidAgent = function(campaign){
    var self = this;
    var campaign_id = campaign.id;
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
    getAgentConfig(campaign, function(err, serialized_config, campaign){
        // send message to child process with new configs
        agent.stdin.write(serialized_config);
    });
};

/**
 * Kills bidAgent child process.
 *
 * @param campaign
 */
_Controller.prototype.stopBidAgent = function(campaign){
    var self = this;
    var campaign_id = campaign.id;
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
    self._deleteBidAgent(campaign_id);
};

/* ---------------- BIDDER PUBSUB INSTANCE & LISTENERS ----------------- */

// Here's where the Controller methods actually get hooked to signals from
// the outside world via Google PubSub api.

if (process.env.NODE_ENV === 'local-test'){
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
 * Helper function to handle execution of callback only if subscription message
 * (campaign_id) belongs to clique matching the one configured for this bidder
 *
 * @param campaign_id
 * @param callback
 */
function filterCampaignByClique(campaign_id, callback){
    advertiserModels.getNestedObjectById(campaign_id, 'Campaign', function(err, campaign){
        if (err) return callback('Error when trying to get campaign_id ' + campaign_id + ' from MongoDB:' + err);
        // filter on campaign clique, only spawn if clique matches this bidder's clique
        //logger.info('Message received for campaign_id ' + campaign_id + ', in clique ' + campaign.clique.id);
        if (campaign.clique === CLIQUE) {
            return callback(null, campaign);
        } else {
            return callback(null, null);
        }
    });
}

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
        if (message.attributes.NODE_ENV === process.env.NODE_ENV){
            var campaign_id = message.data;
            filterCampaignByClique(campaign_id, function(err, campaign){
                message.ack();
                // TODO: should send alert here
                if (err) return console.error(err);
                // only spawn bidagent if campaign is in Clique;
                if (campaign){
                    logger.info('Received createBidder message for campaignId ' + campaign_id + ', spawning bidagent...');
                    controller.createBidAgent(campaign);
                }
            });
        } else {
            // otherwise, ack and move on
            message.ack();
        }
    });
    subscription.on('error', function(err){
        logger.error('Error subscribing to CreateBidder topic, will not be able to receive signals until this is fixed');
        logger.error(err);
    });
});

/**
 * Handle updates to bidder config, received from updateBidder topic messages
 */
bidderPubSub.subscriptions.updateBidder(function(err, subscription){
    if (err) throw new Error('Error creating subscription to updateBidder topic: ' + err);
    subscription.on('message', function(message){
        if (message.attributes.NODE_ENV === process.env.NODE_ENV) {
            var campaign_id = message.data;
            filterCampaignByClique(campaign_id, function (err, campaign) {
                message.ack();
                // TODO: should send alert here
                if (err) return console.error(err);
                if (campaign){
                    logger.info('Received updateBidder message for campaignId ' + campaign_id + ', updating config...');
                    controller.updateBidAgent(campaign);
                }
            });
        } else {
            // otherwise, ack and move on
            message.ack();
        }
    });
    subscription.on('error', function(err){
        logger.error('Error subscribing to UpdateBidder topic, will not be able to receive signals until this is fixed');
        logger.error(err);
    });
});

/**
 * Handle stopping bidAgents
 */
bidderPubSub.subscriptions.stopBidder(function(err, subscription){
    if (err) throw new Error('Error creating subscription to stopBidder topic: ' + err);
    subscription.on('message', function(message){
        if (message.attributes.NODE_ENV === process.env.NODE_ENV) {
            var campaign_id = message.data;
            filterCampaignByClique(campaign_id, function (err, campaign) {
                message.ack();
                // TODO: should send alert here
                if (err) return console.error(err);
                if (campaign){
                    logger.info('Received stopBidder message for campaignId ' + campaign_id + ', killing bidAgent now...');
                    controller.stopBidAgent(campaign);    
                }
            });
        } else {
            // otherwise, ack and move on
            message.ack();
        }
    });
    subscription.on('error', function(err){
        logger.error('Error subscribing to StopBidder topic, will not be able to receive signals until this is fixed');
        logger.error(err);
    });
});