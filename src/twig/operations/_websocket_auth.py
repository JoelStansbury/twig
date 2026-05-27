from fastapi import WebSocket
from sqlmodel import Session

from twig.db.tables import User
from twig.operations.login import user_get_current



def websocket_auth(
    websocket: WebSocket,
    session: Session,
) -> User:

    token = websocket.query_params.get(
        "token"
    )
    if not token:
        return None
    try:
        return user_get_current(
            token,
            session
        )
    except Exception as e:
        print(e)
        return None
