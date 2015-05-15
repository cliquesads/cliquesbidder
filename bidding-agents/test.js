var BankerRESTAPI = require('./banker-api').BankerRESTAPI;

function cb(err, res){
    if (err) return console.log(err);
    console.log(res);
}
client = new BankerRESTAPI();
client.getAccounts(cb);