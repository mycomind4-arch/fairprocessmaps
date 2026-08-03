"""API integration tests."""
import pytest
from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from src.main import app
from src.database import async_session


@pytest.fixture
async def client():
    async with AsyncClient(app=app, base_url="http://test") as ac:
        yield ac


@pytest.mark.asyncio
async def test_health(client: AsyncClient):
    response = await client.get("/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"


@pytest.mark.asyncio
async def test_create_and_get_property(client: AsyncClient):
    payload = {
        "parcel_id": "TEST-001",
        "address": "999 Test Ave",
        "city": "Testville",
        "county": "Test",
        "state": "CA",
        "zip_code": "99999",
        "country": "US",
    }
    create_resp = await client.post("/api/v1/properties", json=payload)
    assert create_resp.status_code == 201
    data = create_resp.json()
    assert data["parcel_id"] == "TEST-001"

    get_resp = await client.get(f"/api/v1/properties/{data['id']}")
    assert get_resp.status_code == 200
    assert get_resp.json()["address"] == "999 Test Ave"
