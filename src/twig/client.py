from contextlib import contextmanager
from typing import Any

from fastapi import Response
from fastapi.testclient import TestClient

from .models import ACTION


class APIClient:
    def __init__(self, client):
        self.client: TestClient = client
        self.token = None

    def signup(self, user_data) -> Response:
        return self.client.post("/signup", data=user_data)
    
    def authenticate(self, user_data) -> Response:
        response = self.client.post("/token", data=user_data)
        self.token = response.json().get('access_token')
        return response

    def _get_headers(self) -> dict[str,str]:
        return {
            "Authorization": f"Bearer {self.token}"
        }

    def create_space(self, space_data) -> Response:
        return self.client.post(
            "/create", 
            headers=self._get_headers(),
            json=space_data
        )

    def _api(self, action:ACTION, path:str, space:str, value:Any = "") -> Response:
        return self.client.post(
            f"/api?space={space}", 
            headers=self._get_headers(), 
            json={
                "action": action, 
                "path": path,
                "value": value
            }
        )
    
    def put(self, path:str, space:str, value) -> Response:
        return self._api("PUT", path, space, value)

    def delete(self, path, space) -> Response:
        return self._api("DELETE", path, space)
    
    def get(self, path, space) -> Response:
        return self._api("GET", path, space)
    
    @contextmanager
    def websocket(self):
        with self.client.websocket_connect(
            f"/watch?token={self.token}"
        ) as ws:
            yield ws

