var BankerRESTAPI = require('./banker-api').BankerRESTAPI;
var BidAgentAccount = require('./nodebidagent-config').BidAgentAccount;

/**
 * Handles budget controlling functionality for a given campaign (i.e. single bidAgent)
 *
 * @param {AgentConfig} agentConfig instance of AgentConfig
 * @param {Object} [options] options to configure BankerRESTAPI client
 * @class
 */
var CampaignBudgetController = exports.BudgetController = function(agentConfig, options){
    this.apiClient      = new BankerRESTAPI(options);

    // parse relevant agentConfig variables for convenience;
    this.agentConfig    = agentConfig;
    // parse dates into ms since epoch
    this.start_date     = Date.parse(this.agentConfig.targetingConfig.start_date);
    this.end_date       = Date.parse(this.agentConfig.targetingConfig.end_date);
    this.even_pacing    = this.agentConfig.targetingConfig.even_pacing;

    //this._currency      = this.agentConfig.targetingConfig.currency;
    this.currency       = 'USD/1M';

    // Handle namespacing of accounts
    this.bidAgentAccount = BidAgentAccount.fromArray(this.agentConfig.coreConfig.account);

    // Create account tree
    this.init();
};

/**
 * Placeholder static method to convert simple budget to internal
 * currency.  Currently, self.currency is constant ('USD/1M'), so
 * this is relatively pointless, but done for convenience so
 * you don't need to search for all conversion instances in the future.
 *
 * @param {Number} budget budget in simple USD or external currency
 */
CampaignBudgetController.convertBudget = function(budget){
    return budget * 1e6;
};

CampaignBudgetController.prototype.init = function(){
    var self = this;
    var accountName = self.bidAgentAccount.accountName;
    self.apiClient.createAccount(accountName, function(err, account){
        if (account.budgetIncreases === {}){
            console.log('New account created with Banker: ' + accountName);
        } else {
            console.log('Account '+accountName+'found');
        }
    });
};

/**
 * Sets parent-level campaign account budget in banker, creating account if
 * it hasn't already been created.
 *
 * @param budget budget in simple USD
 * @param callback
 */
CampaignBudgetController.prototype.setCampaignBudget = function(budget, callback){
    var self = this;
    var campaignAccountName = this.bidAgentAccount.campaignAccountName;
    console.log('Setting campaign budget for campaign ID ' + campaignAccountName);
    // Convert budget in USD to micro USD
    budget = self.convertBudget(budget);
    // finally, set budget in parent account.
    self.apiClient.setAccountBudget(campaignAccountName,self.currency,budget,function(err,account){
        if (err) return callback(err);
        console.log('Budget for account'+campaignAccountName+'updated to '+account.getBudget(self.currency));
        return callback(null, account);
    });
};

/**
 * Handles pacing.  If even_pacing is true, will set linear budget allocations
 * every `interval_in_ms` milliseconds in child account.  If not, will simply transfer all
 * budget in parent account to child.
 *
 * @param budget budget in simple USD
 * @param interval_in_ms
 * @param [callback]
 */
CampaignBudgetController.prototype.pace = function(budget, interval_in_ms, callback){
    var self = this;
    budget = self.convertBudget(budget);
    // sub-function that does the actual API call to transfer budget from parent to child
    function _transfer_budget(amount){
        self.apiClient.setChildAccountBalance(self.bidAgentAccount.accountName,self.currency,amount,function(err, child_account){
            if (err){
                return callback ? callback(err) : console.log(err);
            }
            return callback ? callback(null, child_account): null
        });
    }
    if (self.even_pacing){
        // Do even pacing math
        var duration = self.end_date - self.start_date;
        // take floor of quotient, dont think this should cause any significant
        // rounding errors as we're rounding fractions of a micro dollar
        var transfer_amount = Math.floor(budget / duration) * interval_in_ms;
        // Top up now and set top_up for interval schedule
        _transfer_budget(transfer_amount);
        setInterval(_transfer_budget, interval_in_ms, transfer_amount);
    } else {
        _transfer_budget(budget);
    }
};