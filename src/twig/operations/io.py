from http import HTTPStatus
import json
from typing import Any

from fastapi import Depends, HTTPException
from sqlmodel import Session, asc, delete, select

from ..models import ApiQuery, Membership
from ..db.connection import get_session
from ..db.tables import Datum
from .login import AuthenticatedMember
from ._utils import _recursive_put, is_element_of_list, unescape

def api(
    membership: AuthenticatedMember,
    query: ApiQuery,
    session: Session = Depends(get_session)
):
    if query.action=="PUT":
        if query.value:
            return path_put(membership, query.path, query.value, session)
        else:
            return HTTPException(HTTPStatus.NO_CONTENT, detail="Expected `value` JSON object.")
    elif query.action=="GET":
        return path_get(membership, query.path, session)    
    elif query.action == "DELETE":
        return path_delete(membership, query.path, session)

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
