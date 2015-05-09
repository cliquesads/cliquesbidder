var node_utils = require('cliques_node_utils');
var tags = node_utils.tags;
process.env['NODE_CONFIG_DIR'] = '../config';
var config = require('config');
var util = require('util');

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
    return [config, targeting_config];
}

exports.getAgentConfig = getAgentConfig;

// TESTING

//// Build the connection string
//var exchangeMongoURI = util.format('mongodb://%s:%s/%s',
//    config.get('Exchange.mongodb.exchange.secondary.host'),
//    config.get('Exchange.mongodb.exchange.secondary.port'),
//    config.get('Exchange.mongodb.exchange.db'));
//var exchangeMongoOptions = {
//    user: config.get('Exchange.mongodb.exchange.user'),
//    pass: config.get('Exchange.mongodb.exchange.pwd'),
//    auth: {authenticationDatabase: config.get('Exchange.mongodb.exchange.db')}
//};
//var EXCHANGE_CONNECTION = node_utils.mongodb.createConnectionWrapper(exchangeMongoURI, exchangeMongoOptions, function(err, logstring){
//    if (err) throw err;
//    console.log(logstring);
//});
//
//EXCHANGE_CONNECTION.once('open', function(callback){
//    var advertiser_models = new node_utils.mongodb.models.AdvertiserModels(EXCHANGE_CONNECTION,{readPreference: 'secondary'});
//    advertiser_models.getNestedObjectById('553176cb469cbc6e40e28687', 'Campaign', function(err, campaign){
//       console.log(JSON.stringify(campaignObjectToConfig(campaign.parent_advertiser, campaign), null, 2))
//    });
//});

//curl http://localhost:9985/v1/accounts/553176cb469cbc6e40e28689
