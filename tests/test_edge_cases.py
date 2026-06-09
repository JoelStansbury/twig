from http import HTTPStatus

from twig.client import APIClient

TEST_USER = {"username": "TestUser", "password": "password"}
TEST_SPACE = {"name": "MySpace"}

def test_list_creation(client: APIClient) -> None:
    client.signup(TEST_USER)
    client.authenticate(TEST_USER)
    client.create_space(TEST_SPACE)
    client.put("", TEST_SPACE['name'], {"list": []})
    client.put("/list/0", TEST_SPACE['name'], "element_zero")
    response = client.get("/list", TEST_SPACE['name'])
    assert response.json() == ["element_zero"]

def test_list_creation_2(client: APIClient) -> None:
    """
    Should fail because index 1 does not exist
    """
    client.signup(TEST_USER)
    client.authenticate(TEST_USER)
    client.create_space(TEST_SPACE)
    client.put("", TEST_SPACE['name'], {"list": []})
    response = client.put("/list/1", TEST_SPACE['name'], "element_one")
    assert response.status_code == HTTPStatus.EXPECTATION_FAILED
    print(response.json()['detail'])


def test_list_creation_3(client: APIClient) -> None:
    client.signup(TEST_USER)
    client.authenticate(TEST_USER)
    client.create_space(TEST_SPACE)
    client.put("", TEST_SPACE['name'], {"list": []})
    client.put("/list/-", TEST_SPACE['name'], 0)
    client.put("/list/-", TEST_SPACE['name'], 1)
    client.put("/list/-", TEST_SPACE['name'], 2)
    response = client.get("/list", TEST_SPACE['name'])
    assert response.json() == [0,1,2]