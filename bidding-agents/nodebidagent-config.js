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
 * Deserializes 'stringified' function
 *
 * @param str
 * @returns {Function}
 */
var deserializeFunction = function(str) {
    if (str && typeof str === "string" && str.substr(0,8) === "function") {
        var startBody = str.indexOf('{') + 1;
        var endBody = str.lastIndexOf('}');
        var startArgs = str.indexOf('(') + 1;
        var endArgs = str.indexOf(')');
        return new Function(str.substring(startArgs, endArgs), str.substring(startBody, endBody));
    } else {
        throw new Error('The following string cannot be deserialized to a valid JavaScript function: ' + str);
    }
};

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
var AgentConfig = exports.AgentConfig = function(coreConfig, targetingConfig, envConfig, helpers){
    this.envConfig = envConfig;
    this.targetingConfig = targetingConfig;
    this.coreConfig = coreConfig;
    this.helpers = helpers;
};

/**
 * Serializes into string to pass between parent & child processes
 */
AgentConfig.prototype.serialize = function(){
    // first have to serialize each function in helpers, store as string
    var helpers = {};
    for (var name in this.helpers){
        if (this.helpers.hasOwnProperty(name)){
            // final check to make sure it's a function,
            // otherwise just skip it
            if (typeof this.helpers[name] === 'function'){
                helpers[name] = this.helpers[name].toString();
            }
        }
    }
    return JSON.stringify({
        envConfig: this.envConfig,
        targetingConfig: this.targetingConfig,
        coreConfig: this.coreConfig,
        helpers: helpers
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
    // deserialize each function in helpers
    for (var name in conf.helpers){
        if (conf.helpers.hasOwnProperty(name)){
            conf.helpers[name] = deserializeFunction(conf.helpers[name]);
        }
    }
    return new AgentConfig(conf.coreConfig, conf.targetingConfig, conf.envConfig, conf.helpers)
};