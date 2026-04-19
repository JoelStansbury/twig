import json
from urllib.parse import urlencode
TEST_USER = {"username": "TestUser", "password": "password"}
TEST_SPACE = {"name": "MySpace"}

def test_create_user(client, a_user):
    pass

def test_login(client, token):
    pass

def test_create_space(client, token, space):
    pass
    
def test_put(client, token, space):
    query = {"value": "500"}
    response = client.put(
        f"{space}/path/to/my/datum?{urlencode(query)}",
        headers={
            "Authorization": f"Bearer {token}",
            "Content-Type": "application/json",
        }
    )
    assert response.status_code == 200
    

def test_get1(client, token, space):
    headers={
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }

    params1 = {"value": "500"}
    response = client.put(f"{space}/path/to/my/datum?{urlencode(params1)}",headers=headers)
    assert response.status_code == 200, response

    response = client.get(f"{space}", headers=headers)
    try:
        assert response.json()["path"]["to"]["my"]["datum"] == 500
    except:
        raise ValueError(response.text)
    
    response = client.get(f"{space}/path/to", headers=headers)
    assert response.json()["my"]["datum"] == 500, response
    
    response = client.get(f"/{space}/path/to/my/datum", headers=headers)
    print(response.json())
    assert response.json() == 500, response
 
def test_get2(client, token, space):
    headers={
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }

    params1 = {"value": "500"}
    response = client.put(f"{space}///?{urlencode(params1)}",headers=headers)
    assert response.status_code == 200, response

    response = client.get(f"{space}",headers=headers)
    assert response.json()[""] == 500, response
 