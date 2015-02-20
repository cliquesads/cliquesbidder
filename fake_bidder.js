/**
 * Created by bliang on 2/19/15.
 */
var fs = require('fs');
var querystring = require('querystring');
var express = require('express');
var bodyParser = require('body-parser');
var app = express();

app.use(bodyParser.json()); // for  /> application/json
app.use(bodyParser.urlencoded({ extended: true })); // for parsing application/x-www-form-urlencoded

exports.get_single_seatbid_fake_response = get_single_seatbid_fake_response;

function _get_fake_bidder_nurl(request){
    //construct URL to pass in bid response as nurl for win notification
    var nurl_base = "http://" + request.headers.host;
    // assumes single impression contained in bid request
    var impid = request.body.imp[0].id;
    qs = querystring.encode({"impid":impid});
    return nurl_base + '/win?' + qs;
}

function get_single_seatbid_fake_response(request, callback){
    // generates simulated bid response to bid request
    // request must be original HTTP POST request object representing the incoming bid request
    var response_data;
    fs.readFile('openrtb_bid_response_template.json','utf8',function(err, data){
        if (err) {
            callback(err);
        }
        response_data = JSON.parse(data);

        // replace bid values with random numbers
        response_data.seatbid[0].bid[0].price = +((Math.random() * 10).toFixed(2));
        response_data.id =  Math.round(Math.random() * 10e10);
        response_data.seatbid[0].seat =  Math.round(Math.random() * 10e3);
        response_data.seatbid[0].bid[0].id =  Math.round(Math.random() * 10e2);

        //now populate pass-back values

        // WARNING: assumes SINGLE IMPRESSION contained in bid request, i.e.
        // that body.imp.length == 1
        response_data.seatbid[0].bid[0].impid = request.body.imp[0].id;
        response_data.bidid = request.body.id;
        response_data.seatbid[0].bid[0].nurl = _get_fake_bidder_nurl(request);

        //now add in "real" advertiser metadata
        fs.readFile('sample_advertiser_metadata.json','utf8',function(err,sample_metadata){
            if (err) throw err;
            var json_metadata = JSON.parse(sample_metadata);
            var advertiser_index = Math.round(Math.random() * 9); // just randomly choose from array of length 10
            var this_metadata = json_metadata[advertiser_index];

            //now set advertiser-specific variables in response object
            response_data.seatbid[0].bid[0].adm = this_metadata.adm;
            response_data.seatbid[0].bid[0].adomain = this_metadata.adomain;
            response_data.seatbid[0].bid[0].h = this_metadata.h;
            response_data.seatbid[0].bid[0].w = this_metadata.w;
            response_data.seatbid[0].bid[0].cid = this_metadata.cid;
            response_data.seatbid[0].bid[0].crid = this_metadata.crid;

            // finally, call callback
            callback(null, response_data);
        });
    });
}