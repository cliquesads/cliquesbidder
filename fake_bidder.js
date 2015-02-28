var fs = require('fs');
var querystring = require('querystring');
var express = require('express');
var bodyParser = require('body-parser');
var app = express();

app.use(bodyParser.json()); // for  /> application/json
app.use(bodyParser.urlencoded({ extended: true })); // for parsing application/x-www-form-urlencoded

var DEFAULT_HEADERS = {
    "x-openrtb-version": 2.3,
    "content-type": "application/json"
};

exports.get_single_seatbid_fake_response = get_single_seatbid_fake_response;
exports.get_multi_seatbid_response = get_multi_seatbid_response;
exports.DEFAULT_HEADERS = DEFAULT_HEADERS;

function _get_fake_bidder_nurl(request){
    //construct URL to pass in bid response as nurl for win notification
    var nurl_base = "http://" + request.headers.host;
    // assumes single impression contained in bid request
    //var impid = request.body.imp[0].id;
    qs = querystring.encode({
        //"impid":impid,
        "aid": "${AUCTION_ID}",
        "bid": "${AUCTION_BID_ID}",
        "imp": "${AUCTION_IMP_ID}",
        "seat": "${AUCTION_SEAT_ID}",
        "ad": "${AUCTION_AD_ID}",
        "price": "${AUCTION_PRICE}",
        "cur": "${AUCTION_CURRENCY}"
    });
    return nurl_base + '/win?' + qs;
}

