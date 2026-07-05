from collections import defaultdict

from fastapi import (
    APIRouter,
    Depends,
    WebSocket,
    WebSocketDisconnect,
)
from sqlmodel import Session

from twig.db.connection import get_session
from twig.logger import LOG
from twig.models import WSQuery, ChangeMessage
from twig.operations._utils import get_ancestors
from twig.operations.login import websocket_auth



router = APIRouter()


class WatchManager:
    subscriptions: dict[tuple[str, str], dict[int, WebSocket]] = defaultdict(dict)
    "dict[(space, path), dict[websocket_id, WebSocket]"
    reverse_subscriptions: dict[int, set[tuple[str, str]]] = defaultdict(set)
    websockets: dict[int, WebSocket] = {}

    def subscribe(
        self,
        websocket: WebSocket,
        space: str,
        path: str,
    ) -> None:
        wid = id(websocket)
        self.subscriptions[(space, path)][wid] = websocket
        self.reverse_subscriptions[wid].add((space, path))
        self.websockets[wid] = websocket

    def unsubscribe(
        self,
        websocket: WebSocket,
        path: str | None = None,
        space: str | None = None,
    ) -> None:
        """remove one subscription"""
        ws_id = id(websocket)
        if space is None and path is None:
            LOG .WATCH.debug(f"deleting ws {ws_id}")
            for space, path in self.reverse_subscriptions[ws_id]:
                self.unsubscribe(websocket, path, space)
            del self.reverse_subscriptions[ws_id]
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
        space:str,
        path:str,
        payload: list[ChangeMessage]
    ) -> None:
        dead: list[WebSocket] = []
        LOG.WATCH.debug(f'"{path}" {payload}')

        full_listeners: set[int] = set()
        for ancestor in get_ancestors(path):
            for websocket in self.subscriptions.get((space, ancestor),{}).values():
                full_listeners.add(id(websocket))
                try:
                    await websocket.send_json(payload)
                except Exception:
                    dead.append(websocket)
        
        # partial watchers (something that watches a child of path)
        partials: dict[int, list[int]] = defaultdict(list)
        "dict[websocket_id, indicies_of_relevant_messages]"
        cursors: dict[int, str] = {}
        "Paths are sorted, so if one of the cursors does not start with the current path, then it is done"
        for i, message in sorted(enumerate(payload), key=lambda x: x[1]["path"]):
            # if message["path"] not in full_listeners:
            for ws_id in self.subscriptions.get((space, message["path"]), {}):
                cursors[ws_id] = message["path"]
            for ws_id, cpath in cursors.items():
                if not message["path"].startswith(cpath):
                    del cursors[ws_id]
                else:
                    partials[ws_id].append(i)
        for ws_id, message_indicies in partials.items():
            if ws_id in full_listeners:
                continue
            partial_payload: list[ChangeMessage] = []
            websocket = self.websockets[ws_id]
            for i in sorted(message_indicies):
                partial_payload.append(payload[i])
            try:
                await websocket.send_json(partial_payload)
            except Exception as e:
                LOG.WATCH.debug(f"Dead Socket: {e}")
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
            msg = await websocket.receive_json()
            message = WSQuery.model_validate(msg)
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

    except WebSocketDisconnect as e:
        LOG.WATCH.debug(f"Disconnect {e}")
        WEBSOCKET_MANAGER.unsubscribe(websocket)