from contextlib import contextmanager
from typing import Any, Mapping

from httpx import Response
from fastapi.testclient import TestClient

from .models import ACTION

class APIClient:
    def __init__(self, client: TestClient) -> None:
        self.client: TestClient = client
        self.token = None

    def signup(self, user_data: Mapping[str, str]) -> Response:
        return self.client.post("/signup", data=user_data)
    
    def authenticate(self, user_data: Mapping[str, str]) -> Response:
        response = self.client.post("/token", data=user_data)
        self.token = response.json().get('access_token')
        return response

    def _get_headers(self) -> Mapping[str,str]:
        return {
            "Authorization": f"Bearer {self.token}"
        }

    def create_space(self, space_data: Mapping[str, str]) -> Response:
        return self.client.post(
            "/create", 
            headers=self._get_headers(),
            json=space_data
        )

    def _api(self, action:ACTION, path:str, space:str, value:Any = "") -> Response:
        return self.client.post(
            "/api", 
            headers=self._get_headers(),
            json={
                "action": action, 
                "path": path,
                "value": value,
                "space": space,
            }
        )
    
    def put(self, path:str, space:str, value: Any) -> Response:
        return self._api("PUT", path, space, value)

    def delete(self, path:str, space:str) -> Response:
        return self._api("DELETE", path, space)
    
    def get(self, path:str, space:str) -> Response:
        return self._api("GET", path, space)
    
    @contextmanager
    def websocket(self):
        with self.client.websocket_connect(
            f"/watch?token={self.token}"
        ) as ws:
            yield ws

