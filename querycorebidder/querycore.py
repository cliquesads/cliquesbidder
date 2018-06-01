import pygerduty
import os
import requests
import time
import datetime
from jsonconfig import JsonConfigParser

config = JsonConfigParser()

pd_api_key = config.get('PagerDuty', 'api_key')
pd_subdomain = config.get('PagerDuty', 'subdomain')
pd_service_key = config.get('PagerDuty', 'service_key')

if __name__ == '__main__':
    # If the core bidder is running, it should get:
    # {"error":"UNKNOWN_RESOURCE: There is no handler for the requested resource '/'"}
    # otherwise if the core bidder is NOT running, it should get a connection error
    st = datetime.datetime.fromtimestamp(time.time()).strftime('%Y-%m-%d %H:%M:%S')
    env = os.environ.get('ENV', None)
    rtbkit_address = 'http://127.0.0.1:12339'
    try:
        r = requests.get(rtbkit_address)
        print("%s --- %s, ENV: %s" % (st, r.text, env))
    except requests.ConnectionError, e:
        # Trigger incident in PagerDuty, then write out to log file
        hostname = os.uname()[1]
        msg = "[%s] Cannot reach RTBKit core at %s. " \
              "Please check that the RTBKit Core is operational on host %s. (ENV = %s) " \
              % (hostname, rtbkit_address, hostname,env)
        if env == 'production':
            pager = pygerduty.PagerDuty(pd_subdomain, pd_api_key)
            pager.trigger_incident(pd_service_key, msg)
            print("%s --- ERROR: Sent following message to pagerduty: '%s'" % (st, msg))
        else:
            print("%s --- ERROR: Connection error detected but message not sent to PagerDuty (ENV = %s): '%s'" % (st, env, msg))

