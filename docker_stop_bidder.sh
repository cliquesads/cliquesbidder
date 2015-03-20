#!/bin/bash

set -e

REPOSITORY_DIR=$HOME/repositories
CONFIG_DIR=$REPOSITORY_DIR/cliques-config/rtbkit
APACHE_DIR=/etc/apache2
LOCAL_DIR=$REPOSITORY_DIR/cliquesbidder/rtbkit

cd $LOCAL_DIR
source rtbkit-*.sh
cd ..

/etc/init.d/postgresql stop

# Stop zookeeper
#$LOCAL_DIR/bin/zookeeper/bin/zkServer.sh stop
$HOME/local/bin/zookeeper/bin/zkServer.sh stop
# Start Redis
redis-cli shutdown
# Start Carbon
/opt/graphite/bin/carbon-cache.py stop
# Start apache
service apache2 stop

#kill bidder
tmux kill-session -t rtb