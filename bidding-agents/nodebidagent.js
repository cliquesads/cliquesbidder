#!/usr/bin/rtbkit-node

var RTBkit = require('./../rtbkit/bin/rtb');
var services_lib = require('./../rtbkit/bin/services');
var CampaignBudgetController = require('./budget-controller').CampaignBudgetController;

//================================================================//
//================ PARSE INITIAL CONFIGURATION ===================//
//================================================================//

var AgentConfig = require('./nodebidagent-config').AgentConfig;

// First get configs from args on startup
var agentConfig = AgentConfig.deserialize(process.argv[2]);
var coreConfig = agentConfig.coreConfig;
var targetingConfig = agentConfig.targetingConfig;
var envConfig = agentConfig.envConfig;
var configHelpers = agentConfig.helpers;


//================================================================//
//================== RTBKIT VARS & SERVICES ======================//
//================================================================//

var zookeeperUri = envConfig["zookeeper-uri"], // must point to same Zookeeper as routers
    services = new services_lib.ServiceProxies(),
    //accountAdded = false,
    interval;
    
// uri,install name and location from bootstrap.json
services.useZookeeper(zookeeperUri,"rtb-test", "mtl");
// yes, we want to log to carbon
services.logToCarbon(envConfig["carbon-uri"]);


//==================================================================//
//================= INITIALIZE BUDGET CONTROLLER ===================//
//==================================================================//

var INTERVAL_IN_MS = 15000; //interval to set for pacer in milliseconds
var budgetController = new CampaignBudgetController(coreConfig.account, INTERVAL_IN_MS);
budgetController.configure_and_run(agentConfig);

//================================================================//
//================ AGENT INIT & EVENT HANDLERS ===================//
//================================================================//

var agent = new RTBkit.BiddingAgent("cliquesBidAgent", services);
// You can skip overriding some of these handlers by setting strictMode(false);

//The maximum is exclusive and the minimum is inclusive
function _getRandomInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min)) + min;
}

/**
 * Determines amount & priority for bid for an individual impression, and logs
 * each bid as well to stdout.
 *
 * @param spotIndex
 * @param auctionId
 * @param bidRequest
 * @param bids
 */
var getBidArgs = function(spotIndex, auctionId, bidRequest, bids){

    // Note: "spots" are the internal shorthand for impressions. Why that is I have no idea,
    // but they're used pretty interchangeably throughout RTBKit.
    var spot = bidRequest.spots[spotIndex];
    // Take first creative from list of avail creatives, since
    // "creatives" here are really creative groups, and there should only
    // be one creative group per size per campaign
    var creativeIndex = bids[0].availableCreatives[0];
    var creativeConfig = coreConfig.creatives[creativeIndex];

    //================================================================//
    //===================== BEGIN JANKY FILTERS ======================//
    //================================================================//
    // badv is not actually an array but an array-like object, so have to convert it
    var badv = Array.prototype.slice.call(bidRequest.restrictions.badv);
    // TODO: Filters for bids that really should be proper Filter components
    if (badv.indexOf(creativeConfig.providerConfig.cliques.adomain[0]) > -1) {
        return;
    }

    // Somehow bidRequest.site is undefined,
    // have to use the following trick to retrieve bidRequest.site
    var copiedBidRequest = JSON.parse(JSON.stringify(bidRequest));
    var pageKeywords;
    if (!copiedBidRequest.site.keywords) {
        pageKeywords = [];
    } else {
        pageKeywords = copiedBidRequest.site.keywords.split(',');
    }
 
    // Check if the page contains keyword that is blocked by current bid request
    var isKeywordBlocked = configHelpers["getKeywordBlockStatus"](pageKeywords, targetingConfig.blocked_keywords);
    if (isKeywordBlocked) {
        return;
    }
    
    var branch = Array.prototype.slice.call(bidRequest.imp[spotIndex].ext.branch);
    var isBlocked = configHelpers["getInventoryBlockStatus"](branch, targetingConfig.blocked_inventory);
    if (isBlocked){
        return;
    }

    var geoBranch = [
        bidRequest.location.countryCode,
        bidRequest.location.countryCode + '-' + bidRequest.location.regionCode,
        bidRequest.location.cityName
    ];
    var isGeoBlocked = configHelpers["getGeoBlockStatus"](geoBranch, targetingConfig.blocked_geos, targetingConfig.target_only_geos);
    if (isGeoBlocked) {
        return;
    }

    var isDmaBlocked = configHelpers["getDmaBlockStatus"](Number(copiedBidRequest.location.metro), targetingConfig.blocked_dmas, targetingConfig.target_only_dmas);
    if (isDmaBlocked) {
        return;
    }

    //================================================================//
    //===================== BEGIN BID MODIFIERS ======================//
    //================================================================//
    // Linearly modify bid, starting with base bid
    var bid = targetingConfig.base_bid;
    var inventoryWeight = configHelpers["getInventoryWeight"](branch, targetingConfig.inventory_targets);
    bid = inventoryWeight * bid;

    var geoWeight = configHelpers["getGeoWeight"](geoBranch, targetingConfig.geo_targets);
    bid = geoWeight * bid;

    var dmaWeight = configHelpers["getDmaWeight"](Number(copiedBidRequest.location.metro), targetingConfig.dma_targets);
    bid = dmaWeight * bid;

    var bidKeywordInfo = configHelpers["getKeywordWeight"](pageKeywords, targetingConfig.keyword_targets);
    if (bidKeywordInfo.keyword !== '') {
        bid = bidKeywordInfo.weight * bid; 
    }

    bid = Math.min(bid, targetingConfig.max_bid);

    // Don't bid if bid is zero
    if (bid === 0){
        return;
    }

    //================================================================//
    //====================== LOGGING & PARSING =======================//
    //================================================================//

    // assume imp indexing is identical to spot indexing?
    var impid = bidRequest.imp[spotIndex].id;

    // Handle logging to parent here real quick
    // have to do most of the hardwork for logging here
    var meta = {
        uuid: bidRequest.user.id,
        auctionId: auctionId,
        //bidid: [auctionId, impid].join(':'),
        impid: impid,
        bid: bid,
        placement: spot.tagid,
        creative_group: creativeConfig.tagId,
    };
    if (bidKeywordInfo.keyword !== '') {
        meta.bid_keyword = bidKeywordInfo.keyword;
    }
    // this is super hacky and I don't like it, but it works. Im sorry.
    console.log('BID ' + JSON.stringify(meta));

    //====================================================================//
    //============================ CREATE BID ============================//
    //====================================================================//

    // convert to RTBKit currency object
    var amount = new RTBkit.USD_CPM(bid);

    // "randomize" priority ONLY to "randomize" bids that win
    // in the event of a tie.
    // TODO: Should investigate how core handles priority further, unclear
    // TODO: if this will have unintended consequences to the internal auction beyond
    // TODO: tie-breaking
    var priority = _getRandomInt(1,10);

    // agent.doBid only accepts bids object which has been validated using the "bid" call.
    return {
        creativeIndex: creativeIndex,
        amount: amount,
        priority: priority
    }
};

