
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
    obj: JsonValue, space: str, path: str, session: Session, collector: list[str] | None = None
):
    collector = collector or []
    collector.append(path)
    if isinstance(obj, (int, str, float, bool)) or obj is None:
        value = obj
        await _do_put(value, space, path, session)
    elif isinstance(obj, list):
        value = []
        await _do_put(value, space, path, session)
        for i, el in enumerate(obj):
            await _recursive_put(el, space, f"{path}/{i}", session, collector)
    else:
        value = {}
        await _do_put(value, space, path, session)
        for k, v in obj.items():
            await _recursive_put(v, space, f"{path}/{escape(k)}", session, collector)
    return collector

async def _do_put(value, space, path, session):
    json_value = json.dumps(value)
    if row:=session.get(Datum, (path, space)):
        if row.value != json_value:
            row.value = json_value
            await watch_manager.publish(
                path=path,
                space=space,
                action="update",
                value=value,
            )
    else:
        session.add(
            Datum(
                path=path,
                space=space,
                value=json_value,
            )
        )
        await watch_manager.publish(
            path=path,
            space=space,
            action="insert",
            value=value,
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
            action="delete",
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
