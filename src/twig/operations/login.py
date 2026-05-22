from http import HTTPStatus
from typing import Annotated

from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
import jwt
from sqlmodel import Session, select

from ..models import Membership, TokenStr, Token
from ..constants import ALGORITHM, SECRET_KEY
from ..db.connection import get_session
from ..db.tables import DataSpace, SpaceMembership, User
from ..auth import create_access_token, get_password_hash, verify_password


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
    if session.exec(command).first() is not None:
        raise HTTPException(HTTPStatus.CONFLICT, detail="User already exists")


    password_hash = get_password_hash(form_data.password)
    session.add(User(username=form_data.username, password_hash=password_hash))
    session.commit()

def space_create_new(
    current_user: AuthenticatedUser, 
    name: str, 
    session: Session = Depends(get_session)
) -> None:
    print(current_user, name, session)
    
    command = select(DataSpace).where(DataSpace.id == name)
    if session.exec(command).first() is not None:
        raise HTTPException(HTTPStatus.CONFLICT)
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

def get_membership(
    current_user: AuthenticatedUser,
    space: str,
    session: Session = Depends(get_session),
) -> Membership:
    return session.get(SpaceMembership, (current_user.username, space))

AuthenticatedMember = Annotated[SpaceMembership, Depends(get_membership)]
