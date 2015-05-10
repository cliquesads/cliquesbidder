var node_utils = require('cliques_node_utils');
var tags = node_utils.tags;
var config = require('config');
var winston = require('winston');
var util = require('util');
var fs = require('fs');
var jsonminify = require('jsonminify');
var child_process = require('child_process');

//var googlepis = require('googleapis');

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
    logger.info(logstring);
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
    campaign.creativegroups.forEach(function(crg){
        config.creatives.push({
            format: { width: crg.w, height: crg.h },
            id: crg.id,
            name: crg.name,
            tagId: crg.id, //don't know why this is necessary, don't even know what it means
            providerConfig: {
                cliques: {
                    adm: tag.render(crg),
                    adomain: [advertiser.website]
                }
            }
        });
    });
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
var env_config = {
    "zookeeper-uri": bootstrap_config["zookeeper-uri"],
    "carbon-uri": bootstrap_config["carbon-uri"]
};

mongo_connection.once('open', function(callback){
    var advertiserModels = node_utils.mongodb.models.AdvertiserModels(mongo_connection,{readPreference: 'secondary'});
    advertiserModels.getNestedObjectById('553176cb469cbc6e40e28687', 'Campaign', function(err, campaign){
        var config_objs = getAgentConfig(campaign.parent_advertiser, campaign);
        var agent = child_process.spawn('./rtbkit/bin/node ./bidding-agents/nodebidagent.js',
            [JSON.stringify(config_objs[0]), JSON.stringify(config_objs[1]), JSON.stringify(env_config)]);
        agent.stdout.on('data', function(data){
            console.log(data);
        });
    });
});