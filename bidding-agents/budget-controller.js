/**
 * Utilities to communicate with RTBKit Master Banker and control bidagent budget.
 */

//TODO: Would love to use a REST client wrapper like node-rest-api but npm is completely
//TODO: non-function in RTBKit Node.js.  So I just have to write a custom one.

var http = require("http");
var querystring = require("querystring");
var url = require('url');

/**
 * Wrapper for the MasterBanker REST API.
 *
 * @param {AgentConfig} agentConfig instance of AgentConfig class
 * @param {Object} options
 * @param {String} [options.hostname='localhost'] API hostname
 * @param {String} [options.apiVersion='v1'] API version
 * @param {Number} [options.port] API port number
 * @class
 */
BudgetController = exports.BudgetController = function(agentConfig, options){
    options         = options || {};
    this.hostname   = options.host || "localhost";
    this.apiVersion = options.apiVersion || "v1";
    this.port       = options.port || 9985;

    // parse relevant agentConfig variables for convenience;
    this.agentConfig    = agentConfig;
    this.accountsArray  = this.agentConfig.coreConfig.account;
    this.budget         = this.agentConfig.targetingConfig.budget;
    this.start_date     = this.agentConfig.targetingConfig.start_date;
    this.end_date       = this.agentConfig.targetingConfig.end_date;
    this.even_pacing    = this.agentConfig.targetingConfig.even_pacing;

    // Only two root paths in V1 API
    // Add _getRequestOptions functions pre-populated with collection paths
    // of each respective key
    var self = this;
    this.collections = {
        accounts: {
            getRequestOptions: self._requestOptionsDecorator('accounts')
        },
        summary: {
            getRequestOptions: self._requestOptionsDecorator('summary')
        }
    };
};

/**
 * Simple decorator for this._getRequest options to capture collection path
 * in closure.
 *
 * @param collection_path
 * @returns {Function}
 * @private
 */
BudgetController.prototype._requestOptionsDecorator = function(collection_path){
    var self = this;
    return function(options){
        return self._getRequestOptions(collection_path, options);
    };
};

/**
 * Helper function to take boilerplate code out of request options generation.
 *
 * Takes a simplified options object and transforms to full options object
 * to pass to http.request
 *
 * @param {String} collection_path base API path
 * @param {Object} options simplified options object specific to this instance
 * @param {String} [options.method='GET'] http method, defaults to 'GET'
 * @param {String} [options.path] path relative to collection path, not including leading '/'
 * @param {Object} [options.query] query object, e.g. {k: 'v', k2: 'v2'}
 * @param {Object} [options.headers] any additional headers to pass into request
 * @returns {Object} Augmented options object to pass to http.request
 * @private
 */
BudgetController.prototype._getRequestOptions = function(collection_path, options){
    var method  = options.method || 'GET';
    var query   = options.query;
    var path    = options.path;
    var headers = options.headers;

    path = ['',this.apiVersion, collection_path, path].join('/');
    path = [path, querystring.stringify(query)].join('?');

    var new_options = {
        path:       path,
        hostname:   this.hostname,
        port:       this.port,
        method:     method
    };
    if (headers){
        new_options.headers = headers
    }
    return new_options;
};

//
/**
 * addAccount does a POST to /vi/accounts?accountType=budget&accountName=<accountName>
 * @param accountName
 * @param callback
 */
BudgetController.prototype.addAccount = function(accountName, callback){
    var options = this.collections.accounts.getRequestOptions({
        method: 'POST',
        query: {
            accountType: 'budget',
            accountName: accountName
        }
    });
    var req = http.request(options, function(res){
        if (res.statusCode == "400"){
            console.log("Add account ERROR 400");
        }
        callback(null, res);
    });

    req.on("error", function(e){
        console.log(e.message);
    });
    req.end();
};

/**
 * Does a PUT {currency:amount} to /v1/accounts/<account>/balance?accountType=budget
 * @param accountName
 * @param currency
 * @param amount
 * @param callback
 */
BudgetController.prototype.addBalanceToChildAccount = function(accountName, currency, amount, callback){
    var put_data = {};
    put_data[accountName] = currency;
    put_data = JSON.stringify(put_data);

    var options = self.collections.accounts.getRequestOptions({
        headers : {
            "Content-Type":"application/json",
            "Content-Length":put_data.length
        },
        path: [accountName, balance].join('/'),
        query: {
            accountType: 'budget'
        }
    });
    var req = http.request(options, function(res){
        if (res.statusCode == "400"){
            console.log("Top up ERROR 400");
        }
        callback(null, res);
    });

    req.on("error", function(e){
    console.log("ERROR with topupTransferSync in budget-controller.js", e);
        callback(e);
    });
    req.write(put_data);
    req.end();
};

// TESTING ONLY
var fs = require('fs');
var AgentConfig = require('./nodebidagent-config.js').AgentConfig;
var agentConfig = AgentConfig.deserialize(fs.readFileSync('sample-agent-config.json', 'utf8'));
var bc = new BudgetController(agentConfig);
var opts = bc.collections.accounts.getRequestOptions({ path: 'budget', query: {"akey": "avalue", "something":"special"}});
console.log(opts);
