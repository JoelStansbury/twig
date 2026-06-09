from typing import Generator

import pytest
from sqlmodel import Session
from sqlalchemy import Connection
from fastapi.testclient import TestClient

from twig.client import APIClient
from twig.main import app
from twig.db.connection import get_session, engine


TEST_USER = {"username": "TestUser", "password": "password"}
TEST_SPACE = {"name": "MySpace"}

#
# Connection per test
#
@pytest.fixture
def db_connection():

    connection = engine.connect()
    transaction = connection.begin()

    yield connection

    transaction.rollback()
    connection.close()


#
# Session per test
#
@pytest.fixture
def db_session(db_connection: Connection):

    session = Session(bind=db_connection)

    yield session

    session.close()


#
# FastAPI client with dependency override
#
@pytest.fixture
def unconfigured_client(db_session: Session) -> Generator[APIClient]:

    def override_get_session() -> Generator[Session]:
        yield db_session

    app.dependency_overrides[get_session] = override_get_session

    with TestClient(app) as client:
        yield APIClient(client)

    app.dependency_overrides.clear()

@pytest.fixture
def test_space():
    return TEST_SPACE["name"]

@pytest.fixture
def client(unconfigured_client: APIClient):
    unconfigured_client.signup(TEST_USER)
    unconfigured_client.authenticate(TEST_USER)
    unconfigured_client.create_space(TEST_SPACE)
    return unconfigured_client