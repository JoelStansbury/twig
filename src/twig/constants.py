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


RFC_6901 = {
    "~0": "~",
    "~1": "/",
}
def rfc_6901_unescape(path:list[str]):
    for i in len(path):
        for k,v in RFC_6901.items():
            path[i] = path[i].replace(k, v)
