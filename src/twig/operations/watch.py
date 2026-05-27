from collections import defaultdict
from typing import DefaultDict

from fastapi import (
    APIRouter,
    Depends,
    WebSocket,
    WebSocketDisconnect,
)
from sqlmodel import Session

from twig.db.connection import get_session
from twig.operations._websocket_auth import websocket_auth


router = APIRouter()


class WatchManager:

    def __init__(self):

        #
        # (space, path)
        #     -> websocket_id
        #         -> websocket
        #

        self.subscriptions: DefaultDict[
            tuple[str, str],
            dict[int, WebSocket]
        ] = defaultdict(dict)

    def normalize_path(
        self,
        path: str,
    ) -> str:

        if not path:
            return ""

        path = "/" + path.strip("/")

        return path

    async def subscribe(
        self,
        websocket: WebSocket,
        space: str,
        path: str,
    ) -> None:
        path = self.normalize_path(path)
        key = (space, path)
        self.subscriptions[key][
            id(websocket)
        ] = websocket
        print("SUBSCRIBED", self.subscriptions)

    async def unsubscribe(
        self,
        websocket: WebSocket,
        path: str | None = None,
        space: str | None = None,
    ) -> None:

        ws_id = id(websocket)

        #
        # remove one subscription
        #

        if (
            space is not None and
            path is not None
        ):

            key = (
                space,
                self.normalize_path(path),
            )

            subscribers = (
                self.subscriptions.get(key)
            )

            if subscribers:

                subscribers.pop(ws_id, None)

                if not subscribers:
                    del self.subscriptions[key]

            return

        #
        # remove all subscriptions
        #

        empty = []

        for key, subscribers in self.subscriptions.items():

            subscribers.pop(ws_id, None)

            if not subscribers:
                empty.append(key)

        for key in empty:
            del self.subscriptions[key]

    async def publish(
        self,
        space: str,
        path: str,
        payload: dict,
    ) -> None:
        print("Publishing", payload, self.subscriptions)
        path = self.normalize_path(path)

        #
        # deduplicated websocket targets
        #

        targets: dict[int, WebSocket] = {}

        #
        # root watchers
        #

        targets.update(
            self.subscriptions.get(
                (space, ""),
                {},
            )
        )

        #
        # ancestor watchers
        #
        # /a/b/c
        # -> /a
        # -> /a/b
        # -> /a/b/c
        #

        current = ""

        parts = [
            p
            for p in path.split("/")
            if p
        ]

        for part in parts:

            current += f"/{part}"

            targets.update(
                self.subscriptions.get(
                    (space, current),
                    {},
                )
            )

        #
        # broadcast
        #

        dead = []

        for ws_id, websocket in targets.items():

            try:

                await websocket.send_json(
                    payload
                )

            except Exception:

                dead.append(websocket)

        #
        # cleanup dead sockets
        #

        for websocket in dead:

            await self.unsubscribe(
                websocket
            )


watch_manager = WatchManager()


@router.websocket("/watch")
async def watch_endpoint(
    websocket: WebSocket,
    session: Session = Depends(get_session)
):
    print("WATCH ENDPOINT")
    user = websocket_auth(websocket, session)
    print(user)

    if user is None:
        await websocket.close(
            code=1008,
        )
        return

    await websocket.accept()
    try:
        while True:
            message = (
                await websocket.receive_json()
            )

            action = message.get(
                "action"
            )

            if action == "subscribe":
                print("SUBSCRIBE")

                path = message.get(
                    "path",
                    "",
                )
                space = message["space"]

                try:
                    await watch_manager.subscribe(
                        websocket=websocket,
                        space=space,
                        path=path,
                    )

                    await websocket.send_json({
                        "type": "subscribed",
                        "path": path,
                        "space": space,
                    })
                except Exception:
                    await websocket.send_json({
                        "type": "rejected",
                        "space": space,
                        "path": path,
                        "reason": "unauthorized"
                    })


            elif action == "unsubscribe":

                path = message.get(
                    "path",
                    "",
                )

                space = message["space"]

                await watch_manager.unsubscribe(
                    websocket=websocket,
                    space=space,
                    path=path,
                )

                await websocket.send_json({
                    "type": "unsubscribed",
                    "space": space,
                    "path": path,
                })

    except WebSocketDisconnect:

        await watch_manager.unsubscribe(
            websocket
        )