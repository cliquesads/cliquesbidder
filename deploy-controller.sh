#!/bin/bash

#activate production environment
source ./activate_production.sh

#install all NPM dependencies
npm install

#pull any RTBKit submodule updates
git submodule update

#now make sure RTBKit Core is up and running, along with
#all background services
./deploy-rtbkit.sh

#make sure separate redis instance is running on 6380
./setup/setup-redis.sh

#make sure latest configs are pulled
if [ ! -d $HOME"/repositories/cliques-config" ]; then
    git clone git@github.com:cliquesads/cliques-config.git ../cliques-config
    ln -s ../cliques-config config
else
    cd ../cliques-config
    git pull
    cd ../cliquesbidder
fi

processname='bidAgentController'
running=$(pm2 list -m | grep "$processname")
if [ -z "$running" ]; then
    # hook PM2 up to web monitoring with KeyMetrics
    pm2 interact 9661z7ru6dmulvs 6xw07v3gpf6e7hm
    # start in fork mode
    # NOTE: DO NOT EVER RUN IN CLUSTER MODE
    # Controller mechanism relies on a single in-memory record of
    # all child processes (i.e. bigagents), and will not work properly
    # if load-balanced across multiple instances.
    pm2 start index.js --name "$processname"
else
    pm2 gracefulReload "$processname"
fi
