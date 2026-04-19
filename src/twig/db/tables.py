
from typing import Any

from sqlmodel import Column, Field, SQLModel
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.ext.mutable import MutableDict



class DataSpace(SQLModel, table=True):
    id: str = Field(description="Name of the space", primary_key=True)
    public: bool = Field(
        description="Expose this space to all users",
        default=False,
    )
    data: dict[str, Any] = Field(
        sa_column=Column(MutableDict.as_mutable(JSONB)), 
        default_factory=dict
    )


class Events(SQLModel, table=True):
    path: str = Field(description="Path to the datum", primary_key=True)
    space: str = Field(foreign_key="dataspace.id", primary_key=True)
    user: int = Field(foreign_key="user.id", primary_key=True)


class User(SQLModel, table=True):
    id: int | None = Field(default=None, primary_key=True)
    username: str = Field(unique=True)
    password_hash: str = Field(description="Hashed password")


class SpaceMembership(SQLModel, table=True):
    user: int = Field(foreign_key="user.id", primary_key=True)
    space: str = Field(foreign_key="dataspace.id", primary_key=True)
    type: int = Field(description="owner / edit / view")
