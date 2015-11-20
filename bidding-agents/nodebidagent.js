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

/**
 * Linearly modifies an original starting bid according to weights specified
 * in targeting config, and value of given parameter present in bid request
 *
 * Assumes "modifiers" is campaign config field value composed by the
 * "weightTargetingSchema" in mongoose Models.
 *
 * @param bid
 * @param requestValue
 * @param modifiers
 */
function modifyBid(bid, requestValue, modifiers){
    if (modifiers){
        // first filter modifiers to see if
        var filtered = modifiers.filter(function(obj){
            return obj.target.toString() == requestValue;
        });
        //console.log("Filtered targeting objects: " + JSON.stringify(filtered, null,2));
        if (filtered.length == 1){
            return bid * filtered[0].weight;
        } else if (filtered.length == 0){
            return bid;
        } else {
            console.log("ERROR: multiple matching criteria found in modifiers: "
            + JSON.stringify(filtered));
        }
    } else {
        return bid;
    }
}

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
    // Loop over bids in case there are multiple "spots" per bid request
    // Currently, there are not, Cliques Exchange is set up to send one "spot"
    // (i.e. placement) per bid request, so this is a bit unnecessary.
    // But keeping this in here for future use in case this changes.
    //for (var i=0; i<bids.length; i++){

    //console.log(JSON.stringify(bidRequest, null, 2));

    var spot = bidRequest.spots[0];
    var placementId = spot.tagid;
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
    //Assume only one clique per page, even though OpenRTB allows for multiple IAB Categories
    //var page_clique = Array.prototype.slice.call(bidRequest.site.pagecat)[0];
    //if (targetingConfig.blocked_cliques.indexOf(page_clique) > -1){
    //    return;
    //}
    console.log(JSON.stringify(bidRequest.segments["page-iab-categories"], null, 2));

    //================================================================//
    //===================== BEGIN BID MODIFIERS ======================//
    //================================================================//
    // Linearly modify bid, starting with base bid
    var bid = targetingConfig.base_bid;
    bid = modifyBid(bid, placementId, targetingConfig.placement_targets);
    bid = modifyBid(bid, bidRequest.device.geo.metro, targetingConfig.dma_targets);
    bid = modifyBid(bid, bidRequest.device.geo.country, targetingConfig.country_targets);
    bid = Math.min(bid, targetingConfig.max_bid);


    //================================================================//
    //====================== LOGGING & PARSING =======================//
    //================================================================//

    // assume imp indexing is identical to spot indexing?
    var impid = bidRequest.imp[0].id;

    // Handle logging to parent here real quick
    // have to do most of the hardwork for logging here
    var meta = {
        uuid: bidRequest.user.id,
        auctionId: auctionId,
        //bidid: [auctionId, impid].join(':'),
        impid: impid,
        bid: bid,
        placement: spot.tagid,
        creative_group: creativeConfig.tagId
    };
    // this is super hacky and I don't like it, but it works. Im sorry.
    console.log('BID ' + JSON.stringify(meta));

    //================================================================//
    //============================ DO BID ============================//
    //================================================================//

    // convert to RTBKit currency object
    var amount = new RTBkit.USD_CPM(bid);
    //console.log("Amount after conversion to object:" + amount);

    var priority = 1; //I'm not really sure how core handles this, but default to 1

    // This part feels a little weird, unclear how this "bids" object is
    // supposed to behave, but you have to do this b/c agent.doBid only accepts
    // bids object which has been validated using the "bid" call.
    // The explanation for the C++ analog of this method is here:
    // https://github.com/rtbkit/rtbkit/wiki/How-to-write-a-bidding-agent
    bids.bid(0,creativeIndex, amount, priority); // spotId, creativeIndex, price, priority
    //}
    agent.doBid(auctionId, bids, {}, wcm); // auction id, collection of bids, meta, win cost model.
    amount = null;
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
