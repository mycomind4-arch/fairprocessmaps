// Seed sample graph data

CREATE (p:Property {
    id: 'prop-001',
    parcel_id: '12345-678-901',
    address: '1234 Main St',
    city: 'Oakland',
    county: 'Alameda',
    state: 'CA',
    zip: '94607'
})

CREATE (e1:Evidence {
    id: 'ev-001',
    evidence_type: 'code_enforcement_notice',
    title: 'Notice of Violation - Overgrown Vegetation',
    date: date('2026-01-15'),
    status: 'analyzed'
})

CREATE (e2:Evidence {
    id: 'ev-002',
    evidence_type: 'hearing_notice',
    title: 'Administrative Hearing Notice',
    date: date('2026-02-01'),
    status: 'analyzed'
})

CREATE (party1:Party {
    id: 'party-001',
    name: 'Jane Doe',
    role: 'property_owner'
})

CREATE (party2:Party {
    id: 'party-002',
    name: 'City of Oakland Code Enforcement',
    role: 'issuing_agency'
})

CREATE (j:Jurisdiction {
    id: 'jur-001',
    name: 'City of Oakland',
    state: 'CA',
    type: 'municipal'
})

CREATE (v:Violation {
    id: 'viol-001',
    code_section: 'OMC 8.08.030',
    description: 'Overgrown vegetation exceeding 12 inches',
    severity: 'minor'
})

CREATE (t1:TimelineEvent {
    id: 'te-001',
    event_type: 'notice_issued',
    title: 'Notice of Violation Issued',
    event_date: date('2026-01-15'),
    is_due_process_critical: true
})

CREATE (t2:TimelineEvent {
    id: 'te-002',
    event_type: 'hearing_scheduled',
    title: 'Hearing Scheduled',
    event_date: date('2026-02-15'),
    is_due_process_critical: true
})

// Relationships
CREATE (e1)-[:CONCERNS]->(p)
CREATE (e2)-[:CONCERNS]->(p)
CREATE (e1)-[:INVOLVES {role: 'defendant'}]->(party1)
CREATE (e1)-[:INVOLVES {role: 'plaintiff'}]->(party2)
CREATE (e1)-[:ISSUED_BY]->(j)
CREATE (e1)-[:VIOLATES]->(v)
CREATE (t1)-[:BASED_ON]->(e1)
CREATE (t2)-[:BASED_ON]->(e2)
CREATE (t2)-[:PRECEDED_BY]->(t1)
CREATE (p)-[:LOCATED_IN]->(j)
