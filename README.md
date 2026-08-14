# RAC Monitoring Visits Dashboard

A GitHub Pages-ready dashboard for monthly Refugee Accommodation Centre (RAC) monitoring data from ACTED and MLSP.

## Project structure

- `index.html` — dashboard page and semantic layout
- `assets/css/styles.css` — visual design and responsive layout
- `assets/js/app.js` — filters, calculations, visualisations and table interactions
- `assets/data/dashboard.json` — generated browser-ready data (do not edit manually)
- `assets/data/adm1 for PBI with Left Bank.json` — Moldova administrative boundary map
- `assets/downloads/` — generated six-sheet monthly Excel downloads
- `data/kobo_data.xlsx` — ACTED Kobo source export
- `data/rac_demographics.xlsx` — MLSP demographic snapshots
- `data/rac_map.xlsx` — RAC coordinates, matched by RAC ID
- `scripts/build_dashboard_data.py` — rebuilds `dashboard.json` and all monthly Excel downloads from the three source workbooks
- `scripts/build_monthly_workbooks.py` — creates the styled six-sheet workbooks used by the download button

## Refreshing the dashboard data

Replace any of the source workbooks with their latest versions, then run:

```powershell
python scripts\build_dashboard_data.py
```

The dashboard is intended to be served through GitHub Pages. For local preview, run `python -m http.server` in the project folder and open the displayed local URL. Opening `index.html` directly through `file://` will not load the JSON file.

MLSP data take precedence for capacity, hosted population, broad age profile and disability figures. Within each calendar month, only the latest MLSP snapshot date is used. RACs or months missing from that snapshot fall back to ACTED. Capacity is carried forward from the latest MLSP value available for each RAC up to the selected month. Raion names always come from ACTED. RAC coordinates are plotted over the local Moldova administrative boundary file; no external map service is required.

## Reporting-month convention

Visits dated from the 1st through the 7th are assigned to the preceding reporting month. If the same RAC appears more than once in a reporting wave, the latest submission is retained.
