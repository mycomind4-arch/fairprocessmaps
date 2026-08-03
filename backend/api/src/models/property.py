"""Property (parcel) data model with PostGIS geometry."""
from sqlalchemy import Column, String, DateTime, Text, JSON, Integer, ForeignKey, Index
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship
from geoalchemy2 import Geometry
from datetime import datetime
import uuid

from src.database import Base


class Property(Base):
    __tablename__ = "properties"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    parcel_id = Column(String(64), unique=True, nullable=False, index=True)
    address = Column(Text, nullable=False)
    city = Column(String(128), nullable=False)
    county = Column(String(128), nullable=False)
    state = Column(String(16), nullable=False)
    zip_code = Column(String(16), nullable=False)
    country = Column(String(64), default="US")

    # PostGIS geometry — parcel boundary polygon
    geom = Column(Geometry("MULTIPOLYGON", srid=4326), nullable=True)
    # Centroid point for fast map queries
    centroid = Column(Geometry("POINT", srid=4326), nullable=True)

    # Metadata
    property_type = Column(String(64), nullable=True)  # residential, commercial, vacant, etc.
    lot_size_sqft = Column(Integer, nullable=True)
    year_built = Column(Integer, nullable=True)
    owner_name = Column(String(256), nullable=True)
    assessed_value = Column(Integer, nullable=True)

    # Jurisdiction links
    jurisdiction_id = Column(String(64), nullable=True, index=True)
    zoning = Column(String(64), nullable=True)

    # Audit
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    source_data = Column(JSON, default=dict)

    # Relationships
    evidence = relationship("Evidence", back_populates="property", cascade="all, delete-orphan")
    timeline_events = relationship("TimelineEvent", back_populates="property", cascade="all, delete-orphan")

    __table_args__ = (
        Index("idx_properties_geom", "geom", postgresql_using="gist"),
        Index("idx_properties_centroid", "centroid", postgresql_using="gist"),
        Index("idx_properties_county", "county", "state"),
    )
