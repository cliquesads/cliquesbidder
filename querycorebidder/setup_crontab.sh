#!/bin/sh
# This sets the crontab to run querycore.py every 5 minutes
# newline="*/5 * * * * cd /home/bliang/repositories/cliquesbidder; . ./activate_env.sh -e production; /usr/bin/python /home/bliang/repositories/cliquesbidder/querycorebidder/querycore.py > /home/bliang/repositories/cron.log\n"


# This sets the crontab to run querycore.py every minutes
newline="* * * * * cd /home/bliang/repositories/cliquesbidder; . ./activate_env.sh -e production; /usr/bin/python /home/bliang/repositories/cliquesbidder/querycorebidder/querycore.py > /home/bliang/repositories/cron.log\n"
(crontab -l; echo "$newline") | crontab -
