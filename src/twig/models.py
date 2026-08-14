

from pydantic import BaseModel
from typing import Annotated, Literal, TypedDict

from fastapi import Depends

from .auth import oauth2_scheme

TokenStr = Annotated[str, Depends(oauth2_scheme)]
type JsonValue = dict[str, JsonValue] | list[JsonValue] | str | int | float | bool | None
ACTION = Literal["insert", "update", "delete", "subscribe", "unsubscribe"]

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
    action: Literal["PUT", "GET", "DELETE", "PEEK", "MATCH"]
    path: str
    space: str
    value: JsonValue = None

class WSQuery(BaseModel):
    action: Literal["subscribe", "unsubscribe"]
    path: str
    space: str

class ChangeMessage(TypedDict):
    space:str
    path:str
    action: ACTION
    value:JsonValue | None