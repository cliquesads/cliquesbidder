#!/bin/bash

# usage text visible when --help flag passed in
usage="$(basename "$0") -- Sets up all global packages necessary to deploy the bidder controller, including Node, PM2 & Redis using environment set in config/environments/bidder_environment.cfg.

where:
    --help  show this help text"

if [ ! -z $1 ]; then
  if [ $1 == '--help' ]; then
    echo "$usage"
    exit 0
  fi
fi

#system deps
sudo apt-get update
sudo apt-get install gcc make build-essential

cd ..

#make sure config repo is installed
if [ ! -d $HOME"/repositories/cliques-config" ]; then
    git clone git@github.com:cliquesads/cliques-config.git ../cliques-config
    ln -s ../cliques-config config
else
    cd ../cliques-config
    git pull
    cd ../cliquesbidder
fi

# Now get proper environment variables for global package versions, etc.
source ./config/environments/bidder_environment.cfg

#download NVM and install NVM & node
curl https://raw.githubusercontent.com/creationix/nvm/v0.24.0/install.sh | NVM_DIR=$HOME/repositories/cliquesbidder/.nvm bash
source .nvm/nvm.sh
nvm install $NODE_VERSION

#make symlink to RTBKit node executable in /usr/bin
if [ ! -f /usr/bin/rtbkit_node ]; then
    sudo ln -s ./rtbkit/bin/node /usr/bin/rtbkit_node
fi

#install controller node dependencies
npm update
#have to install pm2 & mocha globally into nvm dir
# TODO: If you need to revert to an older version of PM2 this won't work, b/c NVM global version defaults to most recent
# TODO: version.  Not an issue so long as you only ever use newer versions, but if you need to revert,
# TODO: you'll need to npm uninstall pm2 -g, which I don't want to do here so as to not interrupt running processes
# TODO: unnecessarily
npm install pm2@$PM2_VERSION -g
# update in-memory pm2 version
pm2 updatePM2

# logrotate plugin for PM2
pm2 install pm2-logrotate

exit 0