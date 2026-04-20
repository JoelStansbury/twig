import json
from urllib.parse import urlencode
TEST_USER = {"username": "TestUser", "password": "password"}
TEST_SPACE = {"name": "MySpace"}

def test_create_user(client):
    response = client.put("/signup", data=TEST_USER)
    assert response.status_code == 200

def test_login(client):
    client.put("/signup", data=TEST_USER)
    response = client.post("/token", data=TEST_USER)
    assert response.status_code == 200
    assert "access_token" in response.json()

def test_create_space(client):
    client.put("/signup", data=TEST_USER)
    token = client.post("/token", data=TEST_USER).json()
    response = client.put(
        f"/space/create?{urlencode(TEST_SPACE)}",
        headers={
            "Authorization": f"Bearer {token['access_token']}",
            "Content-Type": "application/json",
        }
    )
    assert response.status_code == 200
    assert isinstance(response.json(), int) # This is the ID of the new DataSpace
    
def test_put(client):
    client.put("/signup", data=TEST_USER)
    token = client.post("/token", data=TEST_USER).json()
    client.put(
        f"/space/create?{urlencode(TEST_SPACE)}",
        headers={
            "Authorization": f"Bearer {token['access_token']}",
            "Content-Type": "application/json",
        }
    ).json()

    query = {
        "path": "path/to/my/datum",
        "space": TEST_SPACE['name'],
        "value": "500"
    }
    response = client.put(
        f"/?{urlencode(query)}",
        headers={
            "Authorization": f"Bearer {token['access_token']}",
            "Content-Type": "application/json",
        }
    )
    assert response.status_code == 200

def test_get(client):
    client.put("/signup", data=TEST_USER)
    token = client.post("/token", data=TEST_USER).json()
    headers = {
        "Authorization": f"Bearer {token['access_token']}",
        "Content-Type": "application/json",
    }
    space = client.put(f"/space/create?{urlencode(TEST_SPACE)}",headers=headers).json()
    params1 = {
        "path": "path/to/my/datum",
        "space": TEST_SPACE['name'],
        "value": "500"
    }
    client.put(f"/?{urlencode(params1)}",headers=headers)

    params2 = {"space": TEST_SPACE['name']}
    response = client.get(f"/?{urlencode(params2)}",headers=headers)
    assert json.loads(response.json())["path"]["to"]["my"]["datum"] == 500
    
    params3 = {"path": "path/to/", "space": TEST_SPACE['name']}
    response = client.get(f"/?{urlencode(params3)}",headers=headers)
    assert json.loads(response.json())["my"]["datum"] == 500
    
    params4 = {"path": "path/to/my/datum", "space": TEST_SPACE['name']}
    response = client.get(f"/?{urlencode(params4)}",headers=headers)
    assert json.loads(response.json()) == 500
 