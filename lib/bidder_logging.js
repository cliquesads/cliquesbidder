var cliques_node_utils = require('cliques_node_utils');
var logging = cliques_node_utils.logging;
var util = require('util');
var uuid = require('uuid');

/**
 * Exchange-specific CLogger subclass...which itself is a subclass of winston.logger
 *
 * @param options winston logger options object
 * @constructor
 */
function BidderCLogger(options){
    logging.CLogger.call(this, options);
}
util.inherits(BidderCLogger, logging.CLogger);

var BID_PREFIX = exports.BID_PREFIX = 'BID ';

/**
 * Logs Bid event.
 *
 * Sort of trivial method as-is but separated out anyway just by habit,
 * and in case logic gets more complex.
 *
 * @param meta
 * @param campaign
 * @param advertiser
 * @returns {*}
 */
BidderCLogger.prototype.bid = function(meta, campaign, advertiser){
    meta.type = 'BID';
    // override bidid, which is just a concatenation of auctionid and impid
    meta.bidid   = uuid.v4();
    meta.campaign = campaign.id;
    meta.advertiser = advertiser.id;
    meta.adv_clique = campaign.clique;
    this.info(BID_PREFIX, meta);
};

exports.BidderCLogger = BidderCLogger;