from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from sqlmodel import SQLModel

from twig.operations.api import api

from .operations import (
    user_create,
    user_login,
    space_create_new,
    watch
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
app.add_api_route("/create", endpoint=space_create_new, methods=["POST"])
app.add_api_route("/api", endpoint=api, methods=["POST"])
app.include_router(watch.router)
