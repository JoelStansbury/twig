
import json

from sqlmodel import Session, delete, select

from .watch import watch_manager
from ..db.tables import Datum
from ..models import JsonValue


def unescape(part:str):
    return part.replace("~1", "/").replace("~0", "~")

def escape(part:str):
    return part.replace("~", "~0").replace("/", "~1")

async def _recursive_put(
    obj: JsonValue, space: str, path: str, session: Session
):
    if isinstance(obj, (int, str, float)) or obj is None:
        value = json.dumps(obj)
    elif isinstance(obj, list):
        value = "[]"
        for i, el in enumerate(obj):
            await _recursive_put(el, space, f"{path}/{i}", session)
    else:
        value = "{}"
        for k, v in obj.items():
            await _recursive_put(v, space, f"{path}/{escape(k)}", session)
    if row:=session.get(Datum, (path, space)):
        row.value = value
        await watch_manager.publish(
            path=path,
            space=space,
            payload={
                "path": path,
                "action": "update",
                "value": obj,
            }
        )
    else:
        session.add(
            Datum(
                path=path,
                space=space,
                value=value,
            )
        )
        await watch_manager.publish(
            path=path,
            space=space,
            payload={
                "path": path,
                "action": "insert",
                "value": obj,
            }
        )

async def delete_datum(
    space: int, path: str, session: Session
):
    statement = (
        select(Datum.path)
        .where(
            Datum.path.startswith(path),
            Datum.space == space,
        )
    )
    rows = session.exec(statement).all()

    session.exec(
        delete(Datum).where(
            Datum.path.startswith(path), 
            Datum.space == space
        )
    )
    for path in rows:
        await watch_manager.publish(
            path=path,
            space=space,
            payload={
                "path": path,
                "action": "delete",
                "value": None
            }
        )

def is_element_of_list(path: str, space:str, session: Session):
    parent_path, *maybe_child = path.rsplit('/', 1)
    if not maybe_child:
        return False
    child = maybe_child[0]
    if not child.isdigit():
        return False
    parent = session.exec(select(Datum).where(
        Datum.path == parent_path,
        Datum.space == space
    )).one_or_none()
    if parent and parent.value == "[]":
        return True
    return False
