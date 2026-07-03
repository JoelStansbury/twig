from http import HTTPStatus
import json
from typing import Annotated
from jsonpointer import JsonPointer # type:ignore

from fastapi import Depends, HTTPException
from sqlmodel import Session, asc, select

from twig.logger import LOG

from ..models import ApiQuery, ChangeMessage, JsonValue, Membership
from ..db.connection import get_session
from .watch import WEBSOCKET_MANAGER
from ..db.tables import Datum, SpaceMembership
from .login import AuthenticatedUser, get_membership
from ._utils import delete_datum, get_ancestors, get_size_of_list, recursive_put, is_element_of_list


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
    path: str,
    session: Session = Depends(get_session),
) -> JsonValue:
    if membership.type < Membership.view:
        raise HTTPException(HTTPStatus.UNAUTHORIZED, detail="No read access")

    root_datum = session.get(Datum, (path, membership.space))
    if root_datum == None:
        LOG.GET.debug(path)
        raise HTTPException(HTTPStatus.NOT_FOUND, f"No entry for {path}")
    root_value = root_datum.value

    convert_to_list: list[str] = []
    root: dict[str, JsonValue] = {}  # assume everything is a dict at first... jsonpointer cannot insert elements out of order
    if root_value == "[]":
        convert_to_list.append("")
    elif root_value == "{}":
        pass
    else:
        return json.loads(root_value)

    statement = (
        select(Datum)
        .where(
            Datum.path.startswith(f"{path}/"),
            Datum.space == membership.space,
        )
        .order_by(asc(Datum.path))
    )

    rows = session.exec(statement).all()
    if len(rows) == 0:
        return json.loads(root_value)

    for row in rows:
        if row.value == "[]":
            value = {}
            convert_to_list.append(row.path)
        else:
            value = json.loads(row.value)

        rel_path = row.path[len(path):]
        JsonPointer(rel_path).set(root, value) # type:ignore

    # Post Process Lists
    for _path in convert_to_list:
        rel_path = _path[len(path):]
        collector: list[JsonValue] = []
        if rel_path == "":
            kv_pairs: list[tuple[int, JsonValue]]= [(int(k), v) for k,v in root.items()]
            for k,v in sorted(kv_pairs):
                assert k == len(collector)
                collector.append(v)
            return collector
        else:
            ptr = JsonPointer(rel_path)
            sparse: dict[str, JsonValue] = ptr.get(root, None) # type:ignore
            kv_pairs = [(int(k), v) for k,v in sparse.items()]
            for k,v in sorted(kv_pairs):
                assert k == len(collector)
                collector.append(v)
            ptr.set(root, collector) # type:ignore
    return root

async def path_put(
    membership: SpaceMembership,
    path: str,
    value: JsonValue,
    session: Session = Depends(get_session),
) -> None:
    LOG.PUT.info(f'PROCESSING path="{path}" value={value}')
    if membership.type < Membership.edit:
        raise HTTPException(HTTPStatus.UNAUTHORIZED)
    

    all_paths = {x.path: x for x in session.exec(
        select(Datum)
        .where(Datum.path.startswith(path))
    ).all()}

    parts = path.split("/")
    parent_path = "/".join(parts[:-1])
    parent = session.get(Datum, (parent_path, membership.space))
    if path and parent is None:
        msg = (
            f"Cannot insert into undefined.\n"
            f"{path}\n"
            f"\"{parent_path}\" does not exist"
        )
        raise HTTPException(HTTPStatus.PRECONDITION_FAILED, detail=msg)
    if len(parts) > 2:
        # ""      ->  1  (root has no parent)
        # "/a"    ->  2  (root is not a list)
        # "/a/b"  ->  3  (root may contain lists)
        assert parent, f"{parent_path} is {parent}, and yet all of {get_ancestors(path, False, False)} exist ({path})"
        if parent.value == "[]":
            size = get_size_of_list(parent_path, membership.space, session)
            if parts[-1] == "-":
                parts[-1] = str(size)
                path = "/".join(parts)
            elif parts[-1].isdigit():
                n = int(parts[-1])
                if n<=size:
                    pass
                else:
                    msg = (
                            "Attempt to insert an element beyond the end of a list. \n"
                            f"{path}\n"
                            f"{' '*len(parent_path)} ^\n"
                            f"Integer index must be <= {size}\n"
                            f"'-' may also be used if the total length of the list is unknown, this will append the operand."
                        )
                    raise HTTPException(HTTPStatus.PRECONDITION_FAILED, detail=msg)
            else:
                msg = (
                        f"Only integers may be used to index a list (\"{parts[-1]}\" is not an integer). \n"
                        f"{path}\n"
                        f"{' '*len(parent_path)} ^\n"
                        f"Integer index must be <= {size}\n"
                        f"'-' may also be used if the total length of the list is unknown, this will append the operand."
                    )
                raise HTTPException(HTTPStatus.PRECONDITION_FAILED, detail=msg)

    # Do insertions
    touched_paths, messages = recursive_put(value, membership.space, path, session, all_paths)

    # Prune
    for orphaned_path in set(all_paths) - touched_paths:
        LOG.PUT.debug(f'DELETING "{orphaned_path}"')
        obj = session.get(Datum, (orphaned_path, membership.space))
        session.delete(obj)
        messages.append(ChangeMessage(
            path=orphaned_path,
            space=membership.space,
            action="delete",
            value=None
        ))
    session.commit()
    await WEBSOCKET_MANAGER.publish(membership.space, path, messages)

async def path_delete(
    membership: SpaceMembership, 
    path: str, 
    session: Session = Depends(get_session)
) -> None:
    if membership.type < Membership.edit:
        raise HTTPException(HTTPStatus.UNAUTHORIZED)
    changes = await delete_datum(membership.space, path, session)
    await WEBSOCKET_MANAGER.publish(membership.space, path, changes)
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
