//first party deps
var node_utils = require('cliques_node_utils');
var logging = node_utils.logging;
var fake_bidder = require('./fake_bidder');

//third-party deps
var pmx = require('pmx').init();
var express = require('express');
var bodyParser = require('body-parser');
var requestIp = require('request-ip');
var winston = require('winston');
var path = require('path');
var util = require('util');
var responseTime = require('response-time');
var config = require('config');

// Set up winston logger instance
var logfile = path.join(
    process.env['HOME'],
    'logs',
    util.format('bidder_%s.log',node_utils.dates.isoFormatUTCNow())
);

var logger = new logging.CLogger({
    transports: [
        new (winston.transports.Console)({timestamp:true}),
        new (winston.transports.File)({filename:logfile,timestamp:true})
    ]
});

var app = express();

app.set('port', (config.get('Bidder.http.port') || 5000));
app.use(express.static(__dirname + '/public'));
app.use(bodyParser.json()); // for  /> application/json
app.use(bodyParser.urlencoded({ extended: true })); // for parsing application/x-www-form-urlencoded

// inside request-ip middleware handler
app.use(function(req, res, next) {
    req.clientIp = requestIp.getClientIp(req); // on localhost > 127.0.0.1
    next();
});
app.use(responseTime());

// custom Request logging middleware
app.use(function(req, res, next){
    logger.httpRequestMiddleware(req, res, next);
});

app.get('/', function(request, response) {
    response.send('bidder');
});

app.listen(app.get('port'), function() {
    logger.info("Node app is running at localhost:" + app.get('port'));
});

app.post('/bid/', function(request, response){
    var json_response;
    //TODO: Replace with variable for secure/non-secure http protocol as applicable
    // now build bid response
    fake_bidder.get_multi_seatbid_response(request,2,function(err, response_data) {
        if (err) {
            logger.error(err);
        }
        json_response = response_data;
        response.set(fake_bidder.DEFAULT_HEADERS);
        response.status(200).json(json_response);
        response.send();
        logger.httpResponse(response)
    });
});

app.post('/win/', function(request, response){
    response.set(fake_bidder.DEFAULT_HEADERS);
    response.status(200);
    response.send();
    logger.httpResponse(response);
});
