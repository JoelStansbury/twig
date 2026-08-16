
from http import HTTPStatus
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

def test_read_access(client: APIClient, test_space:str) -> None:
    client.put("/",test_space, "pass")
    assert client.get("/",test_space).json() == "pass"
    
    user2 = {'username': "SecondUser", "password":"password"}
    client.signup(user2)
    client.authenticate(user2)
    response = client.get("/",test_space)
    assert response.status_code == HTTPStatus.UNAUTHORIZED
    assert response.json() == {'detail': 'No membership status'}

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
            {**base, "path": "/settings/theme", "value": "dark"},
        ]

        message = ws.receive_json(mode="text")
        assert message == expect, message

        response = client.delete("",test_space)
        base:dict[str, Any] = {"action": "delete", "space": test_space, "value": None}
        expect: list[dict[str, Any]] = [
            {**base, "path": "/settings/theme"}
        ]

        message = ws.receive_json(mode="text")
        for msg in message:
            print(msg)
        assert message == expect, message

def test_peek_and_match(client: APIClient, test_space: str) -> None:
    """
    Verifies the precision of peek and match functions.
    """
    # Setup: Create a structured tree
    # Structure:
    # /a/b/c -> 1
    # /a/b/d -> 2
    # /a/x/y -> 3
    # /a/x/z -> 4

    client.put("/a/b/c", test_space, {"val": 1})
    client.put("/a/b/d", test_space, {"val": 2})
    client.put("/a/x/y", test_space, {"val": 3})
    client.put("/a/x/z", test_space, {"val": 4})

    # --- Test 1: Peek ---
    # Peeking into /a/b should return ['c', 'd']
    # Peeking into /a/x should return ['y', 's']
    # Peeking into /a/ should return ['b', 'x']

    # We need to ensure 'b' and 'x' are captured from /a/
    assert client.peek("/a", test_space).json() == ["b", "x"]
    assert client.peek("/a/b", test_space).json() == ["c", "d"]
    assert client.peek("/a/x", test_space).json() == ["y", "z"]

    # Peeking into a non-existent leaf should be empty
    assert client.peek("/a/b/c/deep", test_space).json() == []

    # --- Test 2: Match (Wildcard) ---
    # Testing /a/*/* should return all combinations of the two levels
    # Expected: [['b', 'c'], ['b', 'd'], ['x', 'y'], ['x', 'z']] (order might vary)

    # We need to handle the case where the path input is /a/*/*
    # The match should find all leaf combinations at that depth
    matches = client.match("/a/*/*", test_space).json()

    # We need to sort to ensure comparison works
    sorted_matches = set([tuple(m) for m in matches])
    expected = set([
        ('b', 'c'),
        ('b', 'd'),
        ('x', 'y'),
        ('x', 'z'),
    ])

    assert sorted_matches == expected

    matches = client.match("/a/*", test_space).json()
    match_set = set([tuple(x) for x in matches])
    assert match_set == set([('b',), ('x',)])

def test_edge_cases(client: APIClient, test_space: str) -> None:
    # Test the "" (empty string) path which is actually // in the DB
    client.put("//empty", test_space, "empty_value")

    assert client.peek("", test_space).json() == [""]
    assert client.peek("/", test_space).json() == ["empty"]
    assert client.match("/*", test_space).json() == [[""]]
    assert client.match("/*/*", test_space).json() == [["", "empty"]]