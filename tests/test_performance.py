import time

from twig.client import APIClient
from starlette.testclient import WebSocketTestSession


TEST_USER = {"username": "TestUser", "password": "password"}
TEST_SPACE = {"name": "MySpace"}

def test_deep_put_scaling(client: APIClient):

    client.signup(TEST_USER)
    client.authenticate(TEST_USER)
    client.create_space(TEST_SPACE)

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

    assert deep < shallow * 20


def test_get_large_subtree(client: APIClient):

    client.signup(TEST_USER)
    client.authenticate(TEST_USER)
    client.create_space(TEST_SPACE)

    for N in [100, 500, 1000]:
        # client.delete("", TEST_SPACE['name'])
        users = {str(i):{"name": f"user{i}"} for i in range(N)}
        start = time.perf_counter()
        client.put(
            "/users",
            TEST_SPACE["name"],
            users,
        )
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

        assert len(response.json()) == N

        print(
            f"{N} node reconstruction:",
            elapsed
        )


def test_watch_publish_scaling(client: APIClient):

    client.signup(TEST_USER)
    client.authenticate(TEST_USER)
    client.create_space(TEST_SPACE)

    sockets: list[WebSocketTestSession] = []

    for i in range(100):

        ws = client.client.websocket_connect(
            f"/watch?token={client.token}"
        ).__enter__()

        ws.send_json({
            "action": "subscribe",
            "path": f"/root/{i}",
            "space": TEST_SPACE['name']
        })

        ws.receive_json()

        sockets.append(ws)

    start = time.perf_counter()

    client.put(
        "/root/50/name",
        TEST_SPACE["name"],
        "bob",
    )
    print(sockets[50].receive_json())

    elapsed = (
        time.perf_counter()
        - start
    )

    print(
        "100 watchers:",
        elapsed
    )

    for ws in sockets:
        ws.__exit__(None, None, None)