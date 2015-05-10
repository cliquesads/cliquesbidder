var node_utils = require('cliques_node_utils');
var tags = node_utils.tags;
var bigQueryUtils = node_utils.google.bigQueryUtils;
var googleAuth = node_utils.google.auth;
var logging = require('./lib/bidder_logging.js');

var config = require('config');
var path = require('path');
var winston = require('winston');
var util = require('util');
var fs = require('fs');
var jsonminify = require('jsonminify');
var child_process = require('child_process');

//var googlepis = require('googleapis');

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

/* ----- Helpers to convert advertiser document into config ------ */

// instantiate tag object to use to generate ad markup for bidder configs
var adserver_host = config.get('AdServer.http.external.hostname');
var adserver_port = config.get('AdServer.http.external.port');
var tag = new tags.ImpTag(adserver_host, { port: adserver_port });

/**
 * Translates Advertiser document from MongoDB into config compatible with
 * node bidagent.
 * @param advertiser object
 * @param campaign object. Nested in Advertiser but need to specify precise campaign
 *      as config <-> campaign is 1-1, currently.
 * @param {Object} options
 */
function getAgentConfig(advertiser, campaign, options){

    options             = options || {};
    var maxInFlight     = options.max_in_flight || 50;
    var bidProbability  = options.bidProbability || 1.0;

    var agentConfig = {
        account: [advertiser.id,campaign.id],
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
        agentConfig.creatives.push({
            format: { width: crg.w, height: crg.h },
            id: i,
            name: crg.name,
            tagId: crg.id, //don't know why this is necessary, don't even know what it means
            providerConfig: {
                cliques: {
                    adm: tag.render(crg),
                    adomain: [advertiser.website]
                }
            }
        });
    }
    var targeting_config = {
        base_bid: campaign.base_bid,
        max_bid: campaign.max_bid,
        country_targets: campaign.country_targets,
        dma_targets: campaign.dma_targets,
        placement_targets: campaign.placement_targets
    };
    return [agentConfig, targeting_config];
}

var bootstrap_config = JSON.parse(jsonminify(fs.readFileSync('./config/rtbkit/bootstrap.json', 'utf8')));
var env_config = JSON.stringify({
    "zookeeper-uri": bootstrap_config["zookeeper-uri"],
    "carbon-uri": bootstrap_config["carbon-uri"]
});

mongo_connection.once('open', function(callback){
    var advertiserModels = new node_utils.mongodb.models.AdvertiserModels(mongo_connection,{readPreference: 'secondary'});
    advertiserModels.getNestedObjectById('553176cb469cbc6e40e28687', 'Campaign', function(err, campaign){
        var config_objs = getAgentConfig(campaign.parent_advertiser, campaign);
        var agentConfig = JSON.stringify(config_objs[0]);
        var targetingConfig = JSON.stringify(config_objs[1]);

        // spawn child process, i.e. spin up new bidding agent
        var agent = child_process.spawn('./bidding-agents/nodebidagent.js',[agentConfig,targetingConfig, env_config]);

        agent.stdout.on('data', function(data){
            var logline = data.toString();
            // hacky, I know.
            // log using bid method if logline begins with 'BID: '
            if (logline.indexOf(logging.BID_PREFIX) === 0){
                var meta = JSON.parse(logline.slice(logging.BID_PREFIX.length));

                // call logger method, pass campaign and advertiser in.
                logger.bid(meta, campaign, advertiser);
            } else {
                console.log(data.toString());
            }
        });

        agent.stderr.on('data', function(data){
            console.log(data.toString());
        });

    });
});