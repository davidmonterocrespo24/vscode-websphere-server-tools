# Lists applications (started/stopped), business-level applications and their composition units.
# Read only. A composition unit that cannot be read is reported as possibly ORPHANED
# (left behind by a failed update; it blocks reinstalling an application with the same name).
# Usage: wsadmin -f list_apps.py [nameFilter]
import sys
f = ''
if len(sys.argv) > 0:
    f = sys.argv[0]
print "== Applications %s==" % (f and "(%s) " % f or "")
for a in AdminApp.list().splitlines():
    if a.find(f) >= 0:
        state = 'STOPPED'
        if AdminControl.completeObjectName('type=Application,name=%s,*' % a):
            state = 'started'
        print "  %-50s [%s]" % (a, state)
print "== Business-level applications =="
for b in AdminTask.listBLAs().splitlines():
    if b.find(f) >= 0:
        print "  " + b
        try:
            print "     CUs: " + AdminTask.listCompUnits('-blaID ' + b)
        except:
            print "     CUs: ERROR reading -> possibly ORPHANED composition unit:", sys.exc_info()[1]
