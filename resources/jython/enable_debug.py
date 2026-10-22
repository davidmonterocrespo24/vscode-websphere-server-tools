# Enables the JVM debug mode (JDWP) of the server so a debugger can attach. Needs a server restart.
import java
# Usage: wsadmin -f enable_debug.py <port>
import sys
execfile(java.lang.System.getenv('WAS_TOOLS_JYTHON') + '/_env.py')
port = sys.argv[0]
srv = AdminConfig.getid('/Cell:%s/Node:%s/Server:%s/' % (CELL, NODE, SERVER))
jvm = AdminConfig.list('JavaVirtualMachine', srv).splitlines()[0]
import re
old = AdminConfig.showAttribute(jvm, 'debugArgs') or ''
jdwp = '-agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=%s' % port
if re.search(r'-(agentlib:jdwp|Xrunjdwp)\S*', old):
    args = re.sub(r'-(agentlib:jdwp|Xrunjdwp)\S*', jdwp, old)
else:
    args = (old + ' ' + jdwp).strip()
print "before:", AdminConfig.showAttribute(jvm, 'debugMode'), AdminConfig.showAttribute(jvm, 'debugArgs')
AdminConfig.modify(jvm, [['debugMode', 'true'], ['debugArgs', args]])
AdminConfig.save()
print "now:   ", AdminConfig.showAttribute(jvm, 'debugMode'), AdminConfig.showAttribute(jvm, 'debugArgs')
print "Restart the server to apply."
