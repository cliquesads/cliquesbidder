#!/bin/bash

set -e

REPOSITORY_DIR=$HOME/repositories
CONFIG_DIR=$REPOSITORY_DIR/cliques-config/rtbkit/dep-config
APACHE_DIR=/etc/apache2
LOCAL_DIR=$REPOSITORY_DIR/cliquesbidder/rtbkit

cd $LOCAL_DIR
source rtbkit-*.sh
cd ..

#sudo /etc/init.d/postgresql stop

# Stop zookeeper
#$LOCAL_DIR/bin/zookeeper/bin/zkServer.sh stop
cd $HOME/local/bin/zookeeper/bin
./zkServer.sh stop
cd $LOCAL_DIR/..
# Start Redis
redis-cli shutdown
# Start Carbon
sudo /opt/graphite/bin/carbon-cache.py stop
# Start apache
service apache2 stop

#kill bidder
tmux kill-session -t rtb