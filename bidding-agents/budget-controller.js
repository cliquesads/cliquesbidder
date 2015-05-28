var BankerRESTAPI = require('./banker-api').BankerRESTAPI;
var BidAgentAccount = require('./nodebidagent-config').BidAgentAccount;

//TODO: There are sort of loose dependencies all over the place here that assume
//TODO: 1-1 campaign-bidagent relationship.  Would be nice to clean these up
//TODO: to make these more generic

/**
 * Handles budget controlling functionality for a given campaign (i.e. single bidAgent).
 *
 * Should be used in bidAgent as follows:
 *
 * var budgetController = new CampaignBudgetController(account_array, 15000);
 * budgetController.configure_and_run(agentConfig)
 *
 * @param {Array} campaign_account_array array of account subtree
 * @param {Number} interval_in_ms interval on which to pace, in milliseconds.  Only relevant if even_pacing is on.
 * @param {Object} [banker_api_options] options to configure BankerRESTAPI client
 * @class
 */
var CampaignBudgetController = exports.CampaignBudgetController = function(campaign_account_array, interval_in_ms, banker_api_options){
    this.apiClient      = new BankerRESTAPI(banker_api_options);
    this.interval_in_ms = interval_in_ms;

    // TODO: make configurable eventually
    this.currency       = 'USD/1M';

    // Handle namespacing of accounts
    this.bidAgentAccount = BidAgentAccount.fromArray(campaign_account_array);

    // Create account tree
    this.init();
};

CampaignBudgetController.prototype.init = function(){
    var self = this;
    var accountName = self.bidAgentAccount.accountName;
    self.apiClient.createAccount(accountName, function(err, account){
        if (account.budgetIncreases === {}){
            console.log('New account created with Banker: ' + accountName);
        } else {
            console.log('Account: '+accountName+' found');
        }
    });
};

/**
 * Main function to be called whenever config is updated.
 *
 * Handles budget setting at the parent account level, and pacing in the child account.
 *
 * Handles all even pacing logic as well.
 *
 * @param agentConfig
 */
CampaignBudgetController.prototype.configure_and_run = function(agentConfig){
    var self = this;
    // First, configure controller
    this.agentConfig    = agentConfig;
    // parse dates into ms since epoch
    this.start_date     = Date.parse(this.agentConfig.targetingConfig.start_date);
    this.end_date       = Date.parse(this.agentConfig.targetingConfig.end_date);
    this.even_pacing    = this.agentConfig.targetingConfig.even_pacing;
    // Convert budget in USD to micro USD
    this.budget         = CampaignBudgetController.convertBudget(this.agentConfig.targetingConfig.budget);


    // set parent account budget in banker
    var campaignAccountName = this.bidAgentAccount.campaignAccountName;
    this.apiClient.setAccountBudget(campaignAccountName,this.currency,this.budget,function(err,account){
        if (err) return console.log(err);
        console.log('Budget for account '+ campaignAccountName +' updated to '+account.getBudget(self.currency));
    });

    // logging
    var transfer_amount = this._getTransferAmount();
    if (this.even_pacing){
        console.log('even_pacing is ON. Topups of ' + this.currency + ' '
        + transfer_amount + ' will occur every ' + this.interval_in_ms + 'ms');
    } else {
        console.log('even_pacing is OFF, child account balance will be set to ' + transfer_amount);
    }

    // Run pacer.  If even pacing is off, this will transfer all budget
    // to pacerAccount.  If it is on, this will transfer budget only
    // chunks at a time.
    this._pace(function(err, child_account) {
        if (err) return console.log(err);
        console.log('Pacing done, child account: ' + JSON.stringify(child_account));
    });
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

/**
 * Calculates balance to transfer from parent (campaign) to child (pacer account).
 *
 * If this.even_pacing is set to true, will do even pacing math.  Otherwise, just returns
 * this.budget.
 *
 * @private
 */
CampaignBudgetController.prototype._getTransferAmount = function(){
    var self = this;
    var transfer_amount = this.budget;
    if (this.even_pacing){
        // Do even pacing math
        var duration = self.end_date - self.start_date;
        // take floor of quotient, dont think this should cause any significant
        // rounding errors as we're rounding fractions of a micro dollar
        transfer_amount = Math.floor(self.budget / duration * self.interval_in_ms);
    }
    return transfer_amount
};

/**
 * Handles pacing.  If even_pacing is true, will set linear budget allocations
 * every `interval_in_ms` milliseconds in child account.  If not, will simply transfer all
 * budget in parent account to child.
 *
 * @param [callback]
 */
CampaignBudgetController.prototype._pace = function(callback){
    var self = this;
    // sub-function that does the actual API call to transfer budget from parent to child
    function _transfer_budget(amount){
        self.apiClient.setChildAccountBalance(self.bidAgentAccount.accountName,self.currency,amount,function(err,child_account){
            if (err) {
                return callback ? callback(err) : console.log(err);
            }
            return callback ? callback(null, child_account): null
        });
    }

    // now handle actual pacing.
    // First, clear old interval object which is handling even pacing
    // from previous call, if it exists
    if (self.interval_pacer){
        clearInterval(self.interval_pacer);
    }
    // figure out amount to transfer (either whole budget or evenly-paced budget chunks)
    var transfer_amount = self._getTransferAmount();
    if (self.even_pacing){
        _transfer_budget(transfer_amount);
        self.interval_pacer = setInterval(_transfer_budget, self.interval_in_ms, transfer_amount);
    } else {
        _transfer_budget(transfer_amount);
    }
};