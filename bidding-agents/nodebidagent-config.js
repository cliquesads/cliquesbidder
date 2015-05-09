/** nodebidagent-config.js
    Jay Pozo, 19 Sep 2013
    Copyright (c) 2013 Datacratic.  All rights reserved.

    Configuration of our node bidding agent.
*/

exports.config =
{
    "account": [
        "553176cb469cbc6e40e28689",
        "553176cb469cbc6e40e28687"
    ],
    "bidProbability": 1,
    "providerConfig": {
        "cliques": {
            "seat": "Backcountry"
        }
    },
    "augmentations": {
        "frequency-cap-ex": {
            "required": true,
            "config": 24,
            "filters": {
                "include": [
                    "pass-frequency-cap-ex"
                ]
            }
        }
    },
    "maxInFlight": 50,
    "creatives": [
        {
            "format": {
                "width": 300,
                "height": 250
            },
            "id": 1,
            "tagId": "553176cb469cbc6e40e28682",
            "providerConfig": {
                "cliques": {
                    "adm": "<!DOCTYPE html><html lang=\"en\"><head><style>body {\n    margin:0;\n    height:100%;\n    background-color:transparent;\n    width:100%;\n    text-align:center;\n}</style></head><body><iframe src=\"http://adsrv.cliquesads.com/crg?crgid=553176cb469cbc6e40e28682&pid=${PID}&impid=${IMPID}\" frameborder=\"0\" scrolling=\"no\" width=\"300\" height=\"250\"></iframe></body></html>",
                    "adomain": [
                        "http://cliquesads.com"
                    ]
                }
            }
        },
        {
            "format": {
                "width": 160,
                "height": 600
            },
            "id": 2,
            "tagId": "553176cb469cbc6e40e28684",
            "providerConfig": {
                "cliques": {
                    "adm": "<!DOCTYPE html><html lang=\"en\"><head><style>body {\n    margin:0;\n    height:100%;\n    background-color:transparent;\n    width:100%;\n    text-align:center;\n}</style></head><body><iframe src=\"http://adsrv.cliquesads.com/crg?crgid=553176cb469cbc6e40e28684&pid=${PID}&impid=${IMPID}\" frameborder=\"0\" scrolling=\"no\" width=\"160\" height=\"600\"></iframe></body></html>",
                    "adomain": [
                        "http://cliquesads.com"
                    ]
                }
            }
        },
        {
            "format": {
                "width": 728,
                "height": 90
            },
            "id": 3,
            "tagId": "553176cb469cbc6e40e28686",
            "providerConfig": {
                "cliques": {
                    "adm": "<!DOCTYPE html><html lang=\"en\"><head><style>body {\n    margin:0;\n    height:100%;\n    background-color:transparent;\n    width:100%;\n    text-align:center;\n}</style></head><body><iframe src=\"http://adsrv.cliquesads.com/crg?crgid=553176cb469cbc6e40e28686&pid=${PID}&impid=${IMPID}\" frameborder=\"0\" scrolling=\"no\" width=\"728\" height=\"90\"></iframe></body></html>",
                    "adomain": [
                        "http://cliquesads.com"
                    ]
                }
            }
        }
    ]
};