# Lists the trusted signer certificates of the node trust store. Read only.
import java
# Usage: wsadmin -f list_signers.py
execfile(java.lang.System.getenv('WAS_TOOLS_JYTHON') + '/_env.py')
for c in AdminTask.listSignerCertificates('[%s]' % TRUST).splitlines():
    print c
