#!/bin/bash

# This is a wrapper for the rtbkit/launch.sh launcher script which makes sure
# all necessary background services are running before RTBKit is launched.
#
# If RTBKit is already up and running with all necessary background services, running
# this will do nothing.

set -e

# set path variables
REPOSITORY_DIR=$HOME/repositories
CONFIG_DIR=$REPOSITORY_DIR/cliques-config/rtbkit/dep_config
APACHE_DIR=/etc/apache2
LOCAL_DIR=$REPOSITORY_DIR/cliquesbidder/rtbkit

cd $LOCAL_DIR
source rtbkit-*.sh

# TODO: Is this entirely necessary in start-script? should probably be done on
# TODO: submodule update
#cd $LOCAL_DIR/examples
#make all

######################################################
## START BACKGROUND SERVICES IF NOT ALREADY RUNNING ##
######################################################

# Start PostGreSQL for graphite monitoring
if ! pgrep postgres > /dev/null; then
    sudo /etc/init.d/postgresql start
else
    echo "Postgres is already running, skipping..."
fi

# Start Apache ZooKeeper
# hacked for now to use zookeeper installed in platform-deps
# cause version in binary install can't find classpath for some reason
ZOOKEEPERPROC=$(ps -ef | grep -c 'java -Dzookeeper')
#only start if it's currently running
#proc == 2 means that it's running, cause ps -ef | grep also runs a
#process to auto-color whatever you're grepping, thus output will always >=1
#even if it's not running
if [ ! $ZOOKEEPERPROC -eq '2' ]; then
    $HOME/local/bin/zookeeper/bin/zkServer.sh start
else
    echo "Zookeeper is already running, skipping..."
fi

# Start RTBKit Redis Instance if not already running.
REDISPROC='redis-server '$CONFIG_DIR'/redis.conf'
REDIS_RUNNING=$(ps -ef | grep -c "$REDISPROC")
if [ ! $REDIS_RUNNING -eq '2' ]; then
    $REDISPROC
else
    echo "Redis RTBKit instance is already running, skipping..."
fi

# Start Carbon
if ! pgrep carbon-cache.py > /dev/null; then
    sudo /opt/graphite/bin/carbon-cache.py start
else
    echo "Carbon-cache is already running, skipping..."
fi

# Restart apache
sudo service apache2 restart

#make symlink to config dir in parent directory if one doesn't already exist
if [ ! -L 'cliquesconfig' ]; then
    ln -s ../config/rtbkit cliquesconfig
fi

#launch the bidder itself
if ! pgrep tmux; then
    ./launch.sh
else
    echo "RTBKit Core is is already running, skipping..."
fi

exit 0