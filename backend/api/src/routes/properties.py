"""Property (parcel) routes."""
from typing import List, Optional
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from geoalchemy2.functions import ST_DWithin, ST_GeogFromText

from src.database import get_db
from src.models.property import Property
from src.schemas.property import PropertyCreate, PropertyOut, PropertySearchParams

router = APIRouter()


@router.get("", response_model=List[PropertyOut])
async def list_properties(
    county: Optional[str] = Query(None),
    state: Optional[str] = Query(None),
    city: Optional[str] = Query(None),
    lat: Optional[float] = Query(None),
    lon: Optional[float] = Query(None),
    radius_meters: Optional[float] = Query(1000),
    limit: int = Query(50, ge=1, le=500),
    offset: int = Query(0, ge=0),
    db: AsyncSession = Depends(get_db),
):
    """List properties with optional spatial filter."""
    stmt = select(Property)

    if county:
        stmt = stmt.where(Property.county.ilike(f"%{county}%"))
    if state:
        stmt = stmt.where(Property.state == state.upper())
    if city:
        stmt = stmt.where(Property.city.ilike(f"%{city}%"))

    if lat is not None and lon is not None:
        point = f"SRID=4326;POINT({lon} {lat})"
        stmt = stmt.where(
            ST_DWithin(Property.centroid, ST_GeogFromText(point), radius_meters)
        )

    stmt = stmt.offset(offset).limit(limit)
    result = await db.execute(stmt)
    return result.scalars().all()


@router.get("/{property_id}", response_model=PropertyOut)
async def get_property(property_id: UUID, db: AsyncSession = Depends(get_db)):
    """Get a single property by ID."""
    result = await db.execute(select(Property).where(Property.id == property_id))
    prop = result.scalar_one_or_none()
    if not prop:
        raise HTTPException(status_code=404, detail="Property not found")
    return prop


@router.post("", response_model=PropertyOut, status_code=201)
async def create_property(data: PropertyCreate, db: AsyncSession = Depends(get_db)):
    """Create a new property record."""
    prop = Property(**data.model_dump())
    db.add(prop)
    await db.commit()
    await db.refresh(prop)
    return prop
