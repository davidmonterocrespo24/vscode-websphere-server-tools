# Changes the runtime trace specification (in memory only: a restart resets it).
import java
# Usage: wsadmin -f set_trace.py "<spec>"     e.g. "*=info:com.ibm.ws.websvcs.trace.*=all"
import sys
execfile(java.lang.System.getenv('WAS_TOOLS_JYTHON') + '/_env.py')
ts = AdminControl.completeObjectName('type=TraceService,process=%s,*' % SERVER)
print "before:", AdminControl.getAttribute(ts, 'traceSpecification')
AdminControl.setAttribute(ts, 'traceSpecification', sys.argv[0])
print "now:   ", AdminControl.getAttribute(ts, 'traceSpecification')
