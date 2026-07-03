
from http import HTTPStatus
import json
from pathlib import Path
from typing import Any

import pytest

from twig.client import APIClient

TEST_USER = {"username": "TestUser", "password": "password"}
TEST_SPACE = {"name": "MySpace"}

def test_create_user(unconfigured_client: APIClient) -> None:
    assert unconfigured_client.signup(TEST_USER).status_code == 200
    assert unconfigured_client.signup(TEST_USER).status_code == 409

def test_login(unconfigured_client: APIClient) -> None:
    unconfigured_client.signup(TEST_USER)
    response = unconfigured_client.authenticate(TEST_USER)
    assert response.status_code == 200
    assert "access_token" in response.json()

def test_create_space(unconfigured_client: APIClient) -> None:
    unconfigured_client.signup(TEST_USER)
    unconfigured_client.authenticate(TEST_USER)
    assert unconfigured_client.create_space(TEST_SPACE).status_code == 200
    assert unconfigured_client.create_space(TEST_SPACE).status_code == 409
    
def test_put(client: APIClient, test_space:str) -> None:
    """
    Tests the PUT endpoint functionality by 
    - signing up a user
    - authenticating to receive a token
    - creating a space
    - and putting a data value within that space
    """
    response = client.put("", test_space, {"path": {"to": {"my": {"datum":{}}}}})
    assert response.status_code == 200
    response = client.put("/path/to/my/datum", test_space, 500)
    if response.status_code != 200:
        assert False, response.__dict__

def test_api_get(client: APIClient, test_space:str) -> None:
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
    client.put("", test_space, {"path":{"to":{"my":{"datum/":0}}}})
    client.put("/path/to/my/datum~1", test_space, 500)

    response = client.get("/path/to/my/datum~1", test_space)
    assert response.json() == 500

    response = client.get("/path/to", test_space)
    assert response.json()["my"]["datum/"] == 500

    response = client.get("", test_space)
    assert response.json()["path"]["to"]["my"]["datum/"] == 500, response

def test_delete(client: APIClient, test_space:str) -> None:
    # 1. Setup: Authenticate
    client.put("/path/to/delete/me", test_space, "temp")
    response = client.delete("/path/to/delete/me", test_space)
    assert response.status_code == 200
    assert client.get("/path/to/delete/me", test_space).status_code == 404

def test_real_data(client: APIClient, test_space:str) -> None:
    filename = Path(__file__).parent/"fixtures/json/cofax.json"
    data = json.loads(filename.read_text())
    client.put("", test_space, data)
    response = client.get("", test_space)
    assert data == response.json()
    assert client.get("/web-app/taglib/taglib-uri", test_space).json() == "cofax.tld"
    assert client.get("/web-app/servlet/0/servlet-name", test_space).json() == "cofaxCDS"


    response = client.get("/web-app/servlet", test_space)
    assert isinstance(response.json(), list)

def test_read_access(client: APIClient, test_space:str) -> None:
    client.put("",test_space, {})
    client.put("/",test_space, "pass")
    assert client.get("/",test_space).json() == "pass"
    
    user2 = {'username': "SecondUser", "password":"password"}
    client.signup(user2)
    client.authenticate(user2)
    response = client.get("/",test_space)
    assert response.status_code == HTTPStatus.UNAUTHORIZED
    assert response.json() == {'detail': 'No membership status'}

def test_list_deletion(client: APIClient, test_space:str) -> None:
    client.put("",test_space, {})
    client.put("/some_list", test_space, [1,2,3])
    assert client.get(   "/some_list/0", test_space).json() == 1
    assert client.delete("/some_list/0", test_space).status_code == 200
    assert client.get(   "/some_list/0", test_space).json() == 2
    assert client.delete("/some_list/0", test_space).status_code == 200
    assert client.get(   "/some_list/0", test_space).json() == 3
    assert client.delete("/some_list/0", test_space).status_code == 200
    assert client.get(   "/some_list/0", test_space).status_code == HTTPStatus.NOT_FOUND

@pytest.mark.timeout(1)
def test_watch_put(client: APIClient, test_space:str) -> None:
    with client.websocket() as ws:
        ws.send_json({
            "action": "subscribe",
            "path": "/settings/theme",
            "space": test_space
        })
        message = ws.receive_json()
        assert message == {
            "action": "subscribed",
            "path": "/settings/theme",
            "space": test_space,
        }, message

        response = client.put("",test_space,{"settings": {"theme": "dark"}},)
        assert response.status_code == HTTPStatus.OK

        message = ws.receive_json()
        assert message == [{
            "action": "insert",
            "path": "/settings/theme",
            "value": "dark",
            "space": test_space
        }], message


@pytest.mark.timeout(1)
def test_watch_order_of_delete_messages(client: APIClient, test_space:str) -> None:
    with client.websocket() as ws:
        ws.send_json({
            "action": "subscribe",
            "path": "",
            "space": test_space
        })
        message = ws.receive_json()
        response = client.put("",test_space,{"settings": {"theme": "dark"}})
        assert response.status_code == HTTPStatus.OK

        base = {"action": "insert", "space": test_space}
        expect: list[dict[str, Any]] = [
            {**base, "path": "", "value": {}},
            {**base, "path": "/settings", "value": {}},
            {**base, "path": "/settings/theme", "value": "dark"},
        ]

        message = ws.receive_json(mode="text")
        assert message == expect, message

        response = client.delete("",test_space)
        base:dict[str, Any] = {"action": "delete", "space": test_space, "value": None}
        expect: list[dict[str, Any]] = [
            {**base, "path": "/settings/theme"},
            {**base, "path": "/settings"},
            {**base, "path": ""},
        ]

        message = ws.receive_json(mode="text")
        for msg in message:
            print(msg)
        assert message == expect, message

