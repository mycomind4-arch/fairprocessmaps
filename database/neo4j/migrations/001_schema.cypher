// FairProcess 2.0 Neo4j Graph Schema

// Constraints
CREATE CONSTRAINT property_id IF NOT EXISTS
FOR (p:Property) REQUIRE p.id IS UNIQUE;

CREATE CONSTRAINT evidence_id IF NOT EXISTS
FOR (e:Evidence) REQUIRE e.id IS UNIQUE;

CREATE CONSTRAINT party_id IF NOT EXISTS
FOR (p:Party) REQUIRE p.id IS UNIQUE;

CREATE CONSTRAINT jurisdiction_id IF NOT EXISTS
FOR (j:Jurisdiction) REQUIRE j.id IS UNIQUE;

CREATE CONSTRAINT violation_id IF NOT EXISTS
FOR (v:Violation) REQUIRE v.id IS UNIQUE;

// Indexes
CREATE INDEX property_parcel IF NOT EXISTS
FOR (p:Property) ON (p.parcel_id);

CREATE INDEX evidence_type IF NOT EXISTS
FOR (e:Evidence) ON (e.evidence_type);

CREATE INDEX event_date IF NOT EXISTS
FOR (t:TimelineEvent) ON (t.event_date);

// Node types:
// Property, Evidence, Party, Jurisdiction, Violation, TimelineEvent, Statute, Case

// Relationship types:
// CONCERNS -> Property
// INVOLVES -> Party
// ISSUED_BY -> Jurisdiction
// CITES -> Statute
// PRECEDED_BY -> TimelineEvent
// VIOLATES -> Violation
// SIMILAR_TO -> Case
