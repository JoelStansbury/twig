
from http import HTTPStatus
import json
from pathlib import Path

from twig.client import APIClient

TEST_USER = {"username": "TestUser", "password": "password"}
TEST_SPACE = {"name": "MySpace"}

def test_create_user(client: APIClient):
    assert client.signup(TEST_USER).status_code == 200
    assert client.signup(TEST_USER).status_code == 409

def test_login(client):
    client.signup(TEST_USER)
    response = client.authenticate(TEST_USER)
    assert response.status_code == 200
    assert "access_token" in response.json()

def test_create_space(client):
    client.signup(TEST_USER)
    client.authenticate(TEST_USER)
    assert client.create_space(TEST_SPACE).status_code == 200
    assert client.create_space(TEST_SPACE).status_code == 409
    
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

def test_read_access(client):
    user1 = TEST_USER
    user2 = {'username': "SecondUser", "password":"password"}

    client.signup(user1)
    client.authenticate(user1)
    client.create_space(TEST_SPACE)
    client.put("/",TEST_SPACE['name'], "pass")
    assert client.get("/",TEST_SPACE['name']).json() == "pass"
    
    client.signup(user2)
    client.authenticate(user2)
    response = client.get("/",TEST_SPACE['name'])
    assert response.status_code == HTTPStatus.UNAUTHORIZED
    assert response.json() == {'detail': 'No membership status'}

def test_list_deletion(client):
    client.signup(TEST_USER)
    client.authenticate(TEST_USER)
    client.create_space(TEST_SPACE)
    client.put("/some_list", TEST_SPACE['name'], [1,2,3])
    assert client.get("/some_list/0", TEST_SPACE['name']).json() == 1
    assert client.delete("/some_list/0", TEST_SPACE['name']).status_code == 200
    assert client.get("/some_list/0", TEST_SPACE['name']).json() == 2
    assert client.delete("/some_list/0", TEST_SPACE['name']).status_code == 200
    assert client.get("/some_list/0", TEST_SPACE['name']).json() == 3
    assert client.delete("/some_list/0", TEST_SPACE['name']).status_code == 200
    assert client.get("/some_list/0", TEST_SPACE['name']).status_code == HTTPStatus.NOT_FOUND
