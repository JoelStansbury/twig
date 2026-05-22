from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import SQLModel

from .operations import (
    path_get,
    path_put,
    user_create,
    user_login,
    space_create_new,
    path_delete,
)
from .db.connection import engine


SQLModel.metadata.create_all(engine, checkfirst=True)

# Create a FastAPI instance
app = FastAPI()



app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # for debugging only
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_api_route("/signup", endpoint=user_create, methods=["POST"])
app.add_api_route("/token", endpoint=user_login, methods=["POST"])
app.add_api_route("/create", endpoint=space_create_new, methods=["PUT"])
app.add_api_route("/", endpoint=path_put, methods=["PUT"])
app.add_api_route("/", endpoint=path_get, methods=["GET"])
app.add_api_route("/", endpoint=path_delete, methods=["DELETE"])
