import os
import sys

def _looks_like_pytest() -> bool:
    if os.environ.get('PYTEST_CURRENT_TEST'):
        return True
    argv = ' '.join(str(a).lower() for a in sys.argv)
    return 'pytest' in argv

if _looks_like_pytest():
    os.environ.setdefault('PYTEST_DISABLE_PLUGIN_AUTOLOAD', '1')
