#!/bin/sh
newline="*5 * * * * /usr/local/bin/python /home/bliang/repositories/cliquesbidder/querycorebidder/querycore.py > /home/bliang/repositories/cron.log"
(crontab -l; echo "$newline") | crontab -
