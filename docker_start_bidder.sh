#!/bin/bash

set -e

REPOSITORY_DIR=$HOME/repositories
CONFIG_DIR=$REPOSITORY_DIR/cliques-config/rtbkit
APACHE_DIR=/etc/apache2
LOCAL_DIR=$REPOSITORY_DIR/cliquesbidder/rtbkit

cd $LOCAL_DIR
source rtbkit-*.sh
cd ..

# Start PostGreSQL for graphite monitoring
/etc/init.d/postgresql start

cd $LOCAL_DIR/examples
make all

# Start Apache ZooKeeper
# hacked for now to use zookeeper installed in platform-deps
# cause version in binary install can't find classpath for some reason
#$LOCAL_DIR/bin/zookeeper/bin/zkServer.sh start
$HOME/local/bin/zookeeper/bin/zkServer.sh start
# Start Redis
redis-server $CONFIG_DIR/redis.conf
# Start Carbon
/opt/graphite/bin/carbon-cache.py start
# Start apache
service apache2 restart

#start the mock exchange and detach
mock_exchange_runner >& /tmp/mock_exchange_runner.out &

#launch the bidder itself
cd $LOCAL_DIR
./build/x86_64/bin/launcher --node localhost --script ./launch.sh rtbkit/sample.launch.json
./launch.sh