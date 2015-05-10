#!/bin/sh

#download NVM and install NVM & node
curl https://raw.githubusercontent.com/creationix/nvm/v0.24.0/install.sh | NVM_DIR=$HOME/repositories/adexchange/.nvm bash
source .nvm/nvm.sh
nvm install 0.12.0
nvm use 0.12.0

#install node dependencies
npm update
npm install