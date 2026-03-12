
from pydantic import BaseModel
from typing import Annotated

from fastapi import Depends

from .auth import oauth2_scheme

TokenStr = Annotated[str, Depends(oauth2_scheme)]


class Token(BaseModel):
    access_token: TokenStr
    token_type: str


class TokenData(BaseModel):
    username: str | None = None


class Membership:
    owner = 10
    edit = 5
    view = 1
