import pytest
from sqlmodel import Session
from fastapi.testclient import TestClient

from twig.client import APIClient
from twig.main import app
from twig.db.connection import get_session, engine

from urllib.parse import urlencode

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
def db_session(db_connection):

    session = Session(bind=db_connection)

    yield session

    session.close()


#
# FastAPI client with dependency override
#
@pytest.fixture
def client(db_session):

    def override_get_session():
        yield db_session

    app.dependency_overrides[get_session] = override_get_session

    with TestClient(app) as client:
        yield APIClient(client)

    app.dependency_overrides.clear()
