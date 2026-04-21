import json
from urllib.parse import urlencode

from fastapi import Response
from fastapi.testclient import TestClient

class APIClient:
    def __init__(self, client):
        self.client: TestClient = client
        self.token = None

    def signup(self, user_data) -> Response:
        return self.client.put("/signup", data=user_data)
    
    def authenticate(self, user_data) -> Response:
        response = self.client.post("/token", data=user_data)
        self.token = response.json().get('access_token')
        return response

    def _get_headers(self) -> dict[str,str]:
        return {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json",
        }

    def put(self, path, space, value) -> Response:
        query = {"path": path, "space": space, "value": json.dumps(value)}
        return self.client.put(
            f"/?{urlencode(query)}", 
            headers=self._get_headers()
        )

    def delete(self, path, space) -> Response:
        query = {"path": path, "space": space}
        return self.client.delete(
            f"/?{urlencode(query)}", 
            headers=self._get_headers()
        )
    
    def get(self, path, space) -> Response:
        query = {"path": path, "space": space}
        return self.client.get(
            f"/?{urlencode(query)}", 
            headers=self._get_headers()
        )

    def create_space(self, space_data) -> Response:
        return self.client.put(
            f"/space/create?{urlencode(space_data)}", 
            headers=self._get_headers()
        )
