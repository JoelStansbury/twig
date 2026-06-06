
import json

from sqlmodel import Session, and_, delete, select

from .watch import WEBSOCKET_MANAGER
from ..db.tables import Datum
from ..models import JsonValue


def unescape(part:str):
    return part.replace("~1", "/").replace("~0", "~")

def escape(part:str):
    return part.replace("~", "~0").replace("/", "~1")

async def recursive_put(
    obj: JsonValue, 
    space: str, 
    path: str, 
    session: Session,
    existing_rows: dict[str, Datum],
    collector: list[str] | None = None
):
    collector = collector or []
    collector.append(path)
    if isinstance(obj, (int, str, float, bool)) or obj is None:
        value = obj
        await _do_put(value, space, path, session, existing_rows)
    elif isinstance(obj, list):
        await _do_put([], space, path, session, existing_rows)
        for i, el in enumerate(obj):
            await recursive_put(el, space, f"{path}/{i}", session, existing_rows, collector)
    else:
        await _do_put({}, space, path, session, existing_rows)
        for k, v in obj.items():
            await recursive_put(v, space, f"{path}/{escape(k)}", session, existing_rows, collector)
    return collector

async def _do_put(value:JsonValue, space:str, path:str, session:Session, existing_rows:dict[str, Datum]):
    json_value = json.dumps(value)
    if path in existing_rows:
        row = existing_rows[path]
        if row.value != json_value:
            row.value = json_value
            await WEBSOCKET_MANAGER.publish(
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
        await WEBSOCKET_MANAGER.publish(
            path=path,
            space=space,
            action="insert",
            value=value,
        )

async def delete_datum(
    space: str, path: str, session: Session
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
        delete(Datum)
        .where(and_(
            Datum.path.startswith(path), 
            Datum.space == space,
        ))
    )
    for path in rows:
        await WEBSOCKET_MANAGER.publish(
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
