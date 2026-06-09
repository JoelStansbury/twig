from http import HTTPStatus

from twig.client import APIClient


def test_list_creation(client: APIClient, test_space:str) -> None:
    client.put("", test_space, {"list": []})
    client.put("/list/0", test_space, "element_zero")
    response = client.get("/list", test_space)
    assert response.json() == ["element_zero"]

def test_list_creation_2(client: APIClient, test_space:str) -> None:
    """
    Should fail because index 1 does not exist
    """
    client.put("", test_space, {"list": []})
    response = client.put("/list/1", test_space, "element_one")
    assert response.status_code == HTTPStatus.EXPECTATION_FAILED
    print(response.json()['detail'])


def test_list_creation_3(client: APIClient, test_space:str) -> None:
    client.put("", test_space, {"list": []})
    client.put("/list/-", test_space, 0)
    client.put("/list/-", test_space, 1)
    client.put("/list/-", test_space, 2)
    response = client.get("/list", test_space)
    assert response.json() == [0,1,2]