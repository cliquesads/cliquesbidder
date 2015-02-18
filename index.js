var express = require('express');
var math = require('mathjs');
var fs = require('fs');
var http = require('http');

var app = express();

app.set('port', (process.env.PORT || 5000));
app.use(express.static(__dirname + '/public'));

app.get('/', function(request, response) {
    response.send('bidder');
});

app.listen(app.get('port'), function() {
    console.log("Node app is running at localhost:" + app.get('port'));
});

app.post('/bid/', function(request, response) {
    response.send('response');
});




