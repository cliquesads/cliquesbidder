#!/bin/bash

#download NVM and install NVM & node
curl https://raw.githubusercontent.com/creationix/nvm/v0.24.0/install.sh | NVM_DIR=$HOME/repositories/cliquesbidder/.nvm bash
source .nvm/nvm.sh
nvm install 0.12.0
nvm use 0.12.0

#make symlink to RTBKit node executable in /usr/bin
if [ ! -f /usr/bin/rtbkit_node ]; then
    sudo ln -s ./rtbkit/bin/node /usr/bin/rtbkit_node
fi

#install controller node dependencies
npm update
npm install

#make sure config repo is installed
if [ ! -d $HOME"/repositories/cliques-config" ]; then
    git clone git@github.com:cliquesads/cliques-config.git ../cliques-config
    ln -s ../cliques-config config
else
    cd ../cliques-config
    git pull
    cd ../cliquesbidder
fi