var data = {
    "id": "1234567890", "bidid": "abc1123", "cur": "USD",
    "seatbid": [
        {
            "seat": "512",
            "bid": [{
                "id": "1", "impid": "102", "price": 9.43,
                "nurl": "http://adserver.com/winnotice?impid=102",
                "iurl": null,
                "adomain": [ "advertiserdomain.com" ],
                "adm": null,
                "cid": "campaign111",
                "crid": "creative112",
                "h": null,
                "w": null
            }]
        }]
};
var sample_metadata =
[
    {"name": "Swix",
        "adomain": ["swixsport.com"],
        "adm": "<iframe id='afe03771' name='afe03771' src='http://ads.cliquesads.com/www/delivery/afr.php?zoneid=3&amp;cb=INSERT_RANDOM_NUMBER_HERE' frameborder='0' scrolling='no' width='300' height='250'><a href='http://ads.cliquesads.com/www/delivery/ck.php?n=a9ab4dee&amp;cb=INSERT_RANDOM_NUMBER_HERE' target='_blank'><img src='http://ads.cliquesads.com/www/delivery/avw.php?zoneid=3&amp;cb=INSERT_RANDOM_NUMBER_HERE&amp;n=a9ab4dee' border='0' alt='' /></a></iframe>",
        "cid": 2,
        "crid": [2,3],
        "h": 250,
        "w": 300
    },
    {"name": "Arcteryx",
        "adomain":["arcteryx.com"],
        "adm": "<iframe id='a1926810' name='a1926810' src='http://ads.cliquesads.com/www/delivery/afr.php?zoneid=6&amp;cb=INSERT_RANDOM_NUMBER_HERE' frameborder='0' scrolling='no' width='300' height='250'><a href='http://ads.cliquesads.com/www/delivery/ck.php?n=a68d92ee&amp;cb=INSERT_RANDOM_NUMBER_HERE' target='_blank'><img src='http://ads.cliquesads.com/www/delivery/avw.php?zoneid=6&amp;cb=INSERT_RANDOM_NUMBER_HERE&amp;n=a68d92ee' border='0' alt='' /></a></iframe>",
        "cid": 12,
        "crid": 13,
        "h": 250,
        "w": 300
    },
    {"name":"Backcountry",
        "adomain":["backcountry.com"],
        "adm": "<iframe id='a5ba398e' name='a5ba398e' src='http://ads.cliquesads.com/www/delivery/afr.php?zoneid=11&amp;cb=INSERT_RANDOM_NUMBER_HERE' frameborder='0' scrolling='no' width='300' height='250'><a href='http://ads.cliquesads.com/www/delivery/ck.php?n=ad88a4c6&amp;cb=INSERT_RANDOM_NUMBER_HERE' target='_blank'><img src='http://ads.cliquesads.com/www/delivery/avw.php?zoneid=11&amp;cb=INSERT_RANDOM_NUMBER_HERE&amp;n=ad88a4c6' border='0' alt='' /></a></iframe>",
        "cid": 13,
        "crid": 14,
        "h": 250,
        "w": 300
    },
    {"name":"Holmenkol",
        "adomain":["holmenkol.com"],
        "adm": "<iframe id='a39c4287' name='a39c4287' src='http://ads.cliquesads.com/www/delivery/afr.php?zoneid=9&amp;cb=INSERT_RANDOM_NUMBER_HERE' frameborder='0' scrolling='no' width='300' height='250'><a href='http://ads.cliquesads.com/www/delivery/ck.php?n=aabd9737&amp;cb=INSERT_RANDOM_NUMBER_HERE' target='_blank'><img src='http://ads.cliquesads.com/www/delivery/avw.php?zoneid=9&amp;cb=INSERT_RANDOM_NUMBER_HERE&amp;n=aabd9737' border='0' alt='' /></a></iframe>",
        "cid": 5,
        "crid": 9,
        "h": 250,
        "w": 300
    },
    {"name": "Marmot",
        "adomain":["marmot.com"],
        "adm": "<iframe id='a7900164' name='a7900164' src='http://ads.cliquesads.com/www/delivery/afr.php?zoneid=7&amp;cb=INSERT_RANDOM_NUMBER_HERE' frameborder='0' scrolling='no' width='300' height='250'><a href='http://ads.cliquesads.com/www/delivery/ck.php?n=a14add0a&amp;cb=INSERT_RANDOM_NUMBER_HERE' target='_blank'><img src='http://ads.cliquesads.com/www/delivery/avw.php?zoneid=7&amp;cb=INSERT_RANDOM_NUMBER_HERE&amp;n=a14add0a' border='0' alt='' /></a></iframe>",
        "cid": 11,
        "crid": 12,
        "h": 250,
        "w": 300
    },
    {"name":"NorthFace",
        "adomain":["thenorthface.com"],
        "adm": "<iframe id='ac2b2a48' name='ac2b2a48' src='http://ads.cliquesads.com/www/delivery/afr.php?zoneid=5&amp;cb=INSERT_RANDOM_NUMBER_HERE' frameborder='0' scrolling='no' width='300' height='250'><a href='http://ads.cliquesads.com/www/delivery/ck.php?n=a80b5b26&amp;cb=INSERT_RANDOM_NUMBER_HERE' target='_blank'><img src='http://ads.cliquesads.com/www/delivery/avw.php?zoneid=5&amp;cb=INSERT_RANDOM_NUMBER_HERE&amp;n=a80b5b26' border='0' alt='' /></a></iframe>",
        "cid": 10,
        "crid": 11,
        "h": 250,
        "w": 300
    },
    {"name":"Ski.com",
        "adomain":["ski.com"],
        "adm": "<iframe id='aa091556' name='aa091556' src='http://ads.cliquesads.com/www/delivery/afr.php?zoneid=10&amp;cb=INSERT_RANDOM_NUMBER_HERE' frameborder='0' scrolling='no' width='300' height='250'><a href='http://ads.cliquesads.com/www/delivery/ck.php?n=a2c434b8&amp;cb=INSERT_RANDOM_NUMBER_HERE' target='_blank'><img src='http://ads.cliquesads.com/www/delivery/avw.php?zoneid=10&amp;cb=INSERT_RANDOM_NUMBER_HERE&amp;n=a2c434b8' border='0' alt='' /></a></iframe>",
        "cid": 14,
        "crid": 15,
        "h": 250,
        "w": 300
    },
    {"name":"SkiYard",
        "adomain":["skiyard.com"],
        "adm": "<iframe id='af0b3de6' name='af0b3de6' src='http://ads.cliquesads.com/www/delivery/afr.php?zoneid=12&amp;cb=INSERT_RANDOM_NUMBER_HERE' frameborder='0' scrolling='no' width='300' height='250'><a href='http://ads.cliquesads.com/www/delivery/ck.php?n=af4db4b0&amp;cb=INSERT_RANDOM_NUMBER_HERE' target='_blank'><img src='http://ads.cliquesads.com/www/delivery/avw.php?zoneid=12&amp;cb=INSERT_RANDOM_NUMBER_HERE&amp;n=af4db4b0' border='0' alt='' /></a></iframe>",
        "cid": 9,
        "crid": 10,
        "h": 250,
        "w": 300
    },
    {"name":"Stio",
        "adomain":["stio.com"],
        "adm": "<iframe id='aa2433fb' name='aa2433fb' src='http://ads.cliquesads.com/www/delivery/afr.php?zoneid=8&amp;cb=INSERT_RANDOM_NUMBER_HERE' frameborder='0' scrolling='no' width='300' height='250'><a href='http://ads.cliquesads.com/www/delivery/ck.php?n=a76f9187&amp;cb=INSERT_RANDOM_NUMBER_HERE' target='_blank'><img src='http://ads.cliquesads.com/www/delivery/avw.php?zoneid=8&amp;cb=INSERT_RANDOM_NUMBER_HERE&amp;n=a76f9187' border='0' alt='' /></a></iframe>",
        "cid": 15,
        "crid": 16,
        "h": 250,
        "w": 300
    },
    {"name":"Uvex",
        "adomain":["uvex.com"],
        "adm": "<iframe id='a234f089' name='a234f089' src='http://ads.cliquesads.com/www/delivery/afr.php?zoneid=4&amp;cb=INSERT_RANDOM_NUMBER_HERE' frameborder='0' scrolling='no' width='300' height='250'><a href='http://ads.cliquesads.com/www/delivery/ck.php?n=a8292904&amp;cb=INSERT_RANDOM_NUMBER_HERE' target='_blank'><img src='http://ads.cliquesads.com/www/delivery/avw.php?zoneid=4&amp;cb=INSERT_RANDOM_NUMBER_HERE&amp;n=a8292904' border='0' alt='' /></a></iframe>",
        "cid": 16,
        "crid": 17,
        "h": 250,
        "w": 300
    }
];

