import pygerduty
import sys
import traceback
import os
import sys
import requests
import time
import datetime

from jsonconfig import JsonConfigParser

def create_pd_event_wrapper(subdomain, api_key, service_key):
    def create_pd_event(msg):
        msg = msg[:1024]
        pager = pygerduty.PagerDuty(subdomain, api_key)
        pager.trigger_incident(service_key, msg)
    return create_pd_event

def stacktrace_to_pd_event(subdomain, api_key, service_key):
    exc_type, exc_value, exc_tb = sys.exc_info()
    stack = traceback.format_exception(exc_type, exc_value, exc_tb)
    stack = ''.join(stack).format()
    pager = pygerduty.PagerDuty(subdomain, api_key)
    stack = stack[:1024]
    pager.trigger_incident(service_key, stack)

config = JsonConfigParser()

pd_api_key = config.get('PagerDuty', 'api_key')
pd_subdomain = config.get('PagerDuty', 'subdomain')
pd_service_key = config.get('PagerDuty', 'service_key')
if os.environ.get('NODE_ENV', None) == 'production':
    pd_error_callback = create_pd_event_wrapper(pd_subdomain, pd_api_key, pd_service_key)
else:
    pd_error_callback = None

if __name__ == '__main__':
    # If the core bidder is running, it should get:
    # {"error":"UNKNOWN_RESOURCE: There is no handler for the requested resource '/'"}
    # otherwise if the core bidder is NOT running, it should get a connection error
    try:
        r = requests.get('http://127.0.0.1:12339')
        st = datetime.datetime.fromtimestamp(time.time()).strftime('%Y-%m-%d %H:%M:%S')
        print(st + " --- " + r.text + ', NODE_ENV: ' + os.environ.get('NODE_ENV', None) + '\n')
    except requests.ConnectionError, e:
        # Trigger incident in PagerDuty, then write out to log file
        if os.environ.get('NODE_ENV', None) == 'production':
            stacktrace_to_pd_event(pd_subdomain, pd_api_key, pd_service_key)
