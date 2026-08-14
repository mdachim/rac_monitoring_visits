"""Compact integrity checks for the static dashboard build."""

from __future__ import annotations

import json
import re
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def main() -> None:
    data_file = ROOT / "assets" / "data" / "dashboard.json"
    data = json.loads(data_file.read_text(encoding="utf-8"))
    records = data["records"]
    demographics = data["demographicsRecords"]

    assert len(records) == 250
    assert len(demographics) == 272
    assert len({(record["month"], record["racId"]) for record in records}) == len(records)
    assert len({(record["month"], record["racId"]) for record in demographics}) == len(demographics)
    assert len(data["locations"]) == 26
    assert all(45 <= item["latitude"] <= 49 and 26 <= item["longitude"] <= 31 for item in data["locations"])

    june_kobo = [record for record in records if record["month"] == "2026-06"]
    june = [record for record in demographics if record["month"] == "2026-06"]
    july = [record for record in demographics if record["month"] == "2026-07"]
    february = [record for record in demographics if record["month"] == "2026-02"]
    january = [record for record in records if record["month"] == "2026-01"]

    assert len(june_kobo) == 13 and len(june) == 13
    assert sum(record["hosted"] for record in june) == 654
    assert sum(record["capacity"] for record in june) == 871
    assert sum(record["pwd"] for record in june) == 72
    assert {record["demographicDate"] for record in june} == {"2026-06-29"}
    assert all(record["demographicSource"] == "MLSP" for record in june)
    assert len(july) == 11
    assert sum(record["hosted"] for record in july) == 628
    assert sum(record["capacity"] for record in july) == 765
    assert sum(record["pwd"] for record in july) == 74
    assert {record["demographicDate"] for record in july} == {"2026-07-20"}
    assert {record["demographicDate"] for record in february if record["demographicSource"] == "MLSP"} == {"2026-02-23"}
    assert len(january) == 17 and any(record["visitDate"].startswith("2026-02") for record in january)
    assert next(record for record in june if record["racId"] == "2")["raion"] == "Balti"
    assert data["months"][-1]["demographicsDate"] == "2026-07-20"

    html = (ROOT / "index.html").read_text(encoding="utf-8")
    expected_tabs = {
        "Demographics",
        "Infrastructure",
        "NFI Needs",
        "Education &amp; Catering",
        "Services",
        "Calendar",
    }
    assert all(f">{tab}</button>" in html for tab in expected_tabs)
    assert "Collection in progress" not in html
    assert 'src="logos/blue-logo-Moldova.png"' in html
    assert ">Showing<" not in html
    assert 'id="activeFilterBar"' in html
    assert 'id="racMap"' in html
    assert "map-placeholder" not in html
    assert "MLSP monthly demographics" in html
    assert "leaflet@1.9.4/dist/leaflet.css" in html
    assert "leaflet@1.9.4/dist/leaflet.js" in html
    assert "assets/js/data.js" not in html
    assert 'class="rank-list raion-scroll"' in html

    css = (ROOT / "assets" / "css" / "styles.css").read_text(encoding="utf-8")
    assert re.search(r"\.bar-track\s*\{[^}]*display:\s*block", css, re.DOTALL)
    assert re.search(r"\.bar-fill\s*\{[^}]*display:\s*block", css, re.DOTALL)
    assert re.search(r"\.rac-map\s*\{[^}]*height:\s*640px", css, re.DOTALL)
    assert re.search(r"\.raion-scroll\s*\{[^}]*height:\s*220px[^}]*overflow-y:\s*auto", css, re.DOTALL)
    assert ".rac-map.leaflet-container" in css

    app = (ROOT / "assets" / "js" / "app.js").read_text(encoding="utf-8")
    assert "baseDemographicRecords" in app
    assert 'fetch("assets/data/dashboard.json")' in app
    assert "window.L.map" in app and "window.L.tileLayer" in app
    assert "window.L.circleMarker" in app and "racMap.fitBounds" in app
    assert 'rac: (record) => record.racId === key' in app
    assert not (ROOT / "assets" / "js" / "data.js").exists()
    assert not (ROOT / "assets" / "map").exists()

    references = re.findall(r'(?:src|href)="([^"#]+)"', html)
    local_references = [reference for reference in references if not reference.startswith(("http://", "https://"))]
    missing = [reference for reference in local_references if not (ROOT / reference).exists()]
    assert not missing, f"Missing local assets: {missing}"

    print(
        json.dumps(
            {
                "koboRecords": len(records),
                "demographicRecords": len(demographics),
                "latestMLSP": {"month": "2026-07", "date": "2026-07-20", "racs": len(july), "hosted": 628},
                "mappedRACs": len(data["locations"]),
                "dataFormat": "JSON",
                "map": "Leaflet",
                "localReferences": "ok",
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()