/**
 * Handles the actual bidding part.
 *
 * @param timestamp
 * @param auctionId
 * @param bidRequest
 * @param bids
 * @param timeAvailableMs
 * @param augmentations
 * @param wcm
 */
agent.onBidRequest = function(timestamp, auctionId, bidRequest, bids, timeAvailableMs, augmentations, wcm){

    function _addBidtoBidsObject(spotIndex){
        var bidArgs = getBidArgs(spotIndex, auctionId, bidRequest, bids);
        if (bidArgs) {
            bids.bid(spotIndex, bidArgs.creativeIndex, bidArgs.amount, bidArgs.priority);
        }
    }

    // if multiple imp bid request is received, check to whether
    // multiBid is enabled, and if so loop over all spots to determine bid
    if (bidRequest.imp.length > 1){
        // if multiBid is set to true, loop over all spots / imps and bid for all of them as applicable
        if (targetingConfig.multi_bid){
            for (var i=0; i<bidRequest.imp.length; i++) {
                _addBidtoBidsObject(i);
            }
        // if not, only bid for one of them by randomly selecting integer in index range
        } else {
            var rand = _getRandomInt(0, bidRequest.imp.length);
            _addBidtoBidsObject(rand);
        }
    } else {
        // otherwise, just bid for zero-th impression.
        _addBidtoBidsObject(0);
    }

    // Finally, submit the bid(s)
    agent.doBid(auctionId, bids, {}, wcm);
};

agent.onError = function(timestamp, description, message){
  process.stderr.write('Bidding Agent sent something invalid to the router.', description, message);
};

// the agent won a bid. secondPrice contains the win price
agent.onWin = function(timestamp, confidence, auctionId, spotNum, secondPrice, bidRequest, ourBid, accountInfo, metadata, augmentations, uids){
  var meta = {
      type: "WIN",
      timestamp: timestamp,
      confidence: confidence,
      auctionId: auctionId,
      spotNum: spotNum,
      secondPrice: secondPrice,
      bidRequest: bidRequest,
      ourBid: ourBid,
      accountInfo: accountInfo,
      metadata: metadata,
      augmentations: augmentations,
      uids: uids
  };
  console.log("WIN :" + JSON.stringify(meta));
};

