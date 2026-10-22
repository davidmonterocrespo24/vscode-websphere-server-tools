# Maps shared libraries to an application (they are lost when an application is reinstalled
import java
# from scratch), saves the configuration and restarts only that application.
# Usage: wsadmin -f map_shared_libs.py <applicationName> <lib1+lib2+...>
import sys
execfile(java.lang.System.getenv('WAS_TOOLS_JYTHON') + '/_env.py')
app = sys.argv[0]
libs = sys.argv[1]
print "Before:"
print AdminApp.view(app, ['-MapSharedLibForMod'])
AdminApp.edit(app, ['-MapSharedLibForMod', [[app, 'META-INF/application.xml', libs]]])
AdminConfig.save()
print "After:"
print AdminApp.view(app, ['-MapSharedLibForMod'])
am = app_manager()
print "Restarting %s..." % app
AdminControl.invoke(am, 'stopApplication', app)
AdminControl.invoke(am, 'startApplication', app)
print "Started:", AdminControl.completeObjectName('type=Application,name=%s,*' % app) != ''
