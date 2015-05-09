var RTBkit = require('./../rtbkit/bin/rtb'),
    services_lib = require('./../rtbkit/bin/services'),
    budgetController = require('./budget-controller'),
    agentConfig = require('./nodebidagent-config').config;
    //config = require('config'),
    //winston = require('winston'),
    //node_utils = require('cliques_node_utils');
    //googleAuth = node_utils.google.auth;

/* -------------------  LOGGING ------------------- */

//var logfile = path.join(
//    process.env['HOME'],
//    'rtbkit_logs',
//    'nodebidagent',
//    util.format('nodebidagent_%s.log',node_utils.dates.isoFormatUTCNow())
//);

//var bq_config = bigQueryUtils.loadFullBigQueryConfig('../bq_config.json');
//var eventStreamer = new bigQueryUtils.BigQueryEventStreamer(bq_config,
//    googleAuth.DEFAULT_JWT_SECRETS_FILE,20);
//logger = new logging.BidderCLogger({
//    transports: [
//        new (winston.transports.Console)({timestamp:true}),
//        new (winston.transports.File)({filename:logfile,timestamp:true})
//        //new (winston.transports.RedisEventCache)({ eventStreamer: eventStreamer})
//    ]
//});


/* ------------------ RTBKit Vars --------------------*/

var zookeeperUri = "localhost:2181", // must point to same Zookeeper as routers
    services = new services_lib.ServiceProxies(),
    accountAdded = false,
    interval,
    accountParent = agentConfig.account[0],
    accountFullName = agentConfig.account.join(":");
    
// uri,install name and location from bootstrap.json
services.useZookeeper(zookeeperUri,"rtb-test", "mtl"); 

// yes, we want to log to carbon
services.logToCarbon('127.0.0.1:2003');

var addAccountHandler = function(err, res){
  if (err) {
    console.log("Error adding account "+accountFullName);
    //logger.error("Error adding account "+accountFullName);
    //logger.error(err);
    console.log(err);
  }
};
var topupErrorHandler = function(err, res){
  if (err) {
    // TODO: Handle an error topping up the account. 
    //logger.error("Error topping up "+accountFullName);
    console.log("Error topping up "+accountFullName);
    // shutdown with an error
    process.exit(1);
  }
};
// Keep the budget for this subaccount topped up
var pace = function(){
  if (!accountAdded){
    budgetController.addAccount(accountParent, addAccountHandler);
    accountAdded = true;
  }
  // Transfer 10 cents every time we pace
  budgetController.topupTransferSync(accountFullName, "USD/1M", 100000, topupErrorHandler);
};

var agent = new RTBkit.BiddingAgent("cliquesBidAgent", services);

//---------------------
// Agent Event Handlers 
//---------------------

// You can skip overriding some of these handlers by setting strictMode(false);

/**
 * Handles the actual bidding part.
 * @param timestamp
 * @param auctionId
 * @param bidRequest
 * @param bids
 * @param timeAvailableMs
 * @param augmentations
 * @param wcm
 */
agent.onBidRequest = function(timestamp, auctionId, bidRequest, bids, timeAvailableMs, augmentations, wcm){
    var amount = new RTBkit.MicroUSD(100);
    var targeting = {
        "country_targets": [],
        "dma_target": [],
        "placement_targets": [
            {
                "weight": 2,
                "_id": "553176cb469cbc6e40e28688"
            }
        ]
    };
    var base_bid = 5;
    var max_bid = 9;
    for (var i=0; i<bids.length; i++){
        bids.bid(i,bids[i].availableCreatives[0],amount,1); // spotId, creativeIndex, price, priority
    }
    agent.doBid(auctionId, bids, {}, wcm); // auction id, collection of bids, meta, win cost model.
    amount = null;
};

agent.onError = function(timestamp, description, message){
  logger.error('Bidding Agent sent something invalid to the router.', description, message);
};

// the agent won a bid. secondPrice contains the win price
agent.onWin = function(timestamp, confidence, auctionId, spotNum, secondPrice, bidRequest, ourBid, accountInfo, metadata, augmentations, uids){
  //logger.info("WIN", {
  //    type: "WIN",
  //    timestamp: timestamp,
  //    confidence: confidence,
  //    auctionId: auctionId,
  //    spotNum: spotNum,
  //    secondPrice: secondPrice,
  //    bidRequest: bidRequest,
  //    ourBid: ourBid,
  //    accountInfo: accountInfo,
  //    metadata: metadata,
  //    augmentations: augmentations,
  //    uids: uids
  //});
  console.log("WIN");
};

