#!/bin/bash

export NODE_ENV=production
npm install

if [ ! -d $HOME"/repositories/cliques-config" ]; then
    git clone git@github.com:cliquesads/cliques-config.git ../cliques-config
    ln -s ../cliques-config config
else
    cd ../cliques-config
    git pull
    cd ../cliquesbidder
fi

processname='cliques-bidder'
running=$(pm2 list -m | grep "$processname")

if [ -z "$running" ]; then
    # hook PM2 up to web monitoring with KeyMetrics
    pm2 interact 9661z7ru6dmulvs 6xw07v3gpf6e7hm
    # start in cluster mode
    pm2 start fake_bidder_index.js --name "$processname" -i 0
else
    pm2 gracefulReload "$processname"
fi