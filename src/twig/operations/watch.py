from collections import defaultdict
from typing import Any

from fastapi import (
    APIRouter,
    Depends,
    WebSocket,
    WebSocketDisconnect,
)
from sqlmodel import Session

from twig.db.connection import get_session
from twig.models import ApiQuery, JsonValue
from twig.operations.login import websocket_auth


router = APIRouter()


class WatchManager:
    subscriptions: dict[tuple[str, str], dict[int, WebSocket]] = defaultdict(dict)
    websockets: dict[int, set[tuple[str, str]]] = defaultdict(set)

    def subscribe(
        self,
        websocket: WebSocket,
        space: str,
        path: str,
    ) -> None:
        wid = id(websocket)
        self.subscriptions[(space, path)][wid] = websocket
        self.websockets[wid].add((space, path))

    def unsubscribe(
        self,
        websocket: WebSocket,
        path: str | None = None,
        space: str | None = None,
    ) -> None:
        """remove one subscription"""

        ws_id = id(websocket)
        if space is None and path is None:
            for space, path in self.websockets[ws_id]:
                self.unsubscribe(websocket, path, space)
            del self.websockets[ws_id]
        else:
            assert space is not None and path is not None
            key = (space, path)
            subscribers = self.subscriptions.get(key)

            if subscribers:
                subscribers.pop(ws_id, None)
                if not subscribers:
                    del self.subscriptions[key]
            return
    
    async def publish(
        self,
        space: str,
        path: str,
        action: str,
        value: JsonValue | None = None,
    ) -> None:
        # deduplicated websocket targets
        # print("publish", path, value)
        targets: dict[int, WebSocket] = {}
        payload: dict[str, Any] = {
            "path":path,
            "space":space,
            "action":action,
            "value":value,
        }

        # root watchers
        targets.update(
            self.subscriptions.get(
                (space, ""),
                {},
            )
        )

        # ancestor watchers
        #
        # /a/b/c
        # -> /a
        # -> /a/b
        # -> /a/b/c
        current = ""
        for part in path.split("/")[1:]:
            current += f"/{part}"
            targets.update(
                self.subscriptions.get(
                    (space, current),
                    {},
                )
            )

        # broadcast
        dead: list[WebSocket] = []
        for websocket in targets.values():
            try:
                await websocket.send_json(payload)
            except Exception:
                dead.append(websocket)

        # cleanup dead sockets
        for websocket in dead:
            self.unsubscribe(websocket)

WEBSOCKET_MANAGER = WatchManager()

@router.websocket("/watch")
async def watch_endpoint(
    websocket: WebSocket,
    session: Session = Depends(get_session)
):
    user = websocket_auth(websocket, session)

    if user is None:
        await websocket.close(
            code=1008,
        )
        return

    await websocket.accept()
    try:
        while True:
            message = ApiQuery.model_validate(await websocket.receive_json())
            assert isinstance(message, dict)

            action = message.action

            if action == "subscribe":
                path = message.path
                space = message.space

                try:
                    WEBSOCKET_MANAGER.subscribe(
                        websocket=websocket,
                        space=space,
                        path=path,
                    )

                    await websocket.send_json({
                        "action": "subscribed",
                        "path": path,
                        "space": space,
                    })
                except Exception:
                    await websocket.send_json({
                        "action": "rejected",
                        "space": space,
                        "path": path,
                        "reason": "unauthorized"
                    })


            elif action == "unsubscribe":

                path = message.path
                space = message.space
                WEBSOCKET_MANAGER.unsubscribe(
                    websocket=websocket,
                    space=space,
                    path=path,
                )

                await websocket.send_json({
                    "action": "unsubscribed",
                    "space": space,
                    "path": path,
                })

    except WebSocketDisconnect:
        WEBSOCKET_MANAGER.unsubscribe(websocket)