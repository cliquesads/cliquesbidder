var cliques_node_utils = require('cliques_node_utils');
var logging = cliques_node_utils.logging;
var util = require('util');

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

/**
 * Logs Win Notice event.
 *
 * @param err any error in sending & receiving win notice
 * @param auctionId
 * @param bidRequest
 * @param bids
 * @param timeAvailableMs
 * @param augmentations
 * @param wcm
 * @returns {*}
 */
//BidderCLogger.prototype.bid = function(err, auctionId, bidRequest, bids, timeAvailableMs, augmentations, wcm){
//    var bid_meta = {
//        type: 'BID',
//        auctionId: auctionId,
//
//    };
//    if (err){
//        // log server error
//        var errormsg = "WIN-NOTICE ERROR sending win notice";
//        return this.error(errormsg, win_notice_meta)
//    }
//    if (win_notice_response.statusCode != 200){
//        // handle HTTP errors in sending win notice
//        if (body.constructor === {}.constructor){
//            body = JSON.stringify(body)
//        }
//        errormsg = 'HTTP Error on win notice, Status Code '
//            + win_notice_response.statusCode + ': ' + body;
//        this.error(errormsg, win_notice_meta);
//    } else {
//        // handle success
//        this.info("WIN-NOTICE", win_notice_meta);
//    }
//};

exports.BidderCLogger = BidderCLogger;