var BankerRESTAPI = require('./banker-api').BankerRESTAPI;


var BudgetController = exports.BudgetController = function(agentConfig, options){
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
};