#!/usr/bin/rtbkit-node

var RTBkit = require('./../rtbkit/bin/rtb');
var services_lib = require('./../rtbkit/bin/services');
var budgetController = require('./budget-controller');

//Parse configs from args
var agentConfig = JSON.parse(process.argv[2]);
var targetingConfig = JSON.parse(process.argv[3]);
var envConfig = JSON.parse(process.argv[4]);

/* ------------------ RTBKit Vars & Services --------------------*/

var zookeeperUri = envConfig["zookeeper-uri"], // must point to same Zookeeper as routers
    services = new services_lib.ServiceProxies(),
    accountAdded = false,
    interval,
    accountParent = agentConfig.account[0],
    accountFullName = agentConfig.account.join(":");
    
// uri,install name and location from bootstrap.json
services.useZookeeper(zookeeperUri,"rtb-test", "mtl");
// yes, we want to log to carbon
services.logToCarbon(envConfig["carbon-uri"]);

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

//----------------------------
// Agent Init & Event Handlers
//----------------------------

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
    // first filter modifiers to see if
    var filtered = modifiers.filter(function(obj){
        return obj._id == requestValue;
    });
    console.log("Filtered targeting objects: " + JSON.stringify(filtered, null,2));
    if (filtered.length == 1){
        var new_bid = bid * filtered[0].weight;
        console.log("Modified bid: " + new_bid);
        return new_bid
    } else if (filtered.length == 0){
        return bid;
    } else {
        console.log("ERROR: multiple matching criteria found in modifiers: "
        + JSON.stringify(filtered));
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
    for (var i=0; i<bids.length; i++){

        var spot = bidRequest.spots[i];
        var placementId = spot.tagid;

        // Linearly modify bid, starting with base bid
        var bid = targetingConfig.base_bid;
        console.log('Basebid: ' + bid);
        bid = modifyBid(bid, placementId, targetingConfig.placement_targets);
        bid = modifyBid(bid, bidRequest.location.metro, targetingConfig.dma_targets);
        bid = modifyBid(bid, bidRequest.location.countryCode, targetingConfig.country_targets);
        console.log('Bid after modifications' + bid);
        // cap at maxbid
        bid = Math.min(bid, targetingConfig.max_bid);
        console.log('Bid after capping:' + bid);

        // Take first creative from list of avail creatives, since
        // "creatives" here are really creative groups, and there should only
        // be one creative group per size per campaign
        var creativeIndex = bids[i].availableCreatives[0];

        // assume imp indexing is identical to spot indexing?
        var impid = bidRequest.imp[i].id;

        // Handle logging to parent here real quick
        // have to do most of the hardwork for logging here
        var meta = {
            uuid: bidRequest.user.id,
            auctionId: auctionId,
            bidid: [auctionId, impid].join(':'),
            impid: impid,
            bid: bid,
            placement: spot.tagid,
            creative_group: agentConfig.creatives[creativeIndex].tagId
        };
        // this is super hacky and I don't like it, but it works. Im sorry.
        console.log('BID ' + JSON.stringify(meta));

        // convert to RTBKit currency object
        var amount = new RTBkit.USD_CPM(bid);
        console.log("Amount after conversion to object:" + amount);

        var priority = 1; //I'm not really sure how core handles this, but default to 1

        // This part feels a little weird, unclear how this "bids" object is
        // supposed to behave, but you have to do this b/c agent.doBid only accepts
        // bids object which has been validated using the "bid" call.
        // The explanation for the C++ analog of this method is here:
        // https://github.com/rtbkit/rtbkit/wiki/How-to-write-a-bidding-agent
        bids.bid(i,creativeIndex, amount, priority); // spotId, creativeIndex, price, priority
    }
    agent.doBid(auctionId, bids, {}, wcm); // auction id, collection of bids, meta, win cost model.
    amount = null;
};

agent.onError = function(timestamp, description, message){
  logger.error('Bidding Agent sent something invalid to the router.', description, message);
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