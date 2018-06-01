#!/bin/sh
# This sets the crontab to run querycore.py every 5 minutes
# newline="*/5 * * * * cd /home/bliang/repositories/cliquesbidder; . ./activate_env.sh -e production; /usr/bin/python /home/bliang/repositories/cliquesbidder/querycorebidder/querycore.py > /home/bliang/repositories/cron.log\n"

VIRTUALENV_FOLDER="./venv"
if [ ! -d "VIRTUALENV_FOLDER" ]; then
	/home/bliang/.local/bin/virtualenv venv
	. venv/bin/activate
	pip install -r requirements.txt
fi

# This sets the crontab to run querycore.py every minutes
newline="* * * * * cd /home/bliang/repositories/cliquesbidder; . ./activate_env.sh -e production; . /home/bliang/repositories/cliquesbidder/querycorebidder/venv/bin/activate; python /home/bliang/repositories/cliquesbidder/querycorebidder/querycore.py > /home/bliang/repositories/cron.log\n"
(crontab -l; echo "$newline") | crontab -
