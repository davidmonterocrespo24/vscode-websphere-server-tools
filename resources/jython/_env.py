# Shared helpers for the bundled wsadmin (Jython 2.x) scripts.
# The extension passes WAS_CELL, WAS_NODE and WAS_SERVER as environment variables.
import java.lang.System as _System

def getenv(name, default=None):
    v = _System.getenv(name)
    if v is None or v == '':
        return default
    return v

CELL = getenv('WAS_CELL')
NODE = getenv('WAS_NODE')
SERVER = getenv('WAS_SERVER', 'server1')
TRUST = '-keyStoreName NodeDefaultTrustStore -keyStoreScope (cell):%s:(node):%s' % (CELL, NODE)

def app_manager():
    return AdminControl.queryNames('type=ApplicationManager,process=%s,*' % SERVER)
