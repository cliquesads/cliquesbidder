#!/bin/sh
# This sets the crontab to run querycore.py every 5 minutes

# first install system dependencies
sudo apt-get update
# system pip, only used to install virtualenv. From then on, venv pip will be used.
sudo apt-get install python-pip
sudo apt-get install openssl
sudo apt-get install python-dev
sudo apt-get install libffi-dev

# now install virtualenv
# running into SSL errors w/ system pip cause it uses the non-secure endpoint, so point
# it directly at the SSL endpoint for now with -i flag.
sudo -H pip install virtualenv -i https://pypi.python.org/simple/
sudo -H pip install --upgrade virtualenv -i https://pypi.python.org/simple/

VIRTUALENV_FOLDER="./venv"
if [ ! -d "VIRTUALENV_FOLDER" ]; then
	virtualenv venv
	. venv/bin/activate
	pip install -r requirements.txt
fi

# This sets the crontab to run querycore.py every minutes
newline="*/5 * * * * cd /home/bliang/repositories/cliquesbidder/querycorebidder; . /home/bliang/repositories/cliquesbidder/querycorebidder/activate; python /home/bliang/repositories/cliquesbidder/querycorebidder/querycore.py >> /home/bliang/rtbkit_logs/cron.log 2>&1"
(crontab -l; echo "$newline") | crontab -
echo "Core checkup script cron'd to run every five (5) minutes."

exit 0
