from http import HTTPStatus
import json
from typing import Annotated
from jsonpointer import JsonPointer # type:ignore

from fastapi import Depends, HTTPException
from sqlmodel import Session, and_, asc, delete, select

from ..models import ApiQuery, JsonValue, Membership
from ..db.connection import get_session
from .watch import WEBSOCKET_MANAGER
from ..db.tables import Datum, SpaceMembership
from .login import AuthenticatedUser, get_membership
from ._utils import delete_datum, recursive_put, is_element_of_list

async def api(
    user: AuthenticatedUser,
    query: ApiQuery,
    session: Annotated[Session, Depends(get_session)]
):
    membership = get_membership(user, query.space, session)
    if query.action=="PUT":
        return await path_put(membership, query.path, query.value, session)
    elif query.action=="GET":
        return path_get(membership, query.path, session)    
    elif query.action == "DELETE":
        return await path_delete(membership, query.path, session)

def path_get(
    membership: SpaceMembership,
    path: str = "",
    session: Session = Depends(get_session),
) -> JsonValue:
    if membership.type < Membership.view:
        raise HTTPException(HTTPStatus.UNAUTHORIZED, detail="No read access")

    root_value = session.exec(
        select(Datum.value)
        .where(
            Datum.path == path, 
            Datum.space == membership.space
        )
    ).one_or_none()

    list_paths: list[str] = []
    if root_value == "[]":
        list_paths.append(path)
    elif (root_value is not None) and (root_value != "{}"):
        return json.loads(root_value)
    
    result: dict[str, JsonValue] = {}
    descendent_prefix = f"{path}/"
    
    statement = (
        select(Datum)
        .where(
            Datum.path.startswith(descendent_prefix),
            Datum.space == membership.space,
        )
        .order_by(asc(Datum.path))
    )

    rows = session.exec(statement).all()
    if len(rows) == 0:
        raise HTTPException(HTTPStatus.NOT_FOUND)
    if len(rows) == 1 and rows[0].path == path:
        return json.loads(rows[0].value)

    for row in rows:
        cursor:dict[str, JsonValue] = result
        value = json.loads(row.value)
        if value == []:
            value = {}
            list_paths.append(row.path)

        rel_path = row.path[len(path):]
        ptr = JsonPointer(rel_path)
        parts: list[str] = ptr.parts # type:ignore
        assert isinstance(parts, list)
        if len(parts) > 1:
            for part in parts[:-1]:
                if part not in cursor:
                    cursor[part] = {}
                cursor = cursor[part] # type:ignore
        cursor[parts[-1]] = value

    # Post Process Lists
    for _path in list_paths:
        rel_path = _path[len(path):]
        collector: list[JsonValue] = []
        if rel_path == "":
            kv_pairs: list[tuple[int, JsonValue]]= [(int(k), v) for k,v in result.items()]
            for k,v in sorted(kv_pairs):
                assert k == len(collector)
                collector.append(v)
            return collector
        else:
            ptr = JsonPointer(rel_path)
            sparse: dict[str, JsonValue] = ptr.get(result, None) # type:ignore
            kv_pairs = [(int(k), v) for k,v in sparse.items()]
            for k,v in sorted(kv_pairs):
                assert k == len(collector)
                collector.append(v)
            ptr.set(result, collector) # type:ignore
    return result

async def path_put(
    membership: SpaceMembership,
    path: str,
    value: JsonValue,
    session: Session = Depends(get_session),
) -> None:
    if membership.type < Membership.edit:
        raise HTTPException(HTTPStatus.UNAUTHORIZED)
    
    
    # print(ancestors)
    all_paths = {x.path: x for x in session.exec(
        select(Datum)
        .where(Datum.path.startswith(path))
    ).all()}

    # Get parents for info
    ancestors: list[str] = []
    parts:list[str] = list(path.split("/"))
    for i in range(2, len(parts)):
        parent = "/".join(parts[:i])
        # obj = session.exec(select(Datum).where(Datum.path==parent)).one_or_none()
        obj = session.get(Datum, (parent, membership.space))
        if obj is not None:
            ancestors.append("/".join(parts[:i]))
            all_paths[parent] = obj
            if obj.value == "[]":
                query_result = session.exec(
                    select(Datum.path)
                    .where(
                        and_(
                            Datum.path.startswith(parent),
                            Datum.path.regexp_match(f"^{parent}/\\d+$") # type:ignore
                        )
                    )
                ).all()

                neighbors = [int(x.removeprefix(f"{parent}/")) for x in query_result]
                # print("NEIGHBORS", neighbors)
                if parts[i] == "-":
                    parts[i] = str(len(neighbors))
                
                else:
                    if int(parts[i]) > len(neighbors):
                        # print("REJECTING")
                        msg = (
                                "Attempt to insert an element beyond the end of a list. \n"
                                f"{path}\n"
                                f"{' '*len(parent)} ^\n"
                                f"Integer index must be <= {len(neighbors)}\n"
                                f"'-' may also be used if the total length of the list is unknown, this will append the operand."
                            )
                        
                        # print(msg)
                        raise HTTPException(
                            HTTPStatus.EXPECTATION_FAILED, 
                            detail=msg
                        )
                    # print("ACCEPTING", parts[i])

    path = '/'.join(parts)
    # Do insertions
    touched_paths = set(await recursive_put(value, membership.space, path, session, all_paths))

    # Don't delete parents
    for parent in ancestors:
        all_paths.pop(parent)

    # Prune
    for orphaned_path in set(all_paths) - touched_paths:
        session.exec(delete(Datum).where(and_(Datum.path==orphaned_path)))
        await WEBSOCKET_MANAGER.publish(
            path=path,
            space=membership.space,
            action="delete",
        )
    session.commit()

async def path_delete(
    membership: SpaceMembership, 
    path: str, 
    session: Session = Depends(get_session)
) -> None:
    if membership.type < Membership.edit:
        raise HTTPException(HTTPStatus.UNAUTHORIZED)
    await delete_datum(membership.space, path, session)
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
