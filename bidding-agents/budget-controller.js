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

    // Handle namespacing of accounts
    this.advertiserAccount  = this.accountsArray[0];
    this.campaignAccount    = this.accountsArray[1];
    this.accountName        = this.accountsArray.join(':');

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
    options     = options || {};
    var method  = options.method || 'GET';
    var query   = options.query;
    var path    = options.path;
    var headers = options.headers;

    path = ['',this.apiVersion, collection_path, path].join('/');
    if (query){
        path = [path, querystring.stringify(query)].join('?');
    }
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

/**
 * Wrapper method to send all API requests.
 *
 * Goal of this is to make options object as simple as possible to reduce redundancy.
 *
 * Only need to specify `path`,`query` and `method` params in options, this method
 * will handle the rest, including stringifying data & setting headers if data is
 * present.
 *
 * @param {Object} options further simplified options object
 * @param {String} [options.path='/'] resource path, i.e. path relative to collection path
 * @param {String} [options.query] query object
 * @param {String} [options.method='GET'] HTTP method
 * @param {Object} [options.headers] Request headers.  POST/PUT JSON data headers will be created automatically.
 * @param {Object} [data=null] optional JSON data object to send with PUT/POST requests
 * @param {Function} callback takes (err, response)
 */
BudgetController.prototype._sendAPIRequest = function(options, data, callback){
    if (arguments.length == 2){
        callback = data;
        data = false;
    } else {
        // Set default JSON data headers, if data is provided
        data = JSON.stringify(data);
        if (!options.hasOwnProperty("headers")) {
            options.headers = {};
        }
        options.headers["Content-Type"] = "application/json";
        options.headers["Content-Length"] = data.length;
    }
    // now send request
    var req = http.request(options, function(res){
        if (res.statusCode == "400"){
            return callback('HTTP ERROR: 400 REST API Request Error. Options: '+ JSON.stringify(options))
        }
        return callback(null, res);
    });
    // add error handler
    req.on("error", function(e){
        callback(e + ", Request options: " + JSON.stringify(options));
    });
    // write stringified JSON data, if any
    if (data){
        req.write(data);
    }
    req.end();
};

//
/**
 * Creates new account with Banker.
 *
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
    this._sendAPIRequest(options, callback);
};

/**
 * Transfers budget to child account from parent (top-level)
 *
 * @param accountName
 * @param currency
 * @param amount
 * @param callback
 */
BudgetController.prototype.addBalanceToChildAccount = function(accountName, currency, amount, callback){
    var put_data = {};
    put_data[currency] = amount;
    var options = this.collections.accounts.getRequestOptions({
        path: [accountName, 'balance'].join('/'),
        query: {
            accountType: 'budget'
        },
        method: 'PUT'
    });
    this._sendAPIRequest(options, put_data, callback);
};

/**
 * Sets new budget at the top-level account of the tree.
 *
 * @param {String} accountName must be top-level account only
 * @param currency
 * @param amount
 * @param callback
 */
BudgetController.prototype.setAccountBudget = function(accountName, currency, amount, callback){
    var data = {};
    data[currency] = amount;
    var options = this.collections.accounts.getRequestOptions({
        path: [accountName, 'budget'].join('/'),
        method: 'POST'
    });
    this._sendAPIRequest(options, data, callback);
};

/**
 * Gets JSON summary of all accounts in tree.
 *
 * @param callback
 */
BudgetController.prototype.getSummary = function(callback){
    var options = this.collections.summary.getRequestOptions();
    this._sendAPIRequest(options,callback);
};




// TESTING ONLY
var fs = require('fs');
var AgentConfig = require('./nodebidagent-config.js').AgentConfig;
var agentConfig = AgentConfig.deserialize(fs.readFileSync('sample-agent-config.json', 'utf8'));
var bc = new BudgetController(agentConfig);
//var opts = bc.collections.accounts.getRequestOptions({ path: 'budget', query: {"akey": "avalue", "something":"special"}});

//bc.addBalanceToChildAccount(bc.accountName, 'USD/1M', '380283930383', function(err, res){
//    if (err) return console.log(err);
//    console.log(res);
//});

bc.getSummary(function(err, res){
    if (err) return console.log(err);
    console.log(res);
});

