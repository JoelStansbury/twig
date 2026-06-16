
import json

from sqlmodel import Session, and_, delete, select

from ..db.tables import Datum
from ..models import ChangeMessage, JsonValue


def unescape(part:str):
    return part.replace("~1", "/").replace("~0", "~")

def escape(part:str):
    return part.replace("~", "~0").replace("/", "~1")

def recursive_put(
    obj: JsonValue, 
    space: str, 
    path: str, 
    session: Session,
    existing_rows: dict[str, Datum],
    collector: list[ChangeMessage] | None = None
) -> list[ChangeMessage]:
    collector = collector or []
    if isinstance(obj, (int, str, float, bool)) or obj is None:
        value = obj
        _do_put(value, space, path, session, existing_rows, collector)
    elif isinstance(obj, list):
        _do_put([], space, path, session, existing_rows, collector)
        for i, el in enumerate(obj):
            recursive_put(el, space, f"{path}/{i}", session, existing_rows, collector)
    else:
        _do_put({}, space, path, session, existing_rows, collector)
        for k, v in obj.items():
            recursive_put(v, space, f"{path}/{escape(k)}", session, existing_rows, collector)
    return collector

def _do_put(
        value:JsonValue, 
        space:str, 
        path:str, 
        session:Session, 
        existing_rows:dict[str, Datum],
        changes: list[ChangeMessage],
    ) -> None:
    json_value = json.dumps(value)
    if path in existing_rows:
        row = existing_rows[path]
        if row.value != json_value:
            row.value = json_value
            changes.append(ChangeMessage(
                path=path,
                space=space,
                action="update",
                value=value,
            ))
    else:
        session.add(
            Datum(
                path=path,
                space=space,
                value=json_value,
            )
        )
        changes.append(ChangeMessage(
            path=path,
            space=space,
            action="insert",
            value=value,
        ))

async def delete_datum(
    space: str, path: str, session: Session
) -> list[ChangeMessage]:
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
    changes: list[ChangeMessage] = []
    for path in rows:
        changes.append(ChangeMessage(
            path=path,
            space=space,
            action="delete",
            value=None
        ))
    return changes

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

def get_ancestors(path: str, include_root:bool = True, include_path:bool = True) -> list[str]:
    parts = path.split("/")[1:]
    current = ""
    ret = [current] if include_root else []
    for part in (parts if include_path else parts[:-1]):
        current = f"{current}/{part}"
        ret.append(current)
    return ret

def get_size_of_list(path: str, space: str, session: Session) -> int:
    return len(session.exec(
        select(Datum.path)
        .where(
            and_(
                Datum.space == space,
                Datum.path.startswith(path),
                Datum.path.regexp_match(f"^{path}/\\d+$") # type:ignore
            )
        )
    ).all())

