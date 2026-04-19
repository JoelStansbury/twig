from http import HTTPStatus
import json
from typing import Annotated, Any

from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
import jwt
from sqlalchemy.dialects import postgresql
from sqlmodel import ARRAY, TEXT, Session, asc, cast, delete, func, select, text, update
from sqlalchemy.dialects.postgresql import JSONB

from .models import Membership, TokenStr, Token
from .constants import ALGORITHM, SECRET_KEY
from .db.connection import get_session
from .db.tables import DataSpace, SpaceMembership, User
from .auth import create_access_token, get_password_hash, verify_password


def user_get_current(token: TokenStr, session: Session = Depends(get_session)) -> User:
    credentials_exception = HTTPException(
        status_code=HTTPStatus.UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username = payload.get("sub")
        if username is None:
            raise credentials_exception
    except jwt.InvalidTokenError:
        raise credentials_exception
    command = select(User).where(
        User.username == username,
    )
    user = session.exec(command).first()
    if user is None:
        raise credentials_exception
    return user

AuthenticatedUser = Annotated[User, Depends(user_get_current)]


def user_login(
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    session: Session = Depends(get_session),
) -> Token:
    command = select(User).where(User.username == form_data.username)
    user = session.exec(command).first()
    if verify_password(form_data.password, user.password_hash):
        access_token = create_access_token({"sub": user.username})
        return Token(access_token=access_token, token_type="bearer")
    else:
        raise HTTPException(401, detail="Incorrect Password")


def user_create(
    form_data: Annotated[OAuth2PasswordRequestForm, Depends()],
    session: Session = Depends(get_session),
) -> None:
    command = select(User).where(User.username == form_data.username)

    if session.exec(command).all():
        raise HTTPException(422, detail="User already exists")

    password_hash = get_password_hash(form_data.password)
    session.add(User(username=form_data.username, password_hash=password_hash))
    session.commit()


def space_create_new(
    current_user: AuthenticatedUser, id: str, session: Session = Depends(get_session)
) -> int:
    space = DataSpace(id=id, data=dict())
    session.add(space)
    session.commit()  # Resolves the space.id

    obj = SpaceMembership(
        user=current_user.id, 
        type=Membership.owner, 
        space=space.id
    )
    session.add(obj)
    session.commit()
    return HTTPStatus.OK


def get_membership(
    current_user: AuthenticatedUser,
    space: str,
    session: Session = Depends(get_session),
) -> Membership:
    return session.get(SpaceMembership, (current_user.id, space))


AuthenticatedMember = Annotated[SpaceMembership, Depends(get_membership)]


def path_get(
    membership: AuthenticatedMember,
    path: list[str],
    session: Session = Depends(get_session),
) -> Any:
    if membership is None:
        raise HTTPException(404)
    if membership.type < Membership.view:
        raise HTTPException(HTTPStatus.UNAUTHORIZED, detail=f"Access level: `{membership.type}` < `{Membership.view}`")
    
    try:
        stmt = (
            select(
                DataSpace.data.op("#>")(
                    cast(path, ARRAY(TEXT))
                )
            )
            .where(DataSpace.id == membership.space)
        )
        result = session.exec(stmt).first()
        session.ex

        if result is None:
            raise HTTPException(HTTPStatus.NOT_FOUND)

        # If path doesn't exist, Postgres returns NULL
        if result is None:
            return None

        return result

    except HTTPException:
        raise
    except Exception:
        raise HTTPException(HTTPStatus.INTERNAL_SERVER_ERROR)

def path_put(
    membership: AuthenticatedMember,
    path: list[str | int],
    value: Any,
    session: Session = Depends(get_session),
) -> int:
    if membership is None:
        raise HTTPException(404)
    if membership.type < Membership.edit:
        raise HTTPException(HTTPStatus.UNAUTHORIZED, detail=f"Access level: `{membership.type}` < `{Membership.edit}`")
    
    try:
        stmt = (
            update(DataSpace)
            .where(DataSpace.id == membership.space)
            .values(
                data=func.jsonb_set(
                    DataSpace.data,
                    cast(json.dumps(path), ARRAY(TEXT)),
                    cast(json.dumps(value), JSONB),
                    True,  # create missing keys
                )
            )
        )

        # keys = "".join([f"['{k}']" for k in path])
        # stmt = text(f"UPDATE dataspace SET data{keys}=:val WHERE id=:space;").bindparams(
        #     space=membership.space,
        #     val=json.dumps(value)
        # )
        print(stmt.compile())
        result = session.exec(stmt)
        # print(result.one())
        session.commit()

        validate_stmt = select(DataSpace).where(DataSpace.id == membership.space)
        validate = session.exec(validate_stmt)

        # dspace:DataSpace = session.exec(select(DataSpace).where(DataSpace.id == membership.space))
        # dspace.data
        print("Validate", validate.one())

        if result.rowcount == 0:
            raise HTTPException(HTTPStatus.NOT_FOUND)
        session.commit()

        return HTTPStatus.OK
    except HTTPException:
        raise HTTPException(HTTPStatus.NOT_MODIFIED)
    except Exception as e:
        session.rollback()
        raise e

def path_delete(
    membership: AuthenticatedMember, path: str, session: Session = Depends(get_session)
) -> None:
    if membership is None:
        raise HTTPException(404)
    if membership.type < Membership.edit:
        raise HTTPException(HTTPStatus.UNAUTHORIZED, f"Access level: `{membership.type}` < `{Membership.edit}`")

    if not path:
        # deleting root would wipe the whole document — probably unsafe
        raise HTTPException(HTTPStatus.BAD_REQUEST, detail="Can not delete root")

    try:
        stmt = (
            update(DataSpace)
            .where(DataSpace.id == membership.space)
            .values(
                data=DataSpace.data.op("#-")(
                    cast(path, ARRAY(TEXT))
                )
            )
        )

        result = session.exec(stmt)

        if result.rowcount == 0:
            raise HTTPException(HTTPStatus.NOT_FOUND)

        session.commit()

    except HTTPException:
        raise
    except Exception:
        session.rollback()
        raise HTTPException(HTTPStatus.NOT_MODIFIED)
