
from pydantic import BaseModel
from typing import Annotated, Literal, Optional

from fastapi import Depends

from .auth import oauth2_scheme

TokenStr = Annotated[str, Depends(oauth2_scheme)]
JSON_DATA = dict | list | int | float | str | None
ACTION = Literal["PUT", "GET", "DELETE"]

class Token(BaseModel):
    access_token: TokenStr
    token_type: str


class TokenData(BaseModel):
    username: str | None = None


class Membership:
    owner = 10
    edit = 5
    view = 1

class CreateSpaceQuery(BaseModel):
    name: str

class ApiQuery(BaseModel):
    action: ACTION
    path: str
    value: Optional[str] = None