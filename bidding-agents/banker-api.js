/**
 * Utilities to communicate with RTBKit Master Banker
 */

var http = require("http");
var querystring = require("querystring");
var url = require('url');

/**
 * Lightweight class too wrap Banker JSON representation of account
 *
 * Provides methods to derive various useful properties not explicitly
 * stored in Banker DB
 *
 * @param account
 * @constructor
 */
var Account = function(account){
    for (var key in account) {
        if (account.hasOwnProperty(key)) {
            this[key] = account[key];
        }
    }
};
Account.prototype.getBudget = function(currency){
    var budgetIncreases = this.budgetIncreases[currency] || 0;
    var budgetDecreases = this.budgetDecreases[currency] || 0;
    //var recycledIn      = this.recycledIn[currency]      || 0;
    //var recycledOut     = this.recycledOut[currency]     || 0;
    //var allocatedIn     = this.allocatedIn[currency]     || 0;
    //var allocatedOut    = this.allocatedOut[currency]    || 0;
    return budgetIncreases - budgetDecreases;
};

/**
 * Wraps generic callback function accepting (err, obj) and instantiates
 * new Account with returned JSON object
 *
 * @param func
 * @returns {Function}
 */
function accountCallbackDecorator(func){
    return function(err, account_json){
        var account = new Account(account_json);
        return func(err, account);
    }
}

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
BankerRESTAPI = exports.BankerRESTAPI = function(agentConfig, options){
    options         = options || {};
    this.hostname   = options.host || "localhost";
    this.apiVersion = options.apiVersion || "v1";
    this.port       = options.port || 9985;

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
BankerRESTAPI.prototype._requestOptionsDecorator = function(collection_path){
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
BankerRESTAPI.prototype._getRequestOptions = function(collection_path, options){
    options     = options || {};
    var method  = options.method || 'GET';
    var query   = options.query;
    var path    = options.path;
    var headers = options.headers;

    var root_path_arr = ['',this.apiVersion, collection_path];
    if (path) {
        root_path_arr.push(path);
    }
    path = root_path_arr.join('/');

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
BankerRESTAPI.prototype._sendAPIRequest = function(options, data, callback){
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

    var options_str = 'path: '+options.path+', hostname: '+options.hostname+
        ', port: '+options.port+', method: '+options.method;

    // now send request
    var req = http.request(options, function(res){
        if (res.statusCode == "400"){
            return callback('HTTP ERROR: 400 REST API Request Error at ' + options_str)
        }
        // handle response body data, pass to callback as JSON
        var body = '';
        res.on('data', function(chunk){
            body += chunk;
        });
        res.on('end', function(){
            return callback(null, JSON.parse(body));
        });
    });

    // add error handler
    req.on("error", function(e){
        callback(e + ", Request options: " + options_str);
    });
    // write stringified JSON data, if any
    if (data){
        req.write(data);
    }
    req.end();
};

//#######################################################//
//############## BEGIN API Wrapper Methods ##############//
//#######################################################//

/* -------- Accounts POST/PUT Wrapper Methods ---------- */

/**
 * This command is used to create a new account in the Banker database.
 *
 * @param accountName
 * @param callback
 */
BankerRESTAPI.prototype.createAccount = function(accountName, callback){
    var options = this.collections.accounts.getRequestOptions({
        method: 'POST',
        query: {
            accountType: 'budget',
            accountName: accountName
        }
    });
    var wrapped = accountCallbackDecorator(callback);
    this._sendAPIRequest(options, wrapped);
};

/**
 * Transfer budget to or from the parent such that the account's balance
 * amount matches the amount passed in the request body. Note that by definition
 * this method is only valid for sub accounts.
 *
 * @param accountName
 * @param currency
 * @param amount
 * @param callback
 */
BankerRESTAPI.prototype.setChildAccountBalance = function(accountName, currency, amount, callback){
    var put_data = {};
    put_data[currency] = amount;
    var options = this.collections.accounts.getRequestOptions({
        path: [accountName, 'balance'].join('/'),
        query: {
            accountType: 'budget'
        },
        method: 'PUT'
    });
    var wrapped = accountCallbackDecorator(callback);
    this._sendAPIRequest(options, put_data, wrapped);
};

/**
 * Set the budget of the account to the amount passed in.
 * Note that by definition this method is only valid for top accounts.
 *
 * @param {String} accountName must be top-level account only
 * @param currency
 * @param amount
 * @param callback
 */
BankerRESTAPI.prototype.setAccountBudget = function(accountName, currency, amount, callback){
    var data = {};
    data[currency] = amount;
    var options = this.collections.accounts.getRequestOptions({
        path: [accountName, 'budget'].join('/'),
        method: 'POST'
    });
    var wrapped = accountCallbackDecorator(callback);
    this._sendAPIRequest(options, data, wrapped);
};

/**
 * This command enables the update of the corresponding spend account's spend and commitments.
 *
 * @param {String} accountName must be top-level account only
 * @param {Object} shadow_account JSON representation of the shadow account
 * @param callback
 */
BankerRESTAPI.prototype.setShadowAccount = function(accountName, shadow_account, callback){
    var options = this.collections.accounts.getRequestOptions({
        path: [accountName, 'shadow'].join('/'),
        method: 'POST'
    });
    this._sendAPIRequest(options, shadow_account, callback);
};

/* ----------- Accounts GET Wrapper Methods -------------- */

/**
 * This command returns the hierachical list of available accounts as
 * a JSON array of arrays of strings.
 *
 * @param callback
 */
BankerRESTAPI.prototype.getAccounts = function(callback){
    var options = this.collections.accounts.getRequestOptions();
    this._sendAPIRequest(options,callback);
};

/**
 * This command returns a representation of the given account.
 *
 * @param {String} accountName name of account
 * @param callback
 */
BankerRESTAPI.prototype.getAccount = function(accountName, callback){
    var options = this.collections.accounts.getRequestOptions({
        path: accountName
    });
    var wrapped = accountCallbackDecorator(callback);
    this._sendAPIRequest(options,wrapped);
};

/**
 * This command returns a JSON-encoded and aggregated summary of the
 * given account and its children.
 *
 * @param {String} accountName name of account
 * @param {Number} [maxDepth=unlimited] optionally specify maxDepth of tree to traverse
 * @param callback
 */
BankerRESTAPI.prototype.getAccountSummary = function(accountName, maxDepth, callback){
    if (arguments.length === 2){
        callback = maxDepth;
        maxDepth = null;
    }
    var options = this.collections.accounts.getRequestOptions({
        path: [accountName, 'summary'].join('/'),
        query : maxDepth ? { maxDepth: maxDepth} : null
    });
    this._sendAPIRequest(options,callback);
};


/**
 * This command returns a representation of the given account and its children.
 *
 * @param {String} accountName name of account
 * @param {Number} [depth=unlimited] optionally specify maxDepth of tree to traverse
 * @param callback
 */
BankerRESTAPI.prototype.getAccountSubtree = function(accountName, depth, callback){
    if (arguments.length === 2){
        callback = depth;
        depth = null;
    }
    var options = this.collections.accounts.getRequestOptions({
        path: [accountName, 'subtree'].join('/'),
        query : depth ? { depth: depth } : null
    });
    this._sendAPIRequest(options,callback);
};

/**
 * This command returns the list of children for the account specified by "accountName".
 *
 * @param {String} accountName name of account
 * @param {Number} [depth=unlimited] optionally specify maxDepth of tree to traverse
 * @param callback
 */
BankerRESTAPI.prototype.getAccountChildren = function(accountName, depth, callback){
    if (arguments.length === 2){
        callback = depth;
        depth = null;
    }
    var options = this.collections.accounts.getRequestOptions({
        path: [accountName, 'children'].join('/'),
        query : depth ? { depth: depth} : null
    });
    this._sendAPIRequest(options,callback);
};

/* ----------- Summary GET Wrapper Methods -------------- */

/**
 * This command returns the simplified summaries of all existing accounts in a
 * JSON-encoded format.
 *
 * @param callback
 */
BankerRESTAPI.prototype.getSummary = function(callback){
    var options = this.collections.summary.getRequestOptions();
    this._sendAPIRequest(options,callback);
};

//Just for testing
exports.client = new BankerRESTAPI();
exports.cb = function(v){
  return function(err, res){
      if (err) return console.log(err);
      v = res;
      console.log(res);
  }
};
exports.campaign = ['553176cb469cbc6e40e28689', '553176cb469cbc6e40e28687'].join(':');
exports.advertiser = '553176cb469cbc6e40e28689';