# Adds the signer certificate presented by a remote host to the node trust store
import java
# (fixes CWPKI0022E / PKIX path building failed). Restart the server afterwards.
# Usage: wsadmin -f add_signer.py <host> <port> <alias>
import sys
execfile(java.lang.System.getenv('WAS_TOOLS_JYTHON') + '/_env.py')
host, port, alias = sys.argv[0], sys.argv[1], sys.argv[2]
print "Certificate presented by %s:%s ->" % (host, port)
print AdminTask.retrieveSignerInfoFromPort('[-host %s -port %s]' % (host, port))
print AdminTask.retrieveSignerFromPort('[%s -host %s -port %s -certificateAlias %s]' % (TRUST, host, port, alias))
AdminConfig.save()
print "Saved. Check:"
for c in AdminTask.listSignerCertificates('[%s]' % TRUST).splitlines():
    if c.find(alias) >= 0:
        print c