function get_single_seatbid_fake_response(request, callback){
    // generates simulated bid response to bid request
    // request must be original HTTP POST request object representing the incoming bid request
    var response_data = data;

    // replace bid values with random numbers
    response_data.seatbid[0].bid[0].price = +((Math.random() * 10).toFixed(2));
    response_data.bidid = Math.round(Math.random() * 10e10);
    response_data.seatbid[0].seat =  Math.round(Math.random() * 10e3);
    response_data.seatbid[0].bid[0].id =  Math.round(Math.random() * 10e7);

    //now populate pass-back values

    // WARNING: assumes SINGLE IMPRESSION contained in bid request, i.e.
    // that body.imp.length == 1
    response_data.seatbid[0].bid[0].impid = request.body.imp[0].id;
    response_data.id =  request.body.id;
    response_data.seatbid[0].bid[0].nurl = _get_fake_bidder_nurl(request);

    //now add in "real" advertiser metadata
    var json_metadata = sample_metadata;
    var advertiser_index = Math.round(Math.random() * 9); // just randomly choose from array of length 10
    var this_metadata = json_metadata[advertiser_index];
    response_data.seatbid[0].bid[0].adm = this_metadata.adm;
    response_data.seatbid[0].bid[0].adid = advertiser_index;
    response_data.seatbid[0].bid[0].adomain = this_metadata.adomain;
    response_data.seatbid[0].bid[0].h = this_metadata.h;
    response_data.seatbid[0].bid[0].w = this_metadata.w;
    response_data.seatbid[0].bid[0].cid = this_metadata.cid;
    response_data.seatbid[0].bid[0].crid = this_metadata.crid;

    // finally, call callback
    callback(null, response_data);
}

function get_multi_seatbid_response(request, num_bids, callback){

    // generates simulated bid response to bid request
    // request must be original HTTP POST request object representing the incoming bid request
    var advertiser_metadata = sample_metadata.slice(0); //shallow copy metadata
    var response_data = {};

    // populate bidresponse object level values
    response_data.id =  request.body.id;
    response_data.bidid = Math.round(Math.random() * 10e10);
    response_data.cur = "USD";
    // seatbid object level values
    response_data.seatbid = [{
        seat: Math.round(Math.random() * 10e3),
        bid:[]
    }];
    // replace bid values with random numbers
    for (var i = 0; i < num_bids; i++){
        // choose element from array at random
        var random_ind = Math.round(Math.random() * (advertiser_metadata.length-1));
        var this_metadata = advertiser_metadata.splice(random_ind, 1)[0];
        // fill in random values
        response_data.seatbid[0].bid[i] = {
            id: Math.round(Math.random() * 10e7),
            impid: request.body.imp[0].id,
            nurl: _get_fake_bidder_nurl(request),
            adid: random_ind,
            price: +((Math.random() * 10).toFixed(2)),
            adm: this_metadata.adm,
            adomain: this_metadata.adomain,
            h: this_metadata.h,
            w: this_metadata.w,
            cid: this_metadata.cid,
            crid: this_metadata.crid
        };
    }
    callback(null, response_data);
}