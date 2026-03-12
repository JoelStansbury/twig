import os
from pathlib import Path

_HERE = Path(__file__).parent
_SRC = _HERE.parent
ROOT = _SRC.parent

PORT = os.environ.get("QR_SERVER_PORT", 8000)
"""What port to host the server on... this must be port-forwarded in order to make it public"""

DATABASE_PATH = ROOT / "database.db"
"""Where should the database be stored"""


SECRET_KEY = (ROOT / "secret").read_text()
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 30
