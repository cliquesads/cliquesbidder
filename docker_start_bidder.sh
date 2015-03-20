#!/bin/bash

set -e

REPOSITORY_DIR=$HOME/repositories
CONFIG_DIR=$REPOSITORY_DIR/cliques-config/rtbkit/dep_config
APACHE_DIR=/etc/apache2
LOCAL_DIR=$REPOSITORY_DIR/cliquesbidder/rtbkit

cd $LOCAL_DIR
source rtbkit-*.sh

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
cd $LOCAL_DIR

#flag -m specifies whether to run mock_exchange or not
while getopts ":m:" opt; do
  case $opt in
    m)
      echo "-m is a flag, don't understand argument $OPTARG but I assume you want to run the mock_exchange" >&2
      ;;
    \?)
      echo "Invalid option: -$OPTARG" >&2
      echo "Use -m flag to indicate whether or not you want to run mock_exchange"
      exit 1
      ;;
    :)
      ./bin/mock_exchange_runner >& /tmp/mock_exchange_runner.out &
      ;;
  esac
done

#make symlink to config dir in parent directory if one doesn't already exist
if [ ! -L 'cliquesconfig' ]; then
    ln -s ../config/rtbkit cliquesconfig
fi

#launch the bidder itself
./build/x86_64/bin/launcher --node localhost --script ./launch.sh cliquesconfig/launch.json
./launch.sh