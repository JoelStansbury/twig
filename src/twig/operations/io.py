from http import HTTPStatus
import json
from typing import Any

from fastapi import Depends, HTTPException
from sqlmodel import Session, asc, delete, select

from ..models import Membership
from ..db.connection import get_session
from ..db.tables import Datum
from .login import AuthenticatedMember

def unescape(part:str):
    return part.replace("~1", "/").replace("~0", "~")

def escape(part:str):
    return part.replace("/", "~1").replace("~", "~0")

def path_get(
    membership: AuthenticatedMember,
    path: str = "",
    session: Session = Depends(get_session),
) -> Any:
    if membership is None:
        raise HTTPException(HTTPStatus.UNAUTHORIZED, detail="No membership status")
    if membership.type < Membership.view:
        raise HTTPException(HTTPStatus.UNAUTHORIZED, detail="No read access")
    statement = (
        select(Datum)
        .where(
            Datum.path.startswith(path),
            Datum.space == membership.space,
        )
        .order_by(asc(Datum.path))
    )

    rows = session.exec(statement).all()
    if len(rows) == 0:
        raise HTTPException(HTTPStatus.NOT_FOUND)
    if len(rows) == 1 and rows[0].path == path:
        return json.loads(rows[0].value)

    result = {}
    for row in rows:
        rel_path = row.path[len(path) + 1 :]
        if rel_path:
            cursor = result
            parts = [unescape(part) for part in rel_path.split("/")]
            for part in parts[:-1]:
                if isinstance(cursor, list):
                    part = int(part)
                if isinstance(cursor, dict) and part not in cursor:
                    cursor[part] = {}
                elif isinstance(cursor, list) and len(cursor) <= part:
                    cursor.append({})
                try:
                    cursor = cursor[part]
                except Exception as e:
                    print(f"Error: index ({part}) of {cursor}")
                    raise e
            if isinstance(cursor, list):
                assert int(parts[-1]) == len(cursor)
                cursor.append(json.loads(row.value))
            else:
                cursor[parts[-1]] = json.loads(row.value)
        else: # lists
            assert not result, f"Object should have been empty due to sorting. {result}"
            result = json.loads(row.value)
    return result

def _recursive_put(
    obj: dict | list | int | float | str | None, space: int, path: str, session: Session
):
    if isinstance(obj, (int, str, float)) or obj is None:
        row = session.get(Datum, (path, space))
        value = json.dumps(obj)
        if row:
            if value != row.value:
                row.value = value
        else:
            print(f"inserting {value} ({type(obj)})")
            session.add(
                Datum(
                    path=path,
                    space=space,
                    value=value,
                )
            )
    elif isinstance(obj, list):
        session.add(
            Datum(
                path=path,
                space=space,
                value="[]",
            )
        )
        for i, el in enumerate(obj):
            _recursive_put(el, space, f"{path}/{i}", session)
    else:
        for k, v in obj.items():
            _recursive_put(v, space, f"{path}/{escape(k)}", session)

def path_put(
    membership: AuthenticatedMember,
    path: str,
    value: str,
    session: Session = Depends(get_session),
) -> None:
    if membership is None:
        raise HTTPException(HTTPStatus.UNAUTHORIZED)
    if membership.type > Membership.edit:
        path_delete(membership, path, session)
        _recursive_put(json.loads(value), membership.space, path, session)
        session.commit()
        raise HTTPException(HTTPStatus.OK)
    raise HTTPException(HTTPStatus.BAD_REQUEST)

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

def path_delete(
    membership: AuthenticatedMember, 
    path: str, 
    session: Session = Depends(get_session)
) -> None:
    if membership is None:
        raise HTTPException(HTTPStatus.UNAUTHORIZED)
    if membership.type < Membership.edit:
        raise HTTPException(HTTPStatus.UNAUTHORIZED)
    session.exec(
        delete(Datum).where(
            Datum.path.startswith(path), 
            Datum.space == membership.space
        )
    )
    if is_element_of_list(path, membership.space, session):
        parent_path, child_idx_str = path.rsplit('/', 1)
        i = int(child_idx_str)
        decrement_path = f"{parent_path}/{i}"
        while True:
            i += 1
            child_path = f"{parent_path}/{i}"
            rows = session.exec(select(Datum).where(
                Datum.path.startswith(child_path),
                Datum.space == membership.space
            )).fetchall()
            cont = False
            for row in rows:
                cont = True
                suffix = row.path.lstrip(child_path)
                row.path = decrement_path + suffix
            if not cont:
                break
            decrement_path = child_path

    session.commit()
