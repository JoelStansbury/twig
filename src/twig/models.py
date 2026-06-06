
from pydantic import BaseModel
from typing import Annotated, Literal

from fastapi import Depends

from .auth import oauth2_scheme

TokenStr = Annotated[str, Depends(oauth2_scheme)]
type JsonValue = dict[str, JsonValue] | list[JsonValue] | str | int | float | bool | None
ACTION = Literal["PUT", "GET", "DELETE", "subscribe", "unsubscribe"]

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
    space: str
    value: JsonValue = None