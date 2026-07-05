import time

from twig.client import APIClient


TEST_USER = {"username": "TestUser", "password": "password"}
TEST_SPACE = {"name": "MySpace"}

def test_deep_put_scaling(client: APIClient):

    def timed_put(depth:int):

        path = ""

        for i in range(depth):
            path += f"/level{i}"

        start = time.perf_counter()

        client.put(
            path,
            TEST_SPACE["name"],
            123
        )

        return (
            time.perf_counter()
            - start
        )

    shallow = timed_put(10)
    deep = timed_put(100)

    print(
        "10:",
        shallow,
        "100:",
        deep
    )

    #
    # should not explode
    #

    assert deep < shallow * 2


def test_get_large_subtree(client: APIClient):

    for N in [100, 500, 1000]:
        # client.delete("", TEST_SPACE['name'])
        users = {str(i):{"name": f"user{i}"} for i in range(N)}
        assert len(users) == N
        # client.delete("", TEST_SPACE['name'])
        start = time.perf_counter()
        resp = client.put(
            "",
            TEST_SPACE["name"],
            {"users": users},
        )
        assert resp.status_code == 200, resp.json()["detail"]
        elapsed = (
            time.perf_counter()
            - start
        )
        print(
            f"{N} node PUT:",
            elapsed
        )

        start = time.perf_counter()

        response = client.get(
            "/users",
            TEST_SPACE["name"],
        )

        elapsed = (
            time.perf_counter()
            - start
        )

        assert len(response.json()) == N, response.json()

        print(
            f"{N} node reconstruction:",
            elapsed
        )
