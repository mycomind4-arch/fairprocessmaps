# Accela Building Permit Scraper

This skill scrapes building permit records from Humboldt County's Accela Citizen Access portal for a given property address.

## Usage
```
run_skill accela-permit-scraper "APN=510-122-026-000 ADDRESS=1440 Railroad Dr PROJECT_ID=b7683257-8c93-457b-aa50-e8cb151429c5"
```

## What it does
1. Opens the Accela Citizen Access portal in a headless browser
2. Searches for building permits by street address
3. Extracts all matching permit records (number, type, status, contractor, description, dates)
4. Pushes the scraped data to the FairProcess D1 database via the API
5. Returns a summary of permits found

## Data Source
- URL: https://aca-prod.accela.com/HUMBOLDT/Cap/CapHome.aspx?module=Building
- Search by: Street Number + Street Name (Parcel Number search often returns no results)
- Records indexed: Building permits with status history

## Limitations
- Accela uses ASP.NET AJAX — requires a real browser (cannot be scraped via HTTP)
- Some permits may not appear if the address format differs
- Contractor and valuation details require clicking into each record
