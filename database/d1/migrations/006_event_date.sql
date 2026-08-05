-- Migration 006: Event Date & Provenance
-- Adds temporal provenance to the event store.
-- event_date = when the action actually occurred (may differ from recorded_at)
-- created_at = when the database row was inserted (already exists)
-- This is critical for legal/procedural timelines where discovery date ≠ action date.

ALTER TABLE events ADD COLUMN event_date TEXT;
CREATE INDEX IF NOT EXISTS idx_events_event_date ON events(event_date);