agent.onClick = function(timestamp, auctionId, spotId, spotIndex, bidRequest, bidMeta, winMeta, impressionMeta, clickMeta, augmentations, visits){
    var meta = {
        type: "CLICK",
        timestamp: timestamp,
        auctionId: auctionId,
        spotId: spotId,
        spotIndex: spotIndex,
        bidRequest: bidRequest,
        bidMeta: bidMeta,
        winMeta: winMeta,
        impressionMeta: impressionMeta,
        clickMeta: clickMeta,
        augmentations: augmentations,
        visits: visits
    };
    console.log("CLICK: " + JSON.stringify(meta));
};

// the auction was not won by this agent
agent.onLoss = function(timestamp, confidence, auctionId, spotNum, secondPrice, bidRequest, ourBid, accountInfo, metadata){
    var meta = {
        type: "LOSS",
        timestamp: timestamp,
        confidence: confidence,
        auctionId: auctionId,
        spotNum: spotNum,
        secondPrice: secondPrice,
        bidRequest: bidRequest,
        ourBid: ourBid,
        accountInfo: accountInfo,
        metadata: metadata
    };
    console.log("LOSS :" + JSON.stringify(meta));
};

// an invalid bid has been sent back to the router
agent.onInvalidBid = function(timestamp, confidence, auctionId, spotNum, secondPrice, bidRequest, ourBid, accountInfo, metadata, augmentations, uids){
    var meta = {
        type: "INVALID-BID",
        timestamp: timestamp,
        confidence: confidence,
        auctionId: auctionId,
        spotNum: spotNum,
        secondPrice: secondPrice,
        bidRequest: bidRequest,
        ourBid: ourBid,
        accountInfo: accountInfo,
        metadata: metadata,
        augmentations: augmentations,
        uids: uids
    };
    console.log("INVALID-BID :" + JSON.stringify(meta));
};

// a bid was placed by this bid agent after the router had sent its bids back to the exchange
agent.onTooLate = function(timestamp, confidence, auctionId, spotNum, secondPrice, bidRequest, ourBid, accountInfo, metadata, augmentations, uids){
    var meta = {
        type: "TOO-LATE",
        timestamp: timestamp,
        confidence: confidence,
        auctionId: auctionId,
        spotNum: spotNum,
        secondPrice: secondPrice,
        bidRequest: bidRequest,
        ourBid: ourBid,
        accountInfo: accountInfo,
        metadata: metadata,
        augmentations: augmentations,
        uids: uids
    };
    console.log("TOO-LATE:" + JSON.stringify(meta));
};

// not sufficient budget available for this agent to bid the price it has chosen
agent.onNoBudget = function(timestamp, confidence, auctionId, spotNum, secondPrice, bidRequest, ourBid, accountInfo, metadata, augmentations, uids){
    var meta = {
        type: "NO-BUDGET",
        timestamp: timestamp,
        confidence: confidence,
        auctionId: auctionId,
        spotNum: spotNum,
        secondPrice: secondPrice,
        bidRequest: bidRequest,
        ourBid: ourBid,
        accountInfo: accountInfo,
        metadata: metadata,
        augmentations: augmentations,
        uids: uids
    };
    console.log("NO-BUDGET:" + JSON.stringify(meta));
};

// the auction dropped this bid. usually happens if the auctionId is unknown
// or if the bid was delayed for too long.
agent.onDroppedBid = function(timestamp, confidence, auctionId, spotNum, secondPrice, bidRequest, ourBid, accountInfo, metadata, augmentations, uids){
    var meta = {
        type: "DROPPED-BID",
        timestamp: timestamp,
        confidence: confidence,
        auctionId: auctionId,
        spotNum: spotNum,
        secondPrice: secondPrice,
        bidRequest: bidRequest,
        ourBid: ourBid,
        accountInfo: accountInfo,
        metadata: metadata,
        augmentations: augmentations,
        uids: uids
    };
    console.log("DROPPED-BID:" + JSON.stringify(meta));
};

// respond to the router when pinged.
agent.onPing = function(router,timesent,args){
  var timereceived = new Date();
  agent.doPong(router, timesent, timereceived, args);
  timereceived = null;
};

agent.init();
agent.start();
agent.doConfig(coreConfig);


//=======================================================================//
//=========== LISTENERS FOR MSGS/SIGNALS FROM PARENT PROCESS ============//
//=======================================================================//

// add listener for config changes passed by controller
process.stdin.resume();
process.stdin.on('data', function(data){
    agentConfig = AgentConfig.deserialize(data);
    coreConfig = agentConfig.coreConfig;
    targetingConfig = agentConfig.targetingConfig;
    // send new config to core
    agent.doConfig(coreConfig);

    // reconfigure budgetController and run
    budgetController.configure_and_run(agentConfig);
});

// Handle kill signal sent by controller, shut down BidAgent
// to clear its state
process.on('SIGUSR2', function(){
    agent.close();
    console.log('bidAgent closed, now exiting process.');
    process.exit(0);
});
