#!/bin/bash

# usage text visible when --help flag passed in
usage="$(basename "$0") -- deploy the Cliques bidAgent controller, all necessary bidAgents & RTBKit Core, if not already running.

where:
    --help  show this help text
    -e arg (='production') environment flag - either 'dev' or 'production'.  Defaults to production"

# BEGIN environment parsing
env="production"

if [ ! -z $1 ]; then
  if [ $1 == '--help' ]; then
    echo "$usage"
    exit 0
  fi
fi

# fucking getopts
while getopts ":e:" opt; do
  case $opt in
    e)
      if [ "$OPTARG" != 'production' ] && [ "$OPTARG" != 'dev' ] && [ "$OPTARG" != 'local-test' ]; then
        echo "Invalid environment: $OPTARG.  Environment must be either 'dev', 'production', or 'local-test'"
        exit 1
      else
        env="$OPTARG"
      fi
      ;;
    \?)
      echo "Invalid option: -$OPTARG" >&2
      echo "$usage"
      exit 1
      ;;
    :)
      echo "Environment flag -$OPTARG requires an argument (either 'dev' or 'production')" >&2
      exit 1
      ;;
  esac
done
# END environment parsing

# Set proper environment variables now that env is set
if [ "$env" == "production" ]; then
    processname='bidAgentController'
else
    processname='bidAgentController_dev'
fi

source activate_env.sh -e $env
# if activate_env failed then bail
if [ $? -ne 0 ]; then
    exit $?
fi

# Need to be logged into to get @cliques packages
npm whoami
if [ $? -ne 0 ]; then
    npm login
fi
# run npm install to install any new dependencies
npm install

#pull any RTBKit submodule updates
git submodule update

#now make sure RTBKit Core is up and running, along with
#all background services
./deploy-rtbkit.sh

##make sure separate redis instance is running on 6380
#./setup/setup-redis.sh

#make sure latest configs are pulled
if [ ! -d $HOME"/repositories/cliques-config" ]; then
    git clone git@github.com:cliquesads/cliques-config.git ../cliques-config
    ln -s ../cliques-config config
else
    cd ../cliques-config
    git pull
    cd ../cliquesbidder
fi

running=$(pm2 list -m | grep "$processname")
if [ -z "$running" ]; then
    # hook PM2 up to web monitoring with KeyMetrics
    pm2 link $KEYMETRICS_PRIVATE_KEY $KEYMETRICS_PUBLIC_KEY $HOSTNAME
    # start in fork mode
    # NOTE: DO NOT EVER RUN IN CLUSTER MODE
    # Controller mechanism relies on a single in-memory record of
    # all child processes (i.e. bigagents), and will not work properly
    # if load-balanced across multiple instances.
    pm2 start index.js --name "$processname"
else
    pm2 gracefulReload "$processname"
fi

# setup logrotate
pm2 set pm2-logrotate:max_size $LOGROTATE_MAX_SIZE
pm2 set pm2-logrotate:compress $LOGROTATE_COMPRESS

exit 0
