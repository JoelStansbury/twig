from datetime import datetime, timedelta, timezone
from typing import Any
from fastapi.security import OAuth2PasswordBearer
import jwt
from pwdlib import PasswordHash

from .constants import ALGORITHM, SECRET_KEY


password_hash = PasswordHash.recommended()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")


def verify_password(plain_password:str, hashed_password:str):
    return password_hash.verify(plain_password, hashed_password)


def get_password_hash(password:str):
    return password_hash.hash(password)


def create_access_token(data: dict[str, Any], expires_delta: timedelta | None = None):
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=15)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM) # type:ignore
    return encoded_jwt
