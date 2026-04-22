
import json
from pathlib import Path

from twig.client import APIClient

TEST_USER = {"username": "TestUser", "password": "password"}
TEST_SPACE = {"name": "MySpace"}

def test_create_user(client: APIClient):
    response = client.signup(TEST_USER)
    assert response.status_code == 200

def test_login(client):
    client.signup(TEST_USER)
    response = client.authenticate(TEST_USER)
    assert response.status_code == 200
    assert "access_token" in response.json()

def test_create_space(client):
    client.signup(TEST_USER)
    client.authenticate(TEST_USER)
    response = client.create_space(TEST_SPACE)
    assert response.status_code == 200
    
def test_put(client):
    """
    Tests the PUT endpoint functionality by 
    - signing up a user
    - authenticating to receive a token
    - creating a space
    - and putting a data value within that space
    """
    client.signup(TEST_USER)
    client.authenticate(TEST_USER)
    client.create_space(TEST_SPACE)
    response = client.put("/path/to/my/datum",TEST_SPACE['name'], "500")
    assert response.status_code == 200

def test_get(client):
    """
    Tests the GET functionality of the API by verifying that
    data can be retrieved at different levels of granularity
    (full space, partial path, and specific key) after a user
    has 
    1. signed up
    2. authenticated
    3. created a space
    4. stored a value
    """
    client.signup(TEST_USER)
    client.authenticate(TEST_USER)
    client.create_space(TEST_SPACE)
    client.put("/path/to/my/datum~1", TEST_SPACE['name'], 500)

    response = client.get("/path/to/my/datum~1", TEST_SPACE['name'])
    assert response.json() == 500

    response = client.get("/path/to", TEST_SPACE['name'])
    assert response.json()["my"]["datum/"] == 500

    response = client.get("", TEST_SPACE['name'])
    assert response.json()["path"]["to"]["my"]["datum/"] == 500, response

def test_delete(client):
    # 1. Setup: Authenticate
    client.signup(TEST_USER)
    client.authenticate(TEST_USER)
    client.create_space(TEST_SPACE)
    client.put("/path/to/delete/me", TEST_SPACE['name'], "temp")
    response = client.delete("/path/to/delete/me", TEST_SPACE['name'])
    assert response.status_code == 200
    assert client.get("/path/to/delete/me", TEST_SPACE['name']).status_code == 404

def test_real_data(client):
    filename = Path(__file__).parent/"fixtures/json/cofax.json"
    data = json.loads(filename.read_text())
    client.signup(TEST_USER)
    client.authenticate(TEST_USER)
    client.create_space(TEST_SPACE)
    client.put("", TEST_SPACE['name'], data)
    response = client.get("", TEST_SPACE['name'])
    assert data == response.json()
    assert client.get("/web-app/taglib/taglib-uri", TEST_SPACE['name']).json() == "cofax.tld"
    assert client.get("/web-app/servlet/0/servlet-name", TEST_SPACE['name']).json() == "cofaxCDS"