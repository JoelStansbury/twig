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

PATH_REPL = {
    "\x00"
}


@app.get("/{space}")
def get(current_user: AuthenticatedUser, space: str, path: list[str | int], session:Session = Depends(get_session)) -> Any:
    membership = get_membership(current_user, space, session)
    return path_get(membership=membership, path=path, session=session)

@app.put("/{space}")
def put(current_user: AuthenticatedUser, space: str, path: list[str | int], value:Any, session:Session = Depends(get_session)) -> int:
    membership = get_membership(current_user, space, session)
    print(f"PUT {value} @ {path}")
    return path_put(membership=membership, path=path, value=value, session=session)

@app.delete("/{space}")
def delete(current_user: AuthenticatedUser, space: str, path: list[str | int], session:Session = Depends(get_session)):
    membership = get_membership(current_user, space, session)
    return path_delete(membership=membership, path=path, session=session)