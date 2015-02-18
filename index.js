var express = require('express');
var math = require('mathjs');
var fs = require('fs');
var http = require('http');
var bodyParser = require('body-parser');

var app = express();

app.set('port', (process.env.PORT || 5000));
app.use(express.static(__dirname + '/public'));
app.use(bodyParser.json()); // for parsing application/json
app.use(bodyParser.urlencoded({ extended: true })); // for parsing application/x-www-form-urlencoded

app.get('/', function(request, response) {
    response.send('bidder');
});

app.listen(app.get('port'), function() {
    console.log("Node app is running at localhost:" + app.get('port'));
});

function single_seatbid_fake_response(callback){
    var response_data;
    fs.readFile('openrtb_bid_response.json','utf8',function(err, data){
        if (err) {
            callback(err);
        }
        response_data = JSON.parse(data);
        // replace necessary values with random values
        response_data.seatbid[0].bid[0].price = +((Math.random() * 10).toFixed(2));
        response_data.id =  Math.round(Math.random() * 10e10);
        response_data.bidid = Math.random().toString(36).substring(7);
        response_data.seatbid[0].seat =  Math.round(Math.random() * 10e3);
        response_data.seatbid[0].bid[0].impid =  Math.round(Math.random() * 10e9);
        response_data.seatbid[0].bid[0].id =  Math.round(Math.random() * 10e2);
        callback(null,response_data);
    });
}

app.post('/bid/', function(request, response){
    //log request data
    var body = request.body;
    var hostname = request.hostname;
    var ip_address = request.ip;
    var request_id;
    if (request.query.hasOwnProperty('request_id')) {
        request_id = request.query.request_id;
    }
    var bidder_id;
    if (request.query.hasOwnProperty('bidder_id')) {
        bidder_id = request.query.bidder_id;
    }

    console.log('POST Request from ' + hostname + '(' + ip_address + ') to BidderID: ' + bidder_id + ', RequestID: ' + request_id);
    console.log(body);

    var json_response;
    // now build bid response
    single_seatbid_fake_response(function(err,response_data){
        if (err) {
            response.status(500).json({"ERROR": "Internal Server Error: " + err});
            response.send();
        }
        json_response = response_data;
        response.status(200).json(json_response);
        response.send();
    });
});




