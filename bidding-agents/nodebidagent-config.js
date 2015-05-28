/**
 * Very lightweight class to centralize baker account naming taxonomy
 *
 * @param campaign_id ObjectID from mongo of Campaign object
 * @constructor
 * @class
 */
var BidAgentAccount = function(campaign_id){
    var PACER_ACCONT_NAME = exports.PACER_ACCOUNT_NAME = 'pacerAccount';
    this.accountArray           = [campaign_id, PACER_ACCONT_NAME];
    this.accountName            = this.accountArray.join(':');
    this.campaignAccountName    = campaign_id;
};
BidAgentAccount.fromArray = function(accountArray){
    return new BidAgentAccount(accountArray[0]);
};
exports.BidAgentAccount = BidAgentAccount;


/**
 * Lightweight class to centralize serialization/deserialization methods
 * for bidder agent configs.
 *
 * It's sort of trivial now but since it's a crucial part of the layer
 * of communication between controller and agent, it seemed logical to split
 * it into a shared class.  Was getting yucky trying to handle it
 * in both modules.
 *
 * TODO: Could add validation here in the future
 *
 * @param {Object} envConfig required
 * @param {String} envConfig.zookeeper-uri uri for zookeeper endpoints
 * @param {String} envConfig.carbon-uri uri for carbon endpoints
 * @param {Object} coreConfig
 * @param {Object} targetingConfig
 * @type {Function}
 */
var AgentConfig = exports.AgentConfig = function(coreConfig, targetingConfig, envConfig){
    this.envConfig = envConfig;
    this.targetingConfig = targetingConfig;
    this.coreConfig = coreConfig;
};

/**
 * Serializes into string to pass between parent & child processes
 */
AgentConfig.prototype.serialize = function(){
    return JSON.stringify({
        envConfig: this.envConfig,
        targetingConfig: this.targetingConfig,
        coreConfig: this.coreConfig
    });
};

/**
 * Deserializes from string, returns a new AgentConfig object
 *
 * Static method
 *
 * @param serialized_config
 * @returns {AgentConfig}
 */
AgentConfig.deserialize = function(serialized_config){
    var conf = JSON.parse(serialized_config);
    return new AgentConfig(conf.coreConfig, conf.targetingConfig, conf.envConfig)
};