# FairProcess 2.0 API Documentation

## Base URL
```
http://localhost:8000/api/v1
```

Interactive docs available at `/docs` (Swagger) and `/redoc` (ReDoc).

## Endpoints

### Properties
| Method | Path | Description |
|--------|------|-------------|
| GET | `/properties` | List properties (supports county, state, city, lat/lon/radius filters) |
| GET | `/properties/{id}` | Get a single property |
| POST | `/properties` | Create a new property |

### Evidence
| Method | Path | Description |
|--------|------|-------------|
| GET | `/evidence` | List evidence (filter by property_id, type, status, flags) |
| GET | `/evidence/{id}` | Get a single evidence record |
| PATCH | `/evidence/{id}` | Update evidence (status, extracted data) |

### Timeline
| Method | Path | Description |
|--------|------|-------------|
| GET | `/timeline/{property_id}` | Get chronological timeline for a property |

### Search
| Method | Path | Description |
|--------|------|-------------|
| GET | `/search?q=...` | Full-text search across properties, evidence, and timeline |

### Upload
| Method | Path | Description |
|--------|------|-------------|
| POST | `/upload/property/{id}` | Upload a document (multipart/form-data) — queues OCR + AI extraction |

### Due-Process Analysis
| Method | Path | Description |
|--------|------|-------------|
| GET | `/due-process/property/{id}` | Run due-process analysis on all evidence for a property |

### Health
| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |

## Due-Process Analysis Rules

| Rule ID | Name | Severity | Description |
|---------|------|----------|-------------|
| notice_timing | Adequate Notice Period | Critical | Owner must receive notice ≥10 days before hearing/action |
| hearing_right | Right to Hearing | Critical | Owner must be offered a hearing before adverse action |
| appeal_pathway | Appeal Pathway Available | Warning | Decision must include information on how to appeal |
| record_access | Public Record Accessibility | Warning | Relevant records must be accessible via FOIA or public portal |
| consistent_application | Consistent Application | Info | Enforcement should be consistent with prior similar cases |

## Score Calculation
```
score = max(0, 100 - (critical_count × 25) - (warning_count × 10))
```
