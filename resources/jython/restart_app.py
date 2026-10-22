# Stops and starts one application without restarting the server.
import java
# Usage: wsadmin -f restart_app.py <applicationName>
import sys
execfile(java.lang.System.getenv('WAS_TOOLS_JYTHON') + '/_env.py')
app = sys.argv[0]
am = app_manager()
print "Stopping %s..." % app
AdminControl.invoke(am, 'stopApplication', app)
print "Starting %s (can take a few minutes)..." % app
AdminControl.invoke(am, 'startApplication', app)
print "Started:", AdminControl.completeObjectName('type=Application,name=%s,*' % app) != ''
