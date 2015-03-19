#!/bin/sh

set -e

REPOSITORY_DIR=$HOME/repositories
CONFIG_DIR=$REPOSITORY_DIR/cliques-config/rtbkit
APACHE_DIR=/etc/apache2
LOCAL_DIR=$REPOSITORY_DIR/cliquesbidder/rtbkit

source $LOCAL_DIR/rtbkit-*.env.sh

# Start PostGreSQL for graphite monitoring
/etc/init.d/postgresql

cd $LOCAL_DIR/examples
make all

# Start Apache ZooKeeper
# hacked for now to use zookeeper installed in platform-deps
# cause version in binary install can't find classpath for some reason
#$LOCAL_DIR/bin/zookeeper/bin/zkServer.sh start
$HOME/local/bin/zookeeper/bin/zkServer.sh start

# Start Redis
redis-server $CONFIG_DIR/redis.conf

