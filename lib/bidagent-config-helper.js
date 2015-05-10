var node_utils = require('cliques_node_utils');
var tags = node_utils.tags;
process.env['NODE_CONFIG_DIR'] = '../config';
var config = require('config');
var util = require('util');



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
