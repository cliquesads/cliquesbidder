var node_utils = require('cliques_node_utils');

var express = require('express');
var bodyParser = require('body-parser');
var fake_bidder = require('./fake_bidder');

var app = express();

app.set('port', (process.env.PORT || 5000));
app.use(express.static(__dirname + '/public'));
app.use(bodyParser.json()); // for  /> application/json
app.use(bodyParser.urlencoded({ extended: true })); // for parsing application/x-www-form-urlencoded

app.get('/', function(request, response) {
    response.send('bidder');
});

app.listen(app.get('port'), function() {
    console.log("Node app is running at localhost:" + app.get('port'));
});

app.post('/bid/', function(request, response){
    //log request data
    var body = request.body;
    var hostname = request.hostname;
    var ip_address = request.ip;
    var request_id = body.id;
    var bidder_id = request.query.bidder_id;

    console.log('POST Request from ' + hostname + '(' + ip_address + ') to BidderID: ' + bidder_id + ', AuctionID: ' + request_id);
    //console.log(body);

    var json_response;
    //get hostname of incoming request to send win-notice back to
    //TODO: Replace with variable for secure/non-secure http protocol as applicable

    // now build bid response
    fake_bidder.get_single_seatbid_fake_response(request, function(err,response_data){
        if (err) throw err;
        json_response = response_data;
        response.status(200).json(json_response);
        response.send();
    });
});

app.get('/win/', function(request, response){
    console.log("GET request: Win notification " + request.originalUrl);
    response.set(fake_bidder.DEFAULT_HEADERS);
    response.status(200);
    response.send();
});








