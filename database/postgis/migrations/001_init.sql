-- 001_init.sql
-- FairProcess 2.0 initial schema

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Properties table with spatial geometry
CREATE TABLE properties (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    parcel_id VARCHAR(64) UNIQUE NOT NULL,
    address TEXT NOT NULL,
    city VARCHAR(128) NOT NULL,
    county VARCHAR(128) NOT NULL,
    state VARCHAR(16) NOT NULL,
    zip_code VARCHAR(16) NOT NULL,
    country VARCHAR(64) DEFAULT 'US',

    geom GEOMETRY(MULTIPOLYGON, 4326),
    centroid GEOMETRY(POINT, 4326),

    property_type VARCHAR(64),
    lot_size_sqft INTEGER,
    year_built INTEGER,
    owner_name VARCHAR(256),
    assessed_value INTEGER,

    jurisdiction_id VARCHAR(64),
    zoning VARCHAR(64),

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    source_data JSONB DEFAULT '{}'
);

CREATE INDEX idx_properties_geom ON properties USING GIST(geom);
CREATE INDEX idx_properties_centroid ON properties USING GIST(centroid);
CREATE INDEX idx_properties_county ON properties(county, state);
CREATE INDEX idx_properties_parcel ON properties(parcel_id);

-- Evidence table
CREATE TYPE evidence_type AS ENUM (
    'code_enforcement_notice',
    'permit_application',
    'court_filing',
    'hearing_notice',
    'appeal_document',
    'inspector_report',
    'photograph',
    'video',
    'audio',
    'correspondence',
    'public_record',
    'other'
);

CREATE TYPE evidence_status AS ENUM (
    'raw',
    'ocr_pending',
    'ocr_complete',
    'extraction_pending',
    'extracted',
    'normalized',
    'linked',
    'analyzed',
    'flagged',
    'archived'
);

CREATE TABLE evidence (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,

    title TEXT NOT NULL,
    description TEXT,
    evidence_type evidence_type NOT NULL,
    status evidence_status DEFAULT 'raw',

    source_url TEXT,
    source_portal VARCHAR(128),
    source_record_id VARCHAR(256),
    scraped_at TIMESTAMPTZ,

    storage_bucket VARCHAR(128),
    storage_key VARCHAR(512),
    file_name VARCHAR(512),
    file_size_bytes INTEGER,
    mime_type VARCHAR(128),
    checksum_sha256 VARCHAR(64),

    ocr_text TEXT,
    ocr_confidence INTEGER,
    extracted_markdown TEXT,

    extracted_entities JSONB DEFAULT '[]',
    extracted_dates JSONB DEFAULT '[]',
    extracted_parties JSONB DEFAULT '[]',
    extracted_violations JSONB DEFAULT '[]',
    extracted_fines JSONB DEFAULT '[]',

    due_process_flags JSONB DEFAULT '[]',
    due_process_score INTEGER,

    embedding VECTOR(1536),  -- pgvector; OpenAI text-embedding-3-small

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    processed_at TIMESTAMPTZ,
    processed_by VARCHAR(128)
);

CREATE INDEX idx_evidence_property ON evidence(property_id);
CREATE INDEX idx_evidence_type ON evidence(evidence_type);
CREATE INDEX idx_evidence_status ON evidence(status);
CREATE INDEX idx_evidence_due_process ON evidence USING GIN(due_process_flags);

-- Timeline events
CREATE TABLE timeline_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    property_id UUID NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
    evidence_id UUID REFERENCES evidence(id) ON DELETE SET NULL,

    event_type VARCHAR(64) NOT NULL,
    title TEXT NOT NULL,
    description TEXT,

    event_date DATE NOT NULL,
    event_time TIMESTAMPTZ,
    deadline_date DATE,

    initiating_party VARCHAR(256),
    receiving_party VARCHAR(256),
    jurisdiction VARCHAR(128),
    venue VARCHAR(256),

    is_due_process_critical BOOLEAN DEFAULT FALSE,
    discrepancy_flags JSONB DEFAULT '[]',

    sequence_order INTEGER,
    previous_event_id UUID REFERENCES timeline_events(id),

    source_text TEXT,
    source_page INTEGER,

    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_timeline_property ON timeline_events(property_id);
CREATE INDEX idx_timeline_date ON timeline_events(event_date);
CREATE INDEX idx_timeline_critical ON timeline_events(is_due_process_critical) WHERE is_due_process_critical = TRUE;

-- Trigger to update updated_at
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_properties_updated_at BEFORE UPDATE ON properties
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_evidence_updated_at BEFORE UPDATE ON evidence
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER update_timeline_updated_at BEFORE UPDATE ON timeline_events
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
