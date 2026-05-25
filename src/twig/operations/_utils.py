
import json

from sqlmodel import Session, select

from ..db.tables import Datum
from ..models import JSON_DATA


def unescape(part:str):
    return part.replace("~1", "/").replace("~0", "~")

def escape(part:str):
    return part.replace("~", "~0").replace("/", "~1")

def _recursive_put(
    obj: JSON_DATA, space: int, path: str, session: Session
):
    if isinstance(obj, (int, str, float)) or obj is None:
        row = session.get(Datum, (path, space))
        value = json.dumps(obj)
        if row:
            if value != row.value:
                row.value = value
        else:
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
        # TODO: Update or add
        # session.add(
        #     Datum(
        #         path=path,
        #         space=space,
        #         value="{}",
        #     )
        # )
        for k, v in obj.items():
            _recursive_put(v, space, f"{path}/{escape(k)}", session)


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
