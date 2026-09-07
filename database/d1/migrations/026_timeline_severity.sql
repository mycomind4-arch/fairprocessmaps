-- Graph timeline responses read severity from timeline_events, but the original
-- schema only supplied it on the separate events table. Leave historical rows
-- unknown; the graph API already displays a neutral info level for NULL.
ALTER TABLE timeline_events ADD COLUMN severity TEXT;
