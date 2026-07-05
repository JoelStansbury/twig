from http import HTTPStatus
import json
from typing import Annotated

from fastapi import Depends, HTTPException
from sqlmodel import Session, asc, select

from twig.logger import LOG

from ..models import ApiQuery, ChangeMessage, JsonValue, Membership
from ..db.connection import get_session
from .watch import WEBSOCKET_MANAGER
from ..db.tables import Datum, SpaceMembership
from .login import AuthenticatedUser, get_membership
from ._utils import delete_datum, pointer_put, recursive_put


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
    LOG.GET.debug(path)
    if membership.type < Membership.view:
        raise HTTPException(HTTPStatus.UNAUTHORIZED, detail="No read access")

    root_datum = session.get(Datum, (path, membership.space))
    if root_datum is not None:
        LOG.GET.debug(f'  Found "{root_datum.path}" -> {root_datum.value}')
        return json.loads(root_datum.value)
    
    root: dict[str, JsonValue] = {}
    statement = (
        select(Datum)
        .where(
            Datum.path.startswith(f"{path}/"),
            Datum.space == membership.space,
        )
        .order_by(asc(Datum.path)) # Ensures that items are entered top-down
    )

    rows = session.exec(statement).all()
    if len(rows) == 0:
        raise HTTPException(HTTPStatus.NOT_FOUND)

    for row in rows:
        LOG.GET.debug(f'  "{row.path}" -> {row.value}')
        value = json.loads(row.value)
        rel_path = row.path[len(path):]
        pointer_put(root, rel_path, value)
    
    LOG.GET.debug(f'  -> {root}')
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


    # Do insertions
    touched_paths, put_messages = recursive_put(value, membership.space, path, session, all_paths)
    del_messages: list[ChangeMessage] = []
    # Prune
    for orphaned_path in set(all_paths) - touched_paths:
        LOG.PUT.debug(f'DELETING "{orphaned_path}"')
        obj = session.get(Datum, (orphaned_path, membership.space))
        session.delete(obj)
        del_messages.append(ChangeMessage(
            path=orphaned_path,
            space=membership.space,
            action="delete",
            value=None
        ))
    session.commit()
    await WEBSOCKET_MANAGER.publish(membership.space, path, del_messages + put_messages)

async def path_delete(
    membership: SpaceMembership, 
    path: str, 
    session: Session = Depends(get_session)
) -> None:
    if membership.type < Membership.edit:
        raise HTTPException(HTTPStatus.UNAUTHORIZED)
    LOG.DELETE.debug(path)
    changes = await delete_datum(membership.space, path, session)
    await WEBSOCKET_MANAGER.publish(membership.space, path, changes)
    session.commit()