// the auction was not won by this agent
agent.onLoss = function(timestamp, confidence, auctionId, spotNum, secondPrice, bidRequest, ourBid, accountInfo, metadata){
    //logger.info("LOSS", {
    //    type: "LOSS",
    //    timestamp: timestamp,
    //    confidence: confidence,
    //    auctionId: auctionId,
    //    spotNum: spotNum,
    //    secondPrice: secondPrice,
    //    bidRequest: bidRequest,
    //    ourBid: ourBid,
    //    accountInfo: accountInfo,
    //    metadata: metadata
    //});
    console.log("LOSS");
};

// an invalid bid has been sent back to the router
agent.onInvalidBid = function(timestamp, confidence, auctionId, spotNum, secondPrice, bidRequest, ourBid, accountInfo, metadata, augmentations, uids){
    //logger.info("INVALID-BID", {
    //    type: "INVALID-BID",
    //    timestamp: timestamp,
    //    confidence: confidence,
    //    auctionId: auctionId,
    //    spotNum: spotNum,
    //    secondPrice: secondPrice,
    //    bidRequest: bidRequest,
    //    ourBid: ourBid,
    //    accountInfo: accountInfo,
    //    metadata: metadata,
    //    augmentations: augmentations,
    //    uids: uids
    //});
    console.log("INVALID-BID");
};

// a bid was placed by this bid agent after the router had sent its bids back to the exchange
agent.onTooLate = function(timestamp, confidence, auctionId, spotNum, secondPrice, bidRequest, ourBid, accountInfo, metadata, augmentations, uids){
    //logger.info("TOO-LATE", {
    //    type: "TOO-LATE",
    //    timestamp: timestamp,
    //    confidence: confidence,
    //    auctionId: auctionId,
    //    spotNum: spotNum,
    //    secondPrice: secondPrice,
    //    bidRequest: bidRequest,
    //    ourBid: ourBid,
    //    accountInfo: accountInfo,
    //    metadata: metadata,
    //    augmentations: augmentations,
    //    uids: uids
    //});
    console.log("TOO-LATE");
};

// not sufficient budget available for this agent to bid the price it has chosen
agent.onNoBudget = function(timestamp, confidence, auctionId, spotNum, secondPrice, bidRequest, ourBid, accountInfo, metadata, augmentations, uids){
    //logger.info("NO-BUDGET", {
    //    type: "NO-BUDGET",
    //    timestamp: timestamp,
    //    confidence: confidence,
    //    auctionId: auctionId,
    //    spotNum: spotNum,
    //    secondPrice: secondPrice,
    //    bidRequest: bidRequest,
    //    ourBid: ourBid,
    //    accountInfo: accountInfo,
    //    metadata: metadata,
    //    augmentations: augmentations,
    //    uids: uids
    //});
    console.log("NO-BUDGET");
};

// the auction dropped this bid. usually happens if the auctionId is unknown
// or if the bid was delayed for too long.
agent.onDroppedBid = function(timestamp, confidence, auctionId, spotNum, secondPrice, bidRequest, ourBid, accountInfo, metadata, augmentations, uids){
    //logger.info("DROPPED-BID", {
    //    type: "DROPPED-BID",
    //    timestamp: timestamp,
    //    confidence: confidence,
    //    auctionId: auctionId,
    //    spotNum: spotNum,
    //    secondPrice: secondPrice,
    //    bidRequest: bidRequest,
    //    ourBid: ourBid,
    //    accountInfo: accountInfo,
    //    metadata: metadata,
    //    augmentations: augmentations,
    //    uids: uids
    //});
    console.log("DROPPED-BID");
};

// respond to the router when pinged.
agent.onPing = function(router,timesent,args){
  var timereceived = new Date();
  agent.doPong(router, timesent, timereceived, args);
  timereceived = null;
};

//agent.onImpression = function(timestamp, auctionId, spotId, spotIndex, bidRequest, bidMeta, winMeta, impressionMeta, clickMeta, augmentations, visits){
//  console.log("IMPRESSION");
//}
//
//agent.onVisit = function(timestamp, auctionId, spotId, spotIndex, bidRequest, bidMeta, winMeta, impressionMeta, clickMeta, augmentations, visits){
//  console.log("VISIT");
//}
//
//agent.onClick = function(timestamp, auctionId, spotId, spotIndex, bidRequest, bidMeta, winMeta, impressionMeta, clickMeta, augmentations, visits){
//  console.log("CLICK");
//}

//-------------------------
// END Agent Event Handlers
//-------------------------

//-------------------------
// Initialize agent
//-------------------------
agent.init();
agent.start();

agent.doConfig(agentConfig);
// Start pacing the budget inflow for this bid agent
pace();
interval = setInterval(pace,10000);