# RAC Monitoring Visits Dashboard

A GitHub Pages-ready dashboard for monthly Refugee Accommodation Centre (RAC) monitoring data from Kobo and MLSP.

## Project structure

- `index.html` — dashboard page and semantic layout
- `assets/css/styles.css` — visual design and responsive layout
- `assets/js/app.js` — filters, calculations, visualisations and table interactions
- `assets/data/dashboard.json` — generated browser-ready data (do not edit manually)
- `data/kobo_data.xlsx` — Kobo source export
- `data/rac_demographics.xlsx` — MLSP demographic snapshots
- `data/rac_map.xlsx` — RAC coordinates, matched by RAC ID
- `scripts/build_dashboard_data.py` — rebuilds `dashboard.json` from the three source workbooks

## Refreshing the dashboard data

Replace any of the source workbooks with their latest versions, then run:

```powershell
python scripts\build_dashboard_data.py
```

The dashboard is intended to be served through GitHub Pages. For local preview, run `python -m http.server` in the project folder and open the displayed local URL. Opening `index.html` directly through `file://` will not load the JSON file.

MLSP data take precedence for capacity, hosted population, broad age profile and disability figures. Within each calendar month, only the latest MLSP snapshot date is used. RACs or months missing from that snapshot fall back to Kobo. Raion names always come from Kobo. RAC coordinates are rendered on an interactive Leaflet map.

## Reporting-month convention

Visits dated from the 1st through the 7th are assigned to the preceding reporting month. If the same RAC appears more than once in a reporting wave, the latest submission is retained.
