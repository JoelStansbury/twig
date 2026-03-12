from sqlmodel import SQLModel, Session, create_engine

import os

DATABASE_URL = os.getenv("DATABASE_URL")
# DATABASE_URL = "sqlite:///database.db"
# DATABASE_URL = "postgresql+psycopg2:///twig"

engine = create_engine(DATABASE_URL)

def get_session():
    with Session(engine) as session:
        yield session
