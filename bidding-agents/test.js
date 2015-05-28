var BankerRESTAPI = require('./banker-api').BankerRESTAPI;

client = new BankerRESTAPI();

var parent = 'hello';
var child = 'world';
var newAccountName = [parent, child].join(':');
var cur = 'USD/1M';
var budget = 293208849279;

// POST/PUT Methods;
console.log('================= Running createAccount ===================');
client.createAccount(newAccountName, function(err, res){
    if (err) console.log(err);
    console.log(res);
    console.log('================= Running setAccountBudget ===================');
    client.setAccountBudget(parent, cur, budget, function(err, res){
        if (err) console.log(err);
        console.log(res);
        console.log('================= Running setChildAccountBalance ===================');
        client.setChildAccountBalance(newAccountName, cur, 100000, function(err, res){
            if (err) console.log(err);
            console.log(res);
            console.log('================= Running getSummary ===================');
            client.getSummary(function(err, res){
                if (err) console.log(err);
                console.log(res);
                console.log('================= Running getAccounts ===================');
                client.getAccounts(function(err, res){
                    if (err) console.log(err);
                    console.log(res);
                    console.log('================= Running getAccount ===================');
                    client.getAccount(newAccountName, function(err, res){
                        if (err) console.log(err);
                        console.log(res);
                        console.log('================= Running getAccountChildren ===================');
                        client.getAccountChildren(parent, function(err, res){
                            if (err) console.log(err);
                            console.log(res);
                            console.log('================= Running getAccountSummary ===================');
                            client.getAccountSummary(parent, function(err, res){
                                if (err) console.log(err);
                                console.log(res);
                                console.log('================= Running getAccountSubTree ===================');
                                client.getAccountSubtree(parent, function(err, res){
                                    if (err) console.log(err);
                                    console.log(res);
                                    console.log('Done!');
                                });
                            });
                        });
                    });
                });
            });
        });
    });
});
