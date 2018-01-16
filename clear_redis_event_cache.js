/**
 * Created by bliang on 6/6/15.
 */
var node_utils = require('@cliques/cliques-node-utils');
var config = require('config');
var transports = node_utils.transports;
var bigQueryUtils = node_utils.google.bigQueryUtils;
var googleAuth = node_utils.google.auth;

const adEventDataset = config.get("Bidder.logger.bigQuery.adEventDataset");
const httpEventDataset = config.get("Bidder.logger.bigQuery.httpEventDataset");
var bq_config = bigQueryUtils.loadFullBigQueryConfig('./bq_config.json', httpEventDataset, adEventDataset);
var eventStreamer = new bigQueryUtils.BigQueryEventStreamer(bq_config,
    googleAuth.DEFAULT_JWT_SECRETS_FILE,5);
var redisEventCache = new transports.RedisEventCache({ eventStreamer: eventStreamer, redis_port: 6380 });
redisEventCache.clearZombieEventCaches(function(err){
    if (err) return console.error(err);
    process.exit(0);
});