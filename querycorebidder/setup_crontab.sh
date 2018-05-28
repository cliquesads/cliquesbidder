#!/bin/sh
# This sets the crontab to run querycore.py every 5 minutes
# newline="*/5 * * * * /usr/bin/python /home/bliang/repositories/cliquesbidder/querycorebidder/querycore.py > /home/bliang/repositories/cron.log"

# This sets the crontab to run querycore.py every minutes
newline="* * * * * /usr/bin/python /home/bliang/repositories/cliquesbidder/querycorebidder/querycore.py > /home/bliang/repositories/cron.log\n"
(crontab -l; echo "$newline") | crontab -
