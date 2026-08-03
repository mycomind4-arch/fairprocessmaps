"""Integration tests for the full evidence lifecycle."""
import pytest
from httpx import AsyncClient

from src.main import app


@pytest.fixture
async def client():
    async with AsyncClient(app=app, base_url="http://test") as ac:
        yield ac


@pytest.fixture
async def property_id(client: AsyncClient):
    """Create a test property and return its ID."""
    payload = {
        "parcel_id": "INT-TEST-001",
        "address": "123 Integration St",
        "city": "Oakland",
        "county": "Alameda",
        "state": "CA",
        "zip_code": "94607",
        "country": "US",
        "property_type": "residential",
        "owner_name": "Test Owner",
    }
    resp = await client.post("/api/v1/properties", json=payload)
    assert resp.status_code == 201
    return resp.json()["id"]


@pytest.mark.asyncio
async def test_full_flow(client: AsyncClient, property_id: str):
    """Test: create property → get evidence → get timeline → analyze due-process."""
    # 1. Get property
    resp = await client.get(f"/api/v1/properties/{property_id}")
    assert resp.status_code == 200
    assert resp.json()["parcel_id"] == "INT-TEST-001"

    # 2. List evidence (empty initially)
    resp = await client.get(f"/api/v1/evidence?property_id={property_id}")
    assert resp.status_code == 200
    assert resp.json() == []

    # 3. Get timeline (empty initially)
    resp = await client.get(f"/api/v1/timeline/{property_id}")
    assert resp.status_code == 200
    assert resp.json() == []

    # 4. Run due-process analysis (no evidence → score 100, no flags)
    resp = await client.get(f"/api/v1/due-process/property/{property_id}")
    assert resp.status_code == 200
    report = resp.json()
    assert report["overall_score"] == 100
    assert len(report["flags"]) == 0


@pytest.mark.asyncio
async def test_search_empty_query(client: AsyncClient):
    """Search with empty query should return 422."""
    resp = await client.get("/api/v1/search")
    assert resp.status_code == 422


@pytest.mark.asyncio
async def test_search_short_query(client: AsyncClient):
    """Search with valid query should return 200."""
    resp = await client.get("/api/v1/search?q=test")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


@pytest.mark.asyncio
async def test_properties_filter_by_county(client: AsyncClient):
    """Properties can be filtered by county."""
    resp = await client.get("/api/v1/properties?county=Alameda")
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


@pytest.mark.asyncio
async def test_properties_spatial_search(client: AsyncClient):
    """Properties can be searched by lat/lon radius."""
    resp = await client.get(
        "/api/v1/properties?lat=37.8044&lon=-122.2712&radius_meters=5000"
    )
    assert resp.status_code == 200
    assert isinstance(resp.json(), list)


@pytest.mark.asyncio
async def test_health_check(client: AsyncClient):
    """Health endpoint returns version info."""
    resp = await client.get("/health")
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "ok"
    assert data["version"] == "2.0.0"
    assert data["service"] == "fairprocess-api"
