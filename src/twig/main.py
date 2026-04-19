import json
from typing import Any

from fastapi import Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import SQLModel, Session


from .operations import (
    AuthenticatedUser,
    get_membership,
    path_get,
    path_put,
    user_create,
    user_login,
    space_create_new,
    path_delete,
)
from .db.connection import engine, get_session


SQLModel.metadata.create_all(engine, checkfirst=True)

# Create a FastAPI instance
app = FastAPI()

app.add_middleware(CORSMiddleware, allow_origins=["*"])
app.add_api_route("/signup", endpoint=user_create, methods=["PUT"])
app.add_api_route("/token", endpoint=user_login, methods=["POST"])
app.add_api_route("/space/create", endpoint=space_create_new, methods=["PUT"])

def separate_path(space_path: str):
    if "/" in space_path:
        space, *path = space_path.split('/')
        path = [x.replace("~1", "/").replace("~0", "~") for x in path]
        return space, path
    else:
        return space_path, []

@app.get("/api/{space_path:path}")
def get(current_user: AuthenticatedUser, space_path: str, session:Session = Depends(get_session)) -> Any:
    space, path = separate_path(space_path)
    membership = get_membership(current_user, space, session)
    return path_get(membership=membership, path=path, session=session)

@app.put("/api/{space_path:path}")
def put(current_user: AuthenticatedUser, space_path: str, value:str, session:Session = Depends(get_session)) -> int:
    print(space_path)
    value = json.loads(value)
    space, path = separate_path(space_path)
    membership = get_membership(current_user, space, session)
    return path_put(membership=membership, path=path, value=value, session=session)

@app.delete("/api/{space_path:path}")
def delete(current_user: AuthenticatedUser, space_path: str, session:Session = Depends(get_session)):
    space, path = separate_path(space_path)
    membership = get_membership(current_user, space, session)
    return path_delete(membership=membership, path=path, session=session)