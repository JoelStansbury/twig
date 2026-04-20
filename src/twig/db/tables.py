
from sqlmodel import Field, SQLModel


class DataSpace(SQLModel, table=True):
    id: str = Field(description="Name of the space", unique=True, primary_key=True)
    public: bool = Field(
        description="Expose this space to all users",
        default=False,
    )


class Datum(SQLModel, table=True):
    path: str = Field(description="Path to the datum", primary_key=True)
    space: str = Field(foreign_key="dataspace.id", primary_key=True)
    value: str = Field(description="JSONified value at path")


class User(SQLModel, table=True):
    username: str = Field(unique=True, primary_key=True)
    password_hash: str = Field(description="Hashed password")


class SpaceMembership(SQLModel, table=True):
    user: str = Field(foreign_key="user.username", primary_key=True)
    space: str = Field(foreign_key="dataspace.id", primary_key=True)
    type: int = Field(description="owner / edit / view")
