/** nodebidagent-config.js
    Jay Pozo, 19 Sep 2013
    Copyright (c) 2013 Datacratic.  All rights reserved.

    Configuration of our node bidding agent.
*/

exports.config = {
  "account": ["hello","world"],
  "bidProbability": 1.0,
    "providerConfig":{
        "cliques":{
            "seat": 129349
        }
    },
  "creatives": [ 
    {
      "format":{"width":720, "height":90},
      "id":0,
      "name":"LeaderBoard",
      "tagId":0
    },
    {
      "format":{"width":160,"height":600},
      "id":1,
      "name":"LeaderBoard",
      "tagId":1
    },
    {
      "format":{"width":300,"height":250},
      "id":2,
      "name":"BigBox",
      "tagId":2,
      "providerConfig":{
          "cliques":{
              "adm": "<iframe id='a1faac72' name='a1faac72' src='http://ads.cliquesads.com/www/delivery/afr.php?zoneid=3' frameborder='0' scrolling='no' width='300' height='250'><a href='http://ads.cliquesads.com/www/delivery/ck.php?n=a3312a64' target='_blank'><img src='http://ads.cliquesads.com/www/delivery/avw.php?zoneid=3&amp;n=a3312a64' border='0' alt='' /></a></iframe>",
              "adomain": ["www.untapped.cc"]
          }
      }
    }
  ],
  "augmentations":{
    "frequency-cap-ex":{
      "required":true,
      "config":42,
      "filters":{"include":["pass-frequency-cap-ex"]}
    }  
  },
  "maxInFlight": 50
}
