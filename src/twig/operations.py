from http import HTTPStatus
import json
from typing import Annotated, Any

from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
import jwt
from sqlmodel import Session, asc, delete, select

from .models import Membership, TokenStr, Token
from .constants import ALGORITHM, SECRET_KEY
from .db.connection import get_session
from .db.tables import DataSpace, Datum, SpaceMembership, User
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
    current_user: AuthenticatedUser, 
    name: str, 
    session: Session = Depends(get_session)
) -> HTTPStatus:
    print("creating a space")
    space = DataSpace(id=name)
    session.add(space)
    session.commit()  # Resolves the space.id

    obj = SpaceMembership(
        user=current_user.username, 
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
    return session.get(SpaceMembership, (current_user.username, space))


AuthenticatedMember = Annotated[SpaceMembership, Depends(get_membership)]

def unescape(part:str):
    return part.replace("~1", "/").replace("~0", "~")
def escape(part:str):
    return part.replace("/", "~1").replace("~", "~0")
# def path_to_keys(path:str):
#     if not path.startswith('/'):
#         assert path == ""
#         return []
#     return [unescape(part) for part in path.split('/')[1:]]

def path_get(
    membership: AuthenticatedMember,
    path: str = "",
    session: Session = Depends(get_session),
) -> Any:
    if membership is None:
        raise HTTPException(404)

    statement = (
        select(Datum)
        .where(
            Datum.path.startswith(
                path
            ),  # TODO: it may be faster to omit this if path==""
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
) -> HTTPStatus:
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
) -> HTTPStatus:
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
            if rows.count == 0:
                break
            for row in rows:
                suffix = row.path.lstrip(child_path)
                row.path = decrement_path + suffix
            decrement_path = child_path

    session.commit()
    return HTTPStatus.OK
