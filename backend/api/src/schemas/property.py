"""Property Pydantic schemas."""
from datetime import datetime
from typing import Optional, Dict, Any
from uuid import UUID
from pydantic import BaseModel, Field


class PropertyBase(BaseModel):
    parcel_id: str
    address: str
    city: str
    county: str
    state: str
    zip_code: str
    country: str = "US"
    property_type: Optional[str] = None
    lot_size_sqft: Optional[int] = None
    year_built: Optional[int] = None
    owner_name: Optional[str] = None
    assessed_value: Optional[int] = None
    jurisdiction_id: Optional[str] = None
    zoning: Optional[str] = None
    source_data: Dict[str, Any] = Field(default_factory=dict)


class PropertyCreate(PropertyBase):
    pass


class PropertyOut(PropertyBase):
    id: UUID
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class PropertySearchParams(BaseModel):
    county: Optional[str] = None
    state: Optional[str] = None
    city: Optional[str] = None
    lat: Optional[float] = None
    lon: Optional[float] = None
    radius_meters: float = 1000
