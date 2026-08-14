(async function () {
  "use strict";

  let dataset;
  let moldovaTopology;
  try {
    const [dataResponse, mapResponse] = await Promise.all([
      fetch("assets/data/dashboard.json"),
      fetch("assets/data/adm1%20for%20PBI%20with%20Left%20Bank.json"),
    ]);
    if (!dataResponse.ok) throw new Error(`Dashboard data request failed with ${dataResponse.status}`);
    if (!mapResponse.ok) throw new Error(`Moldova boundary request failed with ${mapResponse.status}`);
    [dataset, moldovaTopology] = await Promise.all([dataResponse.json(), mapResponse.json()]);
  } catch (error) {
    console.error(error);
    document.body.innerHTML = "<p style='padding:2rem'>The dashboard data could not be loaded. Please open the site through GitHub Pages or a local web server.</p>";
    return;
  }

  const elements = {
    month: document.querySelector("#monthTimeline"),
    timelineMonth: document.querySelector("#timelineMonth"),
    previousMonth: document.querySelector("#previousMonth"),
    nextMonth: document.querySelector("#nextMonth"),
    latestMonth: document.querySelector("#latestMonth"),
    tabs: [...document.querySelectorAll("[data-tab]")],
    views: [...document.querySelectorAll("[data-view]")],
    collectionWindow: document.querySelector("#collectionWindow"),
    filterBar: document.querySelector("#activeFilterBar"),
    filterLabel: document.querySelector("#activeFilterLabel"),
    clearFilter: document.querySelector("#clearFilter"),
    kpiCoverage: document.querySelector("#kpiCoverage"),
    kpiCapacity: document.querySelector("#kpiCapacity"),
    kpiHosted: document.querySelector("#kpiHosted"),
    kpiPwd: document.querySelector("#kpiPwd"),
    kpiPwdShare: document.querySelector("#kpiPwdShare"),
    ageGender: document.querySelector("#ageGenderChart"),
    demographicSourceNote: document.querySelector("#demographicSourceNote"),
    raions: document.querySelector("#raionChart"),
    demographicsTable: document.querySelector("#demographicsTable"),
    map: document.querySelector("#racMap"),
    mapSummary: document.querySelector("#mapSummary"),
    roomTypes: document.querySelector("#roomTypeChart"),
    roomStatus: document.querySelector("#roomStatusChart"),
    infrastructureTable: document.querySelector("#infrastructureTable"),
    needLevels: document.querySelector("#needLevelChart"),
    needs: document.querySelector("#needsChart"),
    needsTable: document.querySelector("#needsTable"),
    attendance: document.querySelector("#attendanceChart"),
    foodServices: document.querySelector("#foodServiceChart"),
    educationTable: document.querySelector("#educationTable"),
    services: document.querySelector("#serviceChart"),
    servicesTable: document.querySelector("#servicesTable"),
    calendar: document.querySelector("#calendarGrid"),
  };

  const numberFormat = new Intl.NumberFormat("en-GB");
  const percentFormat = new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 });
  const monthFormat = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
  const dateFormat = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  const calendarTimes = ["08:00–10:00", "10:00–12:00", "14:00–16:00", "16:00–18:00"];
  const locationLookup = new Map((dataset.locations || []).map((location) => [location.racId, location]));
  const mapWidth = 620;
  const mapHeight = 720;
  const mapMinZoom = 1;
  const mapMaxZoom = 8;
  let activeTab = "demographics";
  let activeFilter = null;
  let mapShapes = null;
  let mapProjection = null;
  let mapSvg = null;
  let mapView = { zoom: 1, x: 0, y: 0 };
  let mapDrag = null;

  function parseIso(value) {
    return new Date(`${value}T00:00:00Z`);
  }

  function formatMonth(value) {
    return monthFormat.format(parseIso(`${value}-01`));
  }

  function formatDate(value) {
    return value ? dateFormat.format(parseIso(value)) : "—";
  }

  function formatNumber(value) {
    return numberFormat.format(Math.round(Number(value) || 0));
  }

  function ratio(numerator, denominator) {
    return denominator ? (numerator / denominator) * 100 : 0;
  }

  function sum(records, key) {
    return records.reduce((total, record) => total + Number(record[key] || 0), 0);
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function isYes(value) {
    return String(value || "").trim().toLowerCase() === "yes";
  }

  function selectedMonthIndex() {
    return Number(elements.month.value);
  }

  function selectedMonthId() {
    return dataset.months[selectedMonthIndex()]?.id || dataset.meta.latestMonth;
  }

  function monthMeta(id) {
    return dataset.months.find((month) => month.id === id);
  }

  function baseRecords() {
    const id = selectedMonthId();
    return dataset.records.filter((record) => record.month === id);
  }

  function baseDemographicRecords() {
    const id = selectedMonthId();
    return (dataset.demographicsRecords || dataset.records).filter((record) => record.month === id);
  }

  function filteredRecords(records) {
    return activeFilter ? records.filter(activeFilter.predicate) : records;
  }

  function recordsForChart(type, base, filtered) {
    return activeFilter?.type === type ? base : filtered;
  }

  function setMonth(value) {
    const index = typeof value === "number"
      ? value
      : dataset.months.findIndex((month) => month.id === value);
    if (index < 0 || index >= dataset.months.length) return;
    elements.month.value = String(index);
    activeFilter = null;
    render();
  }

  function initializeControls() {
    const latestIndex = dataset.months.findIndex((month) => month.id === dataset.meta.latestMonth);
    elements.month.max = String(dataset.months.length - 1);
    elements.month.value = String(latestIndex >= 0 ? latestIndex : dataset.months.length - 1);
  }

  function showView(name) {
    activeTab = name;
    elements.tabs.forEach((tab) => {
      const active = tab.dataset.tab === name;
      tab.classList.toggle("active", active);
      tab.setAttribute("aria-selected", String(active));
    });
    elements.views.forEach((view) => {
      view.hidden = view.dataset.view !== name;
    });
    render();
  }

  function renderPeriod() {
    const index = selectedMonthIndex();
    const meta = monthMeta(selectedMonthId());
    elements.timelineMonth.textContent = formatMonth(meta.id);
    elements.collectionWindow.textContent = `${formatDate(meta.from)} – ${formatDate(meta.to)}`;
    elements.previousMonth.disabled = index === 0;
    elements.nextMonth.disabled = index === dataset.months.length - 1;
    elements.latestMonth.classList.toggle("active", index === dataset.months.length - 1);
  }

  function renderFilterState() {
    elements.filterBar.hidden = !activeFilter;
    elements.filterLabel.textContent = activeFilter?.label || "";
  }

  function renderSummary(records, assessedCount) {
    const capacityRecords = records.filter((record) => Number.isFinite(record.capacity));
    const hosted = sum(records, "hosted");
    const pwd = sum(records, "pwd");
    elements.kpiCoverage.textContent = formatNumber(assessedCount);
    elements.kpiCapacity.textContent = capacityRecords.length ? formatNumber(sum(capacityRecords, "capacity")) : "—";
    elements.kpiHosted.textContent = formatNumber(hosted);
    elements.kpiPwd.textContent = formatNumber(pwd);
    elements.kpiPwdShare.textContent = `${percentFormat.format(ratio(pwd, hosted))}% of hosted residents`;
  }

  function aggregateProfile(records) {
    const labels = ["0-17 years", "18-59 years", "60+ years"];
    return labels
      .map((label) => [label, records.reduce((total, record) => total + Number(record.demographicProfile?.[label] || 0), 0)])
      .filter((entry) => entry[1] > 0);
  }

  function segment(value, total, className, filterType = "", filterKey = "", filterLabel = "") {
    if (!value || !total) return "";
    const share = ratio(value, total);
    const attrs = filterType ? filterAttributes(filterType, filterKey, filterLabel) : "";
    const selected = activeFilter?.type === filterType && activeFilter.key === filterKey ? " segment-selected" : "";
    const tag = filterType ? "button" : "span";
    const buttonType = filterType ? ' type="button"' : "";
    return `<${tag}${buttonType} class="stack-segment ${className}${selected}" style="width:${share}%" title="${formatNumber(value)}" ${attrs}>${share >= 13 ? formatNumber(value) : ""}</${tag}>`;
  }

  function renderDemographics(base, filtered) {
    const ageSource = recordsForChart("age", base, filtered);
    renderBars(elements.ageGender, aggregateProfile(ageSource), "age-gender-row", "age", (label) => `Age group: ${label}`);

    const meta = monthMeta(selectedMonthId());
    elements.demographicSourceNote.textContent = meta.demographicsFromMLSP
      ? `MLSP snapshot ${formatDate(meta.demographicsDate)} · ACTED fills ${Math.max(meta.demographicsCoverage - meta.demographicsFromMLSP, 0)} RAC${meta.demographicsCoverage - meta.demographicsFromMLSP === 1 ? "" : "s"}`
      : "ACTED data · capacity from latest available MLSP snapshot";

    const raionSource = recordsForChart("raion", base, filtered);
    const raions = new Map();
    raionSource.forEach((record) => raions.set(record.raion || "Not specified", (raions.get(record.raion || "Not specified") || 0) + record.hosted));
    renderBars(elements.raions, [...raions.entries()].sort((a, b) => b[1] - a[1]), "rank-row", "raion", (label) => `Raion: ${label}`);

    renderMap(base, filtered);

    const headers = ["RAC ID", "Raion", "Address", "Capacity", "Hosted", "0-17", "18-59", "60+", "PwD", "Primary source", "Data date"];
    const rows = filtered.slice().sort(sortRacs).map((record) => [record.racId, record.raion || "—", raw(escapeHtml(record.address || "—"), "location-cell"), numeric(record.capacity), numeric(record.hosted), numeric(record.demographicProfile?.["0-17 years"]), numeric(record.demographicProfile?.["18-59 years"]), numeric(record.demographicProfile?.["60+ years"]), numeric(record.pwd), record.demographicSource || "ACTED", formatDate(record.demographicDate)]);
    elements.demographicsTable.innerHTML = tableHtml(headers, rows);
  }

  function prepareMap() {
    if (mapShapes && mapProjection) return;
    const transform = moldovaTopology.transform || { scale: [1, 1], translate: [0, 0] };
    const arcCache = new Map();

    function decodeArc(arcIndex) {
      const reversed = arcIndex < 0;
      const index = reversed ? ~arcIndex : arcIndex;
      if (!arcCache.has(index)) {
        let x = 0;
        let y = 0;
        const coordinates = moldovaTopology.arcs[index].map(([deltaX, deltaY]) => {
          x += deltaX;
          y += deltaY;
          return [
            x * transform.scale[0] + transform.translate[0],
            y * transform.scale[1] + transform.translate[1],
          ];
        });
        arcCache.set(index, coordinates);
      }
      const coordinates = arcCache.get(index);
      return reversed ? coordinates.slice().reverse() : coordinates;
    }

    function stitchRing(arcIndexes) {
      const ring = [];
      arcIndexes.forEach((arcIndex, position) => {
        const arc = decodeArc(arcIndex);
        ring.push(...(position ? arc.slice(1) : arc));
      });
      return ring;
    }

    const polygons = [];
    Object.values(moldovaTopology.objects || {}).forEach((object) => {
      const geometries = object.type === "GeometryCollection" ? object.geometries : [object];
      geometries.forEach((geometry) => {
        const name = geometry.properties?.Raion_name || geometry.properties?.ADM1_EN || "Moldova";
        const polygonArcs = geometry.type === "MultiPolygon" ? geometry.arcs : [geometry.arcs];
        polygonArcs.forEach((rings) => polygons.push({ name, rings: rings.map(stitchRing) }));
      });
    });

    const allPoints = polygons.flatMap((polygon) => polygon.rings.flat());
    const meanLatitude = allPoints.reduce((total, point) => total + point[1], 0) / allPoints.length;
    const longitudeFactor = Math.cos(meanLatitude * Math.PI / 180);
    const projected = allPoints.map(([longitude, latitude]) => [longitude * longitudeFactor, latitude]);
    const minX = Math.min(...projected.map((point) => point[0]));
    const maxX = Math.max(...projected.map((point) => point[0]));
    const minY = Math.min(...projected.map((point) => point[1]));
    const maxY = Math.max(...projected.map((point) => point[1]));
    const padding = 28;
    const scale = Math.min((mapWidth - padding * 2) / (maxX - minX), (mapHeight - padding * 2) / (maxY - minY));
    const drawnWidth = (maxX - minX) * scale;
    const drawnHeight = (maxY - minY) * scale;
    const offsetX = (mapWidth - drawnWidth) / 2;
    const offsetY = (mapHeight - drawnHeight) / 2;

    mapProjection = ([longitude, latitude]) => ({
      x: offsetX + (longitude * longitudeFactor - minX) * scale,
      y: offsetY + (maxY - latitude) * scale,
    });
    mapShapes = polygons.map((polygon) => ({
      name: polygon.name,
      path: polygon.rings.map((ring) => ring.map((point, index) => {
        const projectedPoint = mapProjection(point);
        return `${index ? "L" : "M"}${projectedPoint.x.toFixed(1)} ${projectedPoint.y.toFixed(1)}`;
      }).join(" ") + " Z").join(" "),
    }));

    elements.map.innerHTML = `
      <div class="map-controls" aria-label="Map zoom controls">
        <button type="button" id="mapZoomIn" aria-label="Zoom in">+</button>
        <button type="button" id="mapZoomOut" aria-label="Zoom out">−</button>
        <button type="button" id="mapZoomReset" aria-label="Reset map view">Reset</button>
      </div>
      <svg class="moldova-map" viewBox="0 0 620 720" role="img" aria-label="Moldova administrative map with RAC locations" preserveAspectRatio="xMidYMid meet">
        <g class="moldova-regions">${mapShapes.map((shape) => `<path class="moldova-region" d="${shape.path}"><title>${escapeHtml(shape.name)}</title></path>`).join("")}</g>
        <g class="rac-map-points" id="racMapPoints"></g>
      </svg>
      <span class="map-help">Scroll or use controls to zoom · drag map to pan</span>`;
    mapSvg = elements.map.querySelector(".moldova-map");
    initializeMapInteractions();
  }

  function clampMapView() {
    const width = mapWidth / mapView.zoom;
    const height = mapHeight / mapView.zoom;
    mapView.x = Math.max(0, Math.min(mapWidth - width, mapView.x));
    mapView.y = Math.max(0, Math.min(mapHeight - height, mapView.y));
  }

  function applyMapView() {
    if (!mapSvg) return;
    clampMapView();
    const width = mapWidth / mapView.zoom;
    const height = mapHeight / mapView.zoom;
    mapSvg.setAttribute("viewBox", `${mapView.x.toFixed(2)} ${mapView.y.toFixed(2)} ${width.toFixed(2)} ${height.toFixed(2)}`);
    mapSvg.querySelectorAll(".rac-point").forEach((point) => {
      const circle = point.querySelector("circle");
      const textLabel = point.querySelector("text");
      circle.setAttribute("r", (Number(circle.dataset.baseRadius) / mapView.zoom).toFixed(2));
      textLabel.style.fontSize = `${(Number(textLabel.dataset.baseFontSize) / mapView.zoom).toFixed(2)}px`;
    });
    elements.map.querySelector("#mapZoomOut").disabled = mapView.zoom <= mapMinZoom;
    elements.map.querySelector("#mapZoomIn").disabled = mapView.zoom >= mapMaxZoom;
  }

  function zoomMap(nextZoom, anchor = null) {
    const previousWidth = mapWidth / mapView.zoom;
    const previousHeight = mapHeight / mapView.zoom;
    const focus = anchor || { x: mapView.x + previousWidth / 2, y: mapView.y + previousHeight / 2 };
    const relativeX = (focus.x - mapView.x) / previousWidth;
    const relativeY = (focus.y - mapView.y) / previousHeight;
    mapView.zoom = Math.max(mapMinZoom, Math.min(mapMaxZoom, nextZoom));
    const nextWidth = mapWidth / mapView.zoom;
    const nextHeight = mapHeight / mapView.zoom;
    mapView.x = focus.x - relativeX * nextWidth;
    mapView.y = focus.y - relativeY * nextHeight;
    applyMapView();
  }

  function eventMapPoint(event) {
    const point = mapSvg.createSVGPoint();
    point.x = event.clientX;
    point.y = event.clientY;
    return point.matrixTransform(mapSvg.getScreenCTM().inverse());
  }

  function initializeMapInteractions() {
    elements.map.querySelector("#mapZoomIn").addEventListener("click", () => zoomMap(mapView.zoom * 1.5));
    elements.map.querySelector("#mapZoomOut").addEventListener("click", () => zoomMap(mapView.zoom / 1.5));
    elements.map.querySelector("#mapZoomReset").addEventListener("click", () => {
      mapView = { zoom: 1, x: 0, y: 0 };
      applyMapView();
    });
    mapSvg.addEventListener("wheel", (event) => {
      event.preventDefault();
      zoomMap(mapView.zoom * (event.deltaY < 0 ? 1.35 : 1 / 1.35), eventMapPoint(event));
    }, { passive: false });
    mapSvg.addEventListener("dblclick", (event) => {
      event.preventDefault();
      zoomMap(mapView.zoom * 1.6, eventMapPoint(event));
    });
    mapSvg.addEventListener("pointerdown", (event) => {
      if (event.target.closest(".rac-point") || mapView.zoom <= mapMinZoom) return;
      const matrix = mapSvg.getScreenCTM();
      mapDrag = {
        pointerId: event.pointerId,
        clientX: event.clientX,
        clientY: event.clientY,
        startX: mapView.x,
        startY: mapView.y,
        scaleX: matrix.a,
        scaleY: matrix.d,
      };
      mapSvg.setPointerCapture(event.pointerId);
      mapSvg.classList.add("is-dragging");
    });
    mapSvg.addEventListener("pointermove", (event) => {
      if (!mapDrag || event.pointerId !== mapDrag.pointerId) return;
      mapView.x = mapDrag.startX - (event.clientX - mapDrag.clientX) / mapDrag.scaleX;
      mapView.y = mapDrag.startY - (event.clientY - mapDrag.clientY) / mapDrag.scaleY;
      applyMapView();
    });
    const stopDragging = (event) => {
      if (!mapDrag || event.pointerId !== mapDrag.pointerId) return;
      mapDrag = null;
      mapSvg.classList.remove("is-dragging");
    };
    mapSvg.addEventListener("pointerup", stopDragging);
    mapSvg.addEventListener("pointercancel", stopDragging);
    applyMapView();
  }

  function renderMap(base, filtered) {
    prepareMap();
    const source = recordsForChart("rac", base, filtered);
    const mapped = source.filter((record) => locationLookup.has(record.racId));
    const pointsLayer = elements.map.querySelector("#racMapPoints");
    pointsLayer.innerHTML = mapped.map((record) => {
      const location = locationLookup.get(record.racId);
      const point = mapProjection([location.longitude, location.latitude]);
      const residents = Math.max(0, Number(record.hosted) || 0);
      const radius = Math.min(28, 13 + Math.sqrt(residents) * 1.1);
      const fontSize = String(record.racId).length > 2 ? 8 : 9.5;
      const label = `RAC ${record.racId}, ${record.raion || "raion not specified"}: ${formatNumber(record.hosted)} residents`;
      return `
        <g class="rac-point${selectedClass("rac", record.racId)}" transform="translate(${point.x.toFixed(1)} ${point.y.toFixed(1)})" tabindex="0" role="button" aria-label="${escapeHtml(label)}" ${filterAttributes("rac", record.racId, `RAC ${record.racId}`)}>
          <circle r="${radius.toFixed(1)}" data-base-radius="${radius.toFixed(1)}"></circle>
          <text y="0.35em" data-base-font-size="${fontSize}">${escapeHtml(record.racId)}</text>
          <title>${escapeHtml(label)}</title>
        </g>`;
    }).join("");
    applyMapView();
    elements.mapSummary.textContent = `${mapped.length} of ${source.length} RACs mapped · bubble size = residents`;
  }

  function sortRacs(a, b) {
    return String(a.racId).localeCompare(String(b.racId), undefined, { numeric: true });
  }

  function filterAttributes(type, key, label) {
    return `data-filter-type="${escapeHtml(type)}" data-filter-key="${escapeHtml(encodeURIComponent(key))}" data-filter-label="${escapeHtml(label)}"`;
  }

  function selectedClass(type, key) {
    return activeFilter?.type === type && activeFilter.key === key ? " is-filter-selected" : "";
  }

  function renderBars(container, entries, rowClass = "category-row", filterType = "", labelBuilder = (label) => label) {
    const visible = entries.filter((entry) => Number(entry[1]) > 0);
    const max = Math.max(...visible.map((entry) => entry[1]), 1);
    container.innerHTML = visible.length
      ? visible.map(([label, value]) => {
          const attrs = filterType ? filterAttributes(filterType, label, labelBuilder(label)) : "";
          return `
            <button class="${rowClass}${selectedClass(filterType, label)}" type="button" ${attrs}>
              <span class="chart-label" title="${escapeHtml(label)}">${escapeHtml(label)}</span>
              <span class="bar-track"><span class="bar-fill" style="width:${ratio(value, max)}%"></span></span>
              <span class="bar-number">${formatNumber(value)}</span>
            </button>`;
        }).join("")
      : "<p>No data are available for the current selection.</p>";
  }

  function countValues(records, getter) {
    const counts = new Map();
    records.forEach((record) => {
      const value = getter(record);
      if (!String(value || "").trim()) return;
      counts.set(value, (counts.get(value) || 0) + 1);
    });
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }

  function yesCount(records, getter) {
    return records.filter((record) => isYes(getter(record))).length;
  }

  function renderInfrastructure(base, filtered) {
    const roomSource = recordsForChart("roomType", base, filtered);
    renderBars(elements.roomTypes, countValues(roomSource, (record) => record.roomType), "category-row", "roomType", (label) => `Room type: ${label}`);

    const conditionSource = recordsForChart("condition", base, filtered);
    const statuses = [
      ["Bedroom privacy", yesCount(conditionSource, (record) => record.privacy?.bedrooms)],
      ["Bedroom security", yesCount(conditionSource, (record) => record.security?.bedrooms)],
      ["Bedroom ventilation", yesCount(conditionSource, (record) => record.ventilation?.bedrooms)],
      ["Accessible entrance", yesCount(conditionSource, (record) => record.accessibleEntrance)],
    ];
    renderBars(elements.roomStatus, statuses, "status-row", "condition", (label) => `Adequate condition: ${label}`);

    const headers = ["RAC ID", "Raion", "Room type", "Toilet type", "Showers separate", "Separated by gender", "Accessible sanitation", "Child-friendly space", "Location", "Accessible entrance", "Adaptable for PwD"];
    const rows = filtered.slice().sort(sortRacs).map((record) => [record.racId, record.raion, record.roomType || "—", record.toiletType || "—", pill(record.showersSeparate), pill(record.genderSeparatedSanitation), pill(record.accessibleSanitation), pill(record.childFriendlySpace), record.childFriendlyLocation || "—", pill(record.accessibleEntrance), pill(record.adaptablePwd)]);
    elements.infrastructureTable.innerHTML = tableHtml(headers, rows, "compact-wide");
  }

  function needCount(record) {
    return Object.values(record.needs || {}).filter(isYes).length;
  }

  function needLevel(record) {
    const count = needCount(record);
    if (count === 0) return "none";
    if (count <= 3) return "low";
    if (count <= 6) return "medium";
    return "high";
  }

  function renderNeeds(base, filtered) {
    const levelSource = recordsForChart("needLevel", base, filtered);
    const levels = [
      ["No needs expressed", levelSource.filter((record) => needLevel(record) === "none").length, "none"],
      ["Low · 1–3 needs", levelSource.filter((record) => needLevel(record) === "low").length, "low"],
      ["Medium · 4–6 needs", levelSource.filter((record) => needLevel(record) === "medium").length, "medium"],
      ["High · 7+ needs", levelSource.filter((record) => needLevel(record) === "high").length, "high"],
    ].filter((entry) => entry[1] > 0);
    const max = Math.max(...levels.map((entry) => entry[1]), 1);
    elements.needLevels.innerHTML = levels.length ? levels.map(([label, value, key]) => `
      <button class="category-row${selectedClass("needLevel", key)}" type="button" ${filterAttributes("needLevel", key, `Need level: ${label}`)}>
        <span class="chart-label">${escapeHtml(label)}</span>
        <span class="bar-track"><span class="bar-fill" style="width:${ratio(value, max)}%"></span></span>
        <span class="bar-number">${formatNumber(value)}</span>
      </button>`).join("") : "<p>No need-level data are available.</p>";

    const itemSource = recordsForChart("needItem", base, filtered);
    const labels = Object.keys(itemSource[0]?.needs || {}).filter((label) => itemSource.some((record) => String(record.needs[label] || "").trim()));
    const needs = labels.map((label) => [label, itemSource.filter((record) => isYes(record.needs[label])).length]).sort((a, b) => b[1] - a[1]);
    renderBars(elements.needs, needs, "need-row", "needItem", (label) => `NFI needed: ${label}`);

    const tableLabels = Object.keys(filtered[0]?.needs || {}).filter((label) => filtered.some((record) => String(record.needs[label] || "").trim()));
    const headers = ["RAC ID", "Raion", ...tableLabels];
    const rows = filtered.slice().sort(sortRacs).map((record) => [record.racId, record.raion, ...tableLabels.map((label) => pill(record.needs[label]))]);
    elements.needsTable.innerHTML = tableHtml(headers, rows, "compact-wide");
  }

  function renderEducation(base, filtered) {
    const attendanceSource = recordsForChart("attendance", base, filtered);
    const attendance = [
      ["Total attending", sum(attendanceSource, "schoolAttendance"), "schoolAttendance"],
      ["In person", sum(attendanceSource, "schoolInPerson"), "schoolInPerson"],
      ["Online", sum(attendanceSource, "schoolOnline"), "schoolOnline"],
    ].filter((entry) => entry[1] > 0);
    renderKeyedBars(elements.attendance, attendance, "attendance", (label) => `Education attendance: ${label}`);

    const foodSource = recordsForChart("foodService", base, filtered);
    const foodOptions = ["Catering (food provided)", "Meals cooked on site", "Voucher", "Other"];
    const foodServices = foodOptions.map((label) => [label, foodSource.filter((record) => String(record.foodService || "").toLowerCase().includes(label.toLowerCase())).length, label]).filter((entry) => entry[1] > 0);
    renderKeyedBars(elements.foodServices, foodServices, "foodService", (label) => `Food service: ${label}`);

    const headers = ["RAC ID", "Raion", "Hosted", "Children", "3–6", "7–11", "12–17", "Education access", "Attending", "In person", "Online", "Meal provider", "Food service", "Meals/day", "Satisfaction"];
    const rows = filtered.slice().sort(sortRacs).map((record) => [record.racId, record.raion, numeric(record.hosted), numeric(record.children), numeric(record.educationAges?.["3-6 years"]), numeric(record.educationAges?.["7-11 years"]), numeric(record.educationAges?.["12-17 years"]), pill(record.educationAccess), numeric(record.schoolAttendance), numeric(record.schoolInPerson), numeric(record.schoolOnline), record.mealProvider || "—", record.foodService || "—", record.mealsPerDay || "—", record.cateringSatisfaction || "—"]);
    elements.educationTable.innerHTML = tableHtml(headers, rows, "compact-wide");
  }

  function renderKeyedBars(container, entries, type, labelBuilder) {
    const max = Math.max(...entries.map((entry) => entry[1]), 1);
    container.innerHTML = entries.length ? entries.map(([label, value, key]) => `
      <button class="category-row${selectedClass(type, key)}" type="button" ${filterAttributes(type, key, labelBuilder(label))}>
        <span class="chart-label">${escapeHtml(label)}</span>
        <span class="bar-track"><span class="bar-fill" style="width:${ratio(value, max)}%"></span></span>
        <span class="bar-number">${formatNumber(value)}</span>
      </button>`).join("") : "<p>No data are available for the current selection.</p>";
  }

  function serviceClass(value) {
    const normalized = String(value || "").toLowerCase();
    if (normalized === "available") return "available";
    if (normalized === "needed") return "needed";
    if (normalized === "not available") return "unavailable";
    return "";
  }

  function renderServices(base, filtered) {
    const source = recordsForChart("serviceStatus", base, filtered);
    const labels = Object.keys(source[0]?.services || {}).filter((label) => source.some((record) => String(record.services[label] || "").trim()));
    elements.services.innerHTML = labels.length ? labels.map((label) => {
      const responses = source.map((record) => record.services[label]).filter(Boolean);
      const available = responses.filter((value) => value === "Available").length;
      const needed = responses.filter((value) => value === "Needed").length;
      const unavailable = responses.filter((value) => value === "Not Available").length;
      const total = responses.length;
      return `
        <div class="service-status-row">
          <span class="chart-label" title="${escapeHtml(label)}">${escapeHtml(label)}</span>
          <span class="stack-track">
            ${segment(available, total, "available", "serviceStatus", `${label}|Available`, `${label}: Available`)}
            ${segment(needed, total, "needed", "serviceStatus", `${label}|Needed`, `${label}: Needed`)}
            ${segment(unavailable, total, "unavailable", "serviceStatus", `${label}|Not Available`, `${label}: Not available`)}
          </span>
          <span class="chart-number">${formatNumber(total)}</span>
        </div>`;
    }).join("") : "<p>No service responses are available.</p>";

    const tableLabels = Object.keys(filtered[0]?.services || {}).filter((label) => filtered.some((record) => String(record.services[label] || "").trim()));
    const headers = ["RAC ID", "Raion", ...tableLabels];
    const rows = filtered.slice().sort(sortRacs).map((record) => [record.racId, record.raion, ...tableLabels.map((label) => pill(record.services[label], serviceClass(record.services[label])))]);
    elements.servicesTable.innerHTML = tableHtml(headers, rows, "compact-wide");
  }

  function renderCalendar(records) {
    const days = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    const rows = records.filter((record) => days.some((day) => record.calendar?.[day]?.some(Boolean))).sort(sortRacs);
    if (!rows.length) {
      elements.calendar.innerHTML = '<p class="calendar-empty">No recurring activities were reported for this period.</p>';
      return;
    }
    elements.calendar.innerHTML = `<table class="calendar-table"><thead><tr><th>RAC ID</th>${days.map((day) => `<th>${day}</th>`).join("")}</tr></thead><tbody>${rows.map((record) => `<tr><td>${escapeHtml(record.racId)}<br><small>${escapeHtml(record.raion || "")}</small></td>${days.map((day) => `<td>${calendarCell(record.calendar?.[day] || [])}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
  }

  function calendarCell(entries) {
    const content = entries.map((entry, index) => entry ? `<div class="calendar-entry"><span class="calendar-time">${calendarTimes[index]}</span>${escapeHtml(entry)}</div>` : "").join("");
    return content || '<span class="calendar-empty">—</span>';
  }

  function makeFilter(type, key, label) {
    const conditions = {
      "Bedroom privacy": (record) => isYes(record.privacy?.bedrooms),
      "Bedroom security": (record) => isYes(record.security?.bedrooms),
      "Bedroom ventilation": (record) => isYes(record.ventilation?.bedrooms),
      "Accessible entrance": (record) => isYes(record.accessibleEntrance),
    };
    const predicates = {
      age: (record) => Number(record.demographicProfile?.[key] || 0) > 0,
      raion: (record) => (record.raion || "Not specified") === key,
      rac: (record) => record.racId === key,
      roomType: (record) => record.roomType === key,
      condition: conditions[key] || (() => true),
      needLevel: (record) => needLevel(record) === key,
      needItem: (record) => isYes(record.needs?.[key]),
      attendance: (record) => Number(record[key] || 0) > 0,
      foodService: (record) => String(record.foodService || "").toLowerCase().includes(key.toLowerCase()),
      serviceStatus: (record) => {
        const separator = key.lastIndexOf("|");
        const service = key.slice(0, separator);
        const status = key.slice(separator + 1);
        return record.services?.[service] === status;
      },
    };
    return { type, key, label, predicate: predicates[type] || (() => true) };
  }

  function raw(html, className = "") { return { html, className }; }
  function numeric(value) { return raw(Number.isFinite(value) ? formatNumber(value) : "—", "number-cell"); }
  function pill(value, forcedClass = "") {
    const normalized = String(value || "").trim().toLowerCase();
    const className = forcedClass || (normalized === "yes" ? "yes" : normalized === "no" ? "no" : "");
    return raw(`<span class="status-pill ${className}">${escapeHtml(value || "—")}</span>`);
  }

  function tableHtml(headers, rows, extraClass = "") {
    if (!rows.length) return '<p class="calendar-empty">No RACs match the current selection.</p>';
    return `<table class="data-table ${extraClass}"><thead><tr>${headers.map((header) => `<th>${escapeHtml(header)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${row.map(tableCell).join("")}</tr>`).join("")}</tbody></table>`;
  }

  function tableCell(value) {
    if (value && typeof value === "object" && "html" in value) return `<td class="${escapeHtml(value.className || "")}">${value.html}</td>`;
    return `<td>${escapeHtml(value ?? "—")}</td>`;
  }

  function render() {
    const base = baseRecords();
    const filtered = filteredRecords(base);
    const demographicBase = baseDemographicRecords();
    const demographicFiltered = (() => {
      if (!activeFilter) return demographicBase;
      if (["age", "raion", "rac"].includes(activeFilter.type)) return filteredRecords(demographicBase);
      const matchingIds = new Set(filtered.map((record) => record.racId));
      return demographicBase.filter((record) => matchingIds.has(record.racId));
    })();
    renderPeriod();
    renderFilterState();
    renderSummary(demographicFiltered, filtered.length);
    renderDemographics(demographicBase, demographicFiltered);
    renderInfrastructure(base, filtered);
    renderNeeds(base, filtered);
    renderEducation(base, filtered);
    renderServices(base, filtered);
    renderCalendar(filtered);
  }

  elements.month.addEventListener("input", () => {
    activeFilter = null;
    render();
  });
  elements.previousMonth.addEventListener("click", () => setMonth(selectedMonthIndex() - 1));
  elements.nextMonth.addEventListener("click", () => setMonth(selectedMonthIndex() + 1));
  elements.latestMonth.addEventListener("click", () => setMonth(dataset.months.length - 1));
  elements.tabs.forEach((tab) => tab.addEventListener("click", () => showView(tab.dataset.tab)));
  elements.clearFilter.addEventListener("click", () => {
    activeFilter = null;
    render();
  });
  document.addEventListener("click", (event) => {
    const target = event.target.closest("[data-filter-type]");
    if (!target) return;
    const type = target.dataset.filterType;
    const key = decodeURIComponent(target.dataset.filterKey || "");
    const label = target.dataset.filterLabel || key;
    activeFilter = activeFilter?.type === type && activeFilter.key === key ? null : makeFilter(type, key, label);
    render();
  });
  document.addEventListener("keydown", (event) => {
    if (!event.target.matches(".rac-point[data-filter-type]") || !["Enter", " "].includes(event.key)) return;
    event.preventDefault();
    event.target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  });

  initializeControls();
  showView(activeTab);
})();
