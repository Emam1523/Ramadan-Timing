//Configurations
const CONFIG = {
  GPS_TIMEOUT: 8000,
  QUICK_GPS_TIMEOUT: 3500,
  DB_TIMEOUT: 5000,
  MANUAL_SELECTION_LOCK_MS: 30000,
};

//Helpers
function qs(sel, root = document) {
  return root.querySelector(sel);
}

function qsa(sel, root = document) {
  return Array.from(root.querySelectorAll(sel));
}

function setText(node, text) {
  if (node) node.textContent = text;
}

function pad2(n) {
  return String(n).padStart(2, "0");
}

function formatDateDDMMYYYY(date) {
  return `${pad2(date.getDate())}/${pad2(
    date.getMonth() + 1
  )}/${date.getFullYear()}`;
}

function parseDateDDMMYYYY(str) {
  if (typeof str !== "string") return null;
  const m = str.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  const d = new Date(year, month - 1, day);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function timeStringToMinutes(timeStr) {
  if (!timeStr || typeof timeStr !== "string") return null;
  const s = timeStr.trim();

  const m12 = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (m12) {
    let hours = Number(m12[1]);
    const minutes = Number(m12[2]);
    const mer = m12[3].toUpperCase();
    if (hours === 12) hours = 0;
    if (mer === "PM") hours += 12;
    return hours * 60 + minutes;
  }

  const m24 = s.match(/^(\d{1,2}):(\d{2})$/);
  if (m24) {
    const hours = Number(m24[1]);
    const minutes = Number(m24[2]);
    return hours * 60 + minutes;
  }

  return null;
}

function getDistrictElement() {
  return (
    document.getElementById("district") ||
    qs(".time-location-info div:first-child span")
  );
}

//UI Elements
const el = {
  district: getDistrictElement(),
  time: document.getElementById("current-time"),
  currentDate: document.getElementById("current-date"),

  locationNotice: document.getElementById("location-notice"),

  turnOnLocationBtn: document.getElementById("turnOnLocationBtn"),

  locationGate: document.getElementById("locationGate"),
  locationGateText: document.getElementById("locationGateText"),
  locationGateTitle: document.querySelector(".location-gate-title"),
  appContainer: document.getElementById("appContainer"),

  districtSelector: document.getElementById("district-selector"),
  districtSelect: document.getElementById("districtSelect"),

  ramadanDay: document.getElementById("ramadan-day"),
  sehri: document.getElementById("sehri-time"),
  iftar: document.getElementById("iftar-time"),
};

const navEl = {
  mobileMenuBtn: document.getElementById("mobileMenuBtn"),
  mobileNav: document.getElementById("mobileNav"),
  mobileNavClose: document.getElementById("mobileNavClose"),
  overlay: document.getElementById("overlay"),

  calendarModal: document.getElementById("calendarModal"),
  closeCalendar: document.getElementById("closeCalendar"),
  prevMonth: document.getElementById("prevMonth"),
  nextMonth: document.getElementById("nextMonth"),
  currentMonth: document.getElementById("currentMonth"),
  calendarGrid: document.getElementById("calendarGrid"),
};

//Prayer Time Elements
const prayerStart = {
  Fajr: document.querySelector("#fajr-row .prayer-time"),
  Dhuhr: document.querySelector("#dhuhr-row .prayer-time"),
  Asr: document.querySelector("#asr-row .prayer-time"),
  Maghrib: document.querySelector("#maghrib-row .prayer-time"),
  Isha: document.querySelector("#isha-row .prayer-time"),
};

const prayerJamaah = {
  Fajr: document.querySelector("#fajr-row .jamaah"),
  Dhuhr: document.querySelector("#dhuhr-row .jamaah"),
  Asr: document.querySelector("#asr-row .jamaah"),
  Maghrib: document.querySelector("#maghrib-row .jamaah"),
  Isha: document.querySelector("#isha-row .jamaah"),
};

let prayerDB = null;
let prayerDBPromise = null;
let activeDistrictKey = null;
let districtKeyByLower = null;
let ramadanDateSet = null;
let locationWatchId = null;
let lastResolvedDistrict = null;
let currentPermissionState = null;
let geoFailureCount = 0;
let manualSelectionUntil = 0;
let calendarState = {
  year: new Date().getFullYear(),
  monthIndex: new Date().getMonth(),
  selectedDateKey: null,
};

async function ensureRamadanDateSet() {
  if (ramadanDateSet) return ramadanDateSet;

  const db = await loadDB();
  if (!activeDistrictKey || !db[activeDistrictKey]) {
    ramadanDateSet = new Set();
    return ramadanDateSet;
  }

  const list = db[activeDistrictKey];
  ramadanDateSet = new Set(
    list.filter((x) => x?.date && x.ramadanDay != null).map((x) => x.date)
  );
  return ramadanDateSet;
}

//Clock UI
function startClock() {
  updateClock();
  setInterval(updateClock, 1000);
}

function updateClock() {
  if (!el.time) return;
  el.time.textContent = new Date().toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
}

//Update Top Info UI
function updateTopInfoUI(loc) {
  if (!el.district) el.district = getDistrictElement();
  setText(
    el.district,
    `${loc && loc.district ? loc.district : "Select district"}`
  );

  const now = new Date();
  const isMobile =
    window.matchMedia && window.matchMedia("(max-width: 650px)").matches;
  const date = isMobile
    ? formatDateDDMMYYYY(now)
    : now.toLocaleDateString("en-US", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });

  setText(el.currentDate, date);
}

//Reset Prayer UI
function resetPrayerUI() {
  setText(el.ramadanDay, "--");
  setText(el.sehri, "--");
  setText(el.iftar, "--");

  for (const p in prayerStart) {
    setText(prayerStart[p], "--");
    setText(prayerJamaah[p], "--");
  }

  document
    .querySelectorAll("#prayer-table tbody tr")
    .forEach((r) => r.classList.remove("current-prayer"));
}

//Location Notice & Gate UI
function ensureLocationNoticeEl() {
  if (el.locationNotice) return el.locationNotice;
  const anchor = document.querySelector(".top-info-row");
  if (!anchor) return null;

  const node = document.createElement("div");
  node.id = "location-notice";
  node.className = "location-notice";
  node.hidden = true;
  node.setAttribute("role", "status");
  node.setAttribute("aria-live", "polite");
  anchor.insertAdjacentElement("afterend", node);

  el.locationNotice = node;
  return node;
}

// Sets or clears the location notice message.
function setLocationNotice(message) {
  const node = ensureLocationNoticeEl();
  if (!node) return;

  const important =
    typeof message === "string" &&
    (message.startsWith("Location permission denied") ||
      message.startsWith("Location is unavailable"));

  node.classList.toggle("location-notice--important", Boolean(important));

  if (message) {
    node.textContent = message;
    node.hidden = false;
  } else {
    node.textContent = "";
    node.hidden = true;
  }
}

// Shows the location gate with customizable message, title, and button text.
function showLocationGate(
  message,
  { showButton, title, buttonText } = {
    showButton: true,
    title: null,
    buttonText: null,
  }
) {
  if (!el.locationGate)
    el.locationGate = document.getElementById("locationGate");
  if (!el.locationGateText)
    el.locationGateText = document.getElementById("locationGateText");
  if (!el.locationGateTitle)
    el.locationGateTitle = document.querySelector(".location-gate-title");
  if (!el.turnOnLocationBtn)
    el.turnOnLocationBtn = document.getElementById("turnOnLocationBtn");
  if (!el.appContainer)
    el.appContainer = document.getElementById("appContainer");

  if (el.locationGateText)
    el.locationGateText.textContent = message || "Location is required.";
  if (el.locationGateTitle && title) el.locationGateTitle.textContent = title;
  if (el.turnOnLocationBtn && buttonText)
    el.turnOnLocationBtn.textContent = buttonText;
  if (el.turnOnLocationBtn) el.turnOnLocationBtn.hidden = !showButton;
  if (el.locationGate) el.locationGate.hidden = false;
  if (el.appContainer) el.appContainer.hidden = true;

  setLocationNotice(null);
}

// Specific gate variants
function showTurnOnLocationButton(message) {
  showLocationGate(message || "Location is unavailable.", {
    showButton: true,
    title: "Turn on location",
    buttonText: "Turn on location",
  });
}

// Permission prompt gate without button
function showLocationPermissionGate(message) {
  showLocationGate(message || "Please allow location access to continue.", {
    showButton: false,
    title: "Allow location access",
  });
}

// Hides the location gate and shows the main app container.
function hideTurnOnLocationButton() {
  if (!el.locationGate)
    el.locationGate = document.getElementById("locationGate");
  if (!el.appContainer)
    el.appContainer = document.getElementById("appContainer");
  if (el.locationGate) el.locationGate.hidden = true;
  if (el.appContainer) el.appContainer.hidden = false;
}

//Geolocation Permission State
async function getGeolocationPermissionState() {
  try {
    if (!navigator.permissions || !navigator.permissions.query) return null;
    const status = await navigator.permissions.query({ name: "geolocation" });
    return status && status.state ? status.state : null;
  } catch {
    return null;
  }
}

async function fetchJsonWithTimeout(url, timeoutMs, fetchOptions) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      ...(fetchOptions || {}),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      throw new Error(`Request failed (${res.status})`);
    }
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

//Reverse Geocoding
async function reverseGeocode(lat, lon) {
  const url =
    `https://api.bigdatacloud.net/data/reverse-geocode-client` +
    `?latitude=${lat}&longitude=${lon}&localityLanguage=en`;

  const data = await fetchJsonWithTimeout(url, 4500);

  // Try to find Admin Level 5 (District in BD)
  let districtName = null;
  if (data.localityInfo && Array.isArray(data.localityInfo.administrative)) {
    const admin5 = data.localityInfo.administrative.find(
      (x) => x.adminLevel === 5
    );
    if (admin5 && admin5.name) {
      districtName = admin5.name;
    }
  }

  // Fallback if Admin 5 not found
  if (!districtName) {
    districtName = data.city || data.locality || "Unknown";
  }

  return {
    district: districtName,
  };
}

//Check Geolocation Availability
function canUseGeolocation() {
  return Boolean(window.isSecureContext && navigator.geolocation);
}

//DB.json Loading & Prayer Time Lookup
async function loadDB() {
  if (prayerDB) return prayerDB;
  if (prayerDBPromise) return prayerDBPromise;

  const url = new URL("db.json", window.location.href).toString();
  prayerDBPromise = fetchJsonWithTimeout(url, CONFIG.DB_TIMEOUT, {
    cache: "no-store",
  })
    .then((db) => {
      prayerDB = db;
      return prayerDB;
    })
    .finally(() => {
      prayerDBPromise = null;
    });

  return prayerDBPromise;
}

// Get today's date in DD/MM/YYYY format
function today() {
  return formatDateDDMMYYYY(new Date());
}

// Get Prayer Times for a District
async function getPrayerTimes(district) {
  const db = await loadDB();
  const key = Object.keys(db).find(
    (k) => k.toLowerCase() === String(district).toLowerCase()
  );

  const resolvedKey = key;
  if (!resolvedKey) return null;

  activeDistrictKey = resolvedKey;
  const list = Array.isArray(db[resolvedKey]) ? db[resolvedKey] : [];
  if (list.length === 0) return null;

  const target = today();
  const exact = list.find((d) => d.date === target);
  if (exact) return exact;

  const targetDate = parseDateDDMMYYYY(target);
  if (!targetDate) return list[0];

  const withParsed = list
    .map((item) => ({ item, parsed: parseDateDDMMYYYY(item.date) }))
    .filter((x) => x.parsed);

  const pastOrToday = withParsed
    .filter((x) => x.parsed.getTime() <= targetDate.getTime())
    .sort((a, b) => a.parsed.getTime() - b.parsed.getTime());

  if (pastOrToday.length > 0) return pastOrToday[pastOrToday.length - 1].item;

  withParsed.sort((a, b) => a.parsed.getTime() - b.parsed.getTime());
  return (withParsed[0] && withParsed[0].item) || list[0];
}

//Render Prayer Times
function renderPrayerTimes(data) {
  if (!data) return;

  setText(el.ramadanDay, data.ramadanDay ?? "--");
  setText(el.sehri, data.sehri ?? "--");
  setText(el.iftar, data.iftar ?? "--");

  const prayers = data.prayers || {};
  for (const p in prayerStart) {
    const row = prayers[p];
    const start = row && row.startTime ? row.startTime : "--";
    const jamaah = row && row.jamaahTime ? row.jamaahTime : "--";
    setText(prayerStart[p], start);
    setText(prayerJamaah[p], jamaah);
  }

  highlightCurrentPrayer(data);
}

//Highlight Current Prayer
function highlightCurrentPrayer(data) {
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const prayers = data && data.prayers ? data.prayers : {};
  const times = Object.entries(prayers)
    .map(([name, obj]) => {
      const start = obj && obj.startTime ? obj.startTime : null;
      const minutes = timeStringToMinutes(start);
      return minutes == null ? null : { name, minutes };
    })
    .filter(Boolean)
    .sort((a, b) => a.minutes - b.minutes);

  if (times.length === 0) return;

  document
    .querySelectorAll("#prayer-table tbody tr")
    .forEach((r) => r.classList.remove("current-prayer"));

  let active =
    currentMinutes < times[0].minutes
      ? times[times.length - 1].name
      : times[0].name;
  for (const t of times) {
    if (currentMinutes >= t.minutes) active = t.name;
  }

  document
    .getElementById(active.toLowerCase() + "-row")
    ?.classList.add("current-prayer");
}

//Mobile Navigation
function openMobileNav() {
  navEl.mobileNav?.classList.add("active");
  navEl.overlay?.classList.add("active");
}

//Mobile Navigation
function closeMobileNav() {
  navEl.mobileNav?.classList.remove("active");
  navEl.overlay?.classList.remove("active");
}

//Calendar Modal
function openCalendar() {
  navEl.calendarModal?.classList.add("active");
  closeMobileNav();
}

//Calendar Modal
function closeCalendar() {
  navEl.calendarModal?.classList.remove("active");
}

// Month Label
function monthLabel(year, monthIndex) {
  const d = new Date(year, monthIndex, 1);
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

// Get a map of date keys to entries for the active district.
async function getDistrictEntriesMap() {
  const db = await loadDB();
  if (!activeDistrictKey || !db[activeDistrictKey]) return new Map();
  const list = Array.isArray(db[activeDistrictKey])
    ? db[activeDistrictKey]
    : [];
  const map = new Map();
  for (const item of list) {
    if (item && item.date) map.set(item.date, item);
  }
  return map;
}

//District Selector
async function ensureDistrictOptions() {
  if (!el.districtSelect)
    el.districtSelect = document.getElementById("districtSelect");
  if (!el.districtSelect) return;

  // Don't repopulate if already populated
  if (el.districtSelect.options.length > 1) return;

  const db = await loadDB();
  const keys = Object.keys(db).sort((a, b) => a.localeCompare(b));

  districtKeyByLower = new Map(keys.map((k) => [k.toLowerCase(), k]));

  // Keep the first "Select district..." option
  while (el.districtSelect.options.length > 1) {
    el.districtSelect.remove(1);
  }

  for (const k of keys) {
    const opt = document.createElement("option");
    opt.value = k;
    opt.textContent = k;
    el.districtSelect.appendChild(opt);
  }
}

// Show district selector with optional message
function showDistrictSelector(message, clear = false) {
  hideTurnOnLocationButton();
  if (!el.districtSelector)
    el.districtSelector = document.getElementById("district-selector");
  if (!el.districtSelect)
    el.districtSelect = document.getElementById("districtSelect");

  if (el.districtSelector) el.districtSelector.hidden = false;

  // If clear is true, select the placeholder
  if (clear && el.districtSelect) {
    el.districtSelect.value = "";
  }

  // If we have an active district, try to select it
  if (activeDistrictKey && el.districtSelect) {
    // Check if option exists (it should if we populated)
    if (
      el.districtSelect.querySelector(`option[value="${activeDistrictKey}"]`)
    ) {
      el.districtSelect.value = activeDistrictKey;
    }
  }

  setLocationNotice(message);
}

// Wire up district selector events
function wireDistrictSelector() {
  if (!el.districtSelect)
    el.districtSelect = document.getElementById("districtSelect");
  if (!el.districtSelect) return;

  el.districtSelect.addEventListener("change", async () => {
    const val = el.districtSelect.value;
    if (!val) return;

    manualSelectionUntil = Date.now() + CONFIG.MANUAL_SELECTION_LOCK_MS;
    lastResolvedDistrict = val;
    await applyDistrict(val);
  });
}

function showDropdownFallback(message) {
  stopLocationTracking();
  activeDistrictKey = null;
  resetPrayerUI();
  showDistrictSelector(
    message ||
      "Could not detect your district — please select manually from the dropdown.",
    false
  );
}

function geolocationErrorCode(err) {
  return err && typeof err === "object" ? err.code : null;
}

function probeGeolocation(timeoutMs) {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve({ ok: false, err: { code: 0 } });
      return;
    }

    try {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ ok: true, pos }),
        (err) => resolve({ ok: false, err }),
        {
          enableHighAccuracy: true,
          timeout: timeoutMs,
          maximumAge: 0,
        }
      );
    } catch (e) {
      resolve({ ok: false, err: e });
    }
  });
}

async function resolveAndApplyFromCoords(coords) {
  const loc = await reverseGeocode(coords.latitude, coords.longitude);
  const district = loc && loc.district ? loc.district : null;
  if (!district) return false;
  lastResolvedDistrict = district;
  await applyDistrict(district);
  return true;
}

// Stop location tracking
function stopLocationTracking() {
  if (locationWatchId != null && navigator.geolocation) {
    navigator.geolocation.clearWatch(locationWatchId);
  }
  locationWatchId = null;
}

// Apply district selection
async function applyDistrict(districtName) {
  ramadanDateSet = null;

  // Always show the detected location name
  updateTopInfoUI({ district: districtName });

  const prayerData = await getPrayerTimes(districtName);
  if (!prayerData) {
    await ensureDistrictOptions();

    // Show "Unavailable" for all prayer times
    setText(el.ramadanDay, "Unavailable");
    setText(el.sehri, "Unavailable");
    setText(el.iftar, "Unavailable");

    for (const p in prayerStart) {
      setText(prayerStart[p], "Unavailable");
      setText(prayerJamaah[p], "Unavailable");
    }

    // Clear any current prayer highlighting
    document
      .querySelectorAll("#prayer-table tbody tr")
      .forEach((r) => r.classList.remove("current-prayer"));

    hideTurnOnLocationButton();
    showDistrictSelector(
      `Your current location is "${districtName}". Prayer times for "${districtName}" are not available. Please select a nearby district from the dropdown.`
    );
    return;
  }

  hideTurnOnLocationButton();
  showDistrictSelector(null);
  setLocationNotice(null);

  renderPrayerTimes(prayerData);

  calendarState.selectedDateKey = today();

  if (navEl.calendarModal?.classList.contains("active")) {
    renderCalendar();
  }
}

// Start location tracking
async function startLocationTracking() {
  geoFailureCount = 0;
  stopLocationTracking();

  if (!navigator.geolocation) {
    showDropdownFallback(
      "Location is not supported — please select your district from the dropdown box."
    );
    return;
  }

  if (!canUseGeolocation()) {
    showDropdownFallback(
      "Auto-detect requires HTTPS on most mobile browsers — please select your district from the dropdown box."
    );
    return;
  }

  // Quick one-time position lookup so the user gets results fast.
  try {
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          currentPermissionState = "granted";
          const applied = await resolveAndApplyFromCoords(pos.coords);
        } catch (e) {
          console.error(e);
        }
      },
      () => {
        // Ignore: watchPosition below will still try.
      },
      {
        enableHighAccuracy: false,
        timeout: CONFIG.QUICK_GPS_TIMEOUT,
        maximumAge: 60000,
      }
    );
  } catch {}

  locationWatchId = navigator.geolocation.watchPosition(
    async (pos) => {
      try {
        const loc = await reverseGeocode(
          pos.coords.latitude,
          pos.coords.longitude
        );
        const district = loc && loc.district ? loc.district : null;
        if (!district) return;

        // Don't override a recent manual district selection.
        if (
          Date.now() < manualSelectionUntil &&
          lastResolvedDistrict &&
          normalizeDistrict(lastResolvedDistrict) !==
            normalizeDistrict(district)
        ) {
          return;
        }

        if (
          lastResolvedDistrict &&
          normalizeDistrict(lastResolvedDistrict) ===
            normalizeDistrict(district)
        ) {
          return;
        }

        lastResolvedDistrict = district;

        await applyDistrict(district);
      } catch (e) {
        console.error(e);
        stopLocationTracking();
        await ensureDistrictOptions();
        resetPrayerUI();
        showDistrictSelector(
          "Could not detect your district — please select manually from the dropdown."
        );
      }
    },
    async (err) => {
      const code = geolocationErrorCode(err);

      // 1 = permission denied
      if (code === 1) {
        currentPermissionState = "denied";
        stopLocationTracking();
        // Your requirement: show "Turn on location" even if permission not given.
        showTurnOnLocationButton(
          "Location permission not allowed. Turn ON location, or use the dropdown to select your district."
        );
        return;
      }

      // 2 = position unavailable, 3 = timeout
      if (code === 2 || code === 3) {
        stopLocationTracking();
        resetPrayerUI();

        // First failure: show the turn-on-location gate.
        if (geoFailureCount < 1) {
          geoFailureCount += 1;
          showTurnOnLocationButton(
            "Location is OFF or unavailable. Please turn ON location, then tap the button again."
          );
          return;
        }

        // Repeated failure: fall back to dropdown.
        showDropdownFallback(
          "Location could not be detected (timeout/unavailable). Please select your district from the dropdown box."
        );
        return;
      }

      resetPrayerUI();
      showDropdownFallback(
        "Location could not be detected — please select your district from the dropdown box."
      );
    },
    {
      enableHighAccuracy: true,
      timeout: CONFIG.GPS_TIMEOUT,
      maximumAge: 3000,
    }
  );
}

// Normalize district string for comparison
function normalizeDistrict(str) {
  return String(str || "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

// Render Calendar
async function renderCalendar() {
  if (!activeDistrictKey) {
    if (!el.locationNotice || el.locationNotice.hidden) {
      setLocationNotice("Please select a district to view the calendar.");
    }
    return;
  }
  if (!navEl.calendarGrid || !navEl.currentMonth) return;

  setText(
    navEl.currentMonth,
    monthLabel(calendarState.year, calendarState.monthIndex)
  );
  navEl.calendarGrid.innerHTML = "";

  const headers = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  for (const h of headers) {
    const div = document.createElement("div");
    div.className = "calendar-day-header";
    div.textContent = h;
    navEl.calendarGrid.appendChild(div);
  }

  const first = new Date(calendarState.year, calendarState.monthIndex, 1);
  const last = new Date(calendarState.year, calendarState.monthIndex + 1, 0);
  const startOffset = first.getDay();

  for (let i = 0; i < startOffset; i++) {
    const empty = document.createElement("div");
    empty.className = "calendar-day";
    empty.style.visibility = "hidden";
    navEl.calendarGrid.appendChild(empty);
  }

  const todayKey = formatDateDDMMYYYY(new Date());
  const entries = await getDistrictEntriesMap();
  const ramadanDates = await ensureRamadanDateSet();

  for (let day = 1; day <= last.getDate(); day++) {
    const d = new Date(calendarState.year, calendarState.monthIndex, day);
    const key = formatDateDDMMYYYY(d);

    const cell = document.createElement("div");
    cell.className = "calendar-day";
    cell.textContent = String(day);
    cell.dataset.dateKey = key;

    if (key === todayKey) cell.classList.add("today");

    // Show mosque icon on all Ramadan dates (check if entry has ramadanDay property)
    const entry = entries.get(key);
    if (entry && entry.ramadanDay != null && entry.ramadanDay > 0) {
      cell.classList.add("ramadan-day");
    }

    if (calendarState.selectedDateKey && key === calendarState.selectedDateKey)
      cell.classList.add("selected");

    // Removed click event listener - calendar dates are now view-only

    navEl.calendarGrid.appendChild(cell);
  }
}

// Shift Calendar Month
function shiftCalendarMonth(delta) {
  const d = new Date(calendarState.year, calendarState.monthIndex + delta, 1);
  calendarState.year = d.getFullYear();
  calendarState.monthIndex = d.getMonth();
  renderCalendar();
}

// Wire Navigation Events
function wireNavigation() {
  navEl.mobileMenuBtn?.addEventListener("click", openMobileNav);
  navEl.mobileNavClose?.addEventListener("click", closeMobileNav);
  navEl.overlay?.addEventListener("click", closeMobileNav);

  qsa(".nav-link").forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const route = link.dataset.route;
      if (route === "calendar" || link.classList.contains("calendar-trigger")) {
        if (!activeDistrictKey) {
          setLocationNotice("Please select a district to view the calendar.");
          closeMobileNav();
          return;
        }
        openCalendar();
        renderCalendar();
      } else {
        closeMobileNav();
        if (route === "home") window.scrollTo({ top: 0, behavior: "smooth" });
      }
    });
  });

  navEl.closeCalendar?.addEventListener("click", closeCalendar);
  navEl.calendarModal?.addEventListener("click", (e) => {
    if (e.target === navEl.calendarModal) closeCalendar();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      closeMobileNav();
      closeCalendar();
    }
  });

  navEl.prevMonth?.addEventListener("click", () => shiftCalendarMonth(-1));
  navEl.nextMonth?.addEventListener("click", () => shiftCalendarMonth(1));
}

//App Initialization
async function initApp() {
  startClock();
  wireNavigation();
  wireDistrictSelector();

  // Remove any old cached location data from previous versions.
  try {
    localStorage.removeItem("locationCache");
  } catch {}

  if (!el.turnOnLocationBtn)
    el.turnOnLocationBtn = document.getElementById("turnOnLocationBtn");
  el.turnOnLocationBtn?.addEventListener("click", async () => {
    // If we can't use geolocation at all, go to dropdown.
    if (!navigator.geolocation || !window.isSecureContext) {
      showDropdownFallback(
        "Auto-detect is unavailable here. Please select your district from the dropdown box."
      );
      return;
    }

    if (currentPermissionState === "denied") {
      showDropdownFallback(
        "Location permission denied — please select your district from the dropdown box."
      );
      return;
    }

    // Show detecting message
    showLocationPermissionGate("Detecting your location…");
    const probe = await probeGeolocation(CONFIG.GPS_TIMEOUT);

    if (probe.ok) {
      // Location is ON and permission granted - automatically track
      currentPermissionState = "granted";
      showLocationPermissionGate("Location detected! Loading prayer times…");
      try {
        const applied = await resolveAndApplyFromCoords(probe.pos.coords);
        if (applied) {
          // Start tracking for updates
          startLocationTracking();
          return;
        }
      } catch (e) {
        console.error(e);
      }
      // If geocoding failed, fall back
      showDropdownFallback(
        "Could not detect your district — please select manually from the dropdown."
      );
      return;
    }

    // Location probe failed - check error code
    const code = geolocationErrorCode(probe.err);

    if (code === 1) {
      // Permission denied
      currentPermissionState = "denied";
      showDropdownFallback(
        "Location permission denied — please select your district from the dropdown box."
      );
      return;
    }

    if (code === 2 || code === 3) {
      // Location is OFF or unavailable
      geoFailureCount += 1;
      showTurnOnLocationButton(
        "Location is OFF on your device! Turn ON location, then tap the button again."
      );
      return;
    }

    // Other error
    showTurnOnLocationButton(
      "Could not detect location. Please turn ON location and try again."
    );
  });

  // Download Calendar Button Event Listener
  const downloadBtn = document.getElementById("downloadCalendarBtn");
  downloadBtn?.addEventListener("click", downloadRamadanCalendar);

  try {
    updateTopInfoUI({ district: "Select district" });
    resetPrayerUI();

    await ensureDistrictOptions();

    // Check if geolocation is available
    if (!navigator.geolocation) {
      showDropdownFallback(
        "Location is not supported — please select your district from the dropdown box."
      );
      return;
    }

    if (!window.isSecureContext) {
      currentPermissionState = "insecure";
      showDropdownFallback(
        "Auto-detect needs HTTPS. Please select your district from the dropdown box."
      );
      return;
    }

    // Get current permission state
    currentPermissionState = await getGeolocationPermissionState();

    showTurnOnLocationButton("Give location access permission.");

    // Monitor permission changes
    try {
      if (navigator.permissions && navigator.permissions.query) {
        const status = await navigator.permissions.query({
          name: "geolocation",
        });
        status.onchange = async () => {
          const state = status.state;
          currentPermissionState = state;
          if (state === "granted") {
            lastResolvedDistrict = null;
            showTurnOnLocationButton(
              "Permission granted. Turn ON location and tap the button to detect your district."
            );
          } else if (state === "denied") {
            stopLocationTracking();
            showDropdownFallback(
              "Location permission denied — please select your district from the dropdown box."
            );
          } else {
            stopLocationTracking();
            showTurnOnLocationButton("Turn ON location and tap the button.");
          }
        };
      }
    } catch {}

    const now = new Date();
    calendarState.year = now.getFullYear();
    calendarState.monthIndex = now.getMonth();
    calendarState.selectedDateKey = today();
  } catch (e) {
    console.error(e);
    alert("Failed to load prayer times");
  }
}

// Download Ramadan Calendar as PDF
async function downloadRamadanCalendar() {
  try {
    // Check if district is selected
    if (!activeDistrictKey) {
      alert("Please select a district first to download the calendar.");
      return;
    }

    // Get button and add loading state
    const btn = document.getElementById("downloadCalendarBtn");
    if (btn) {
      btn.classList.add("loading");
      btn.disabled = true;
    }

    // Load database
    const db = await loadDB();
    const districtData = db[activeDistrictKey];

    if (!districtData || districtData.length === 0) {
      alert("No Ramadan calendar data available for this district.");
      if (btn) {
        btn.classList.remove("loading");
        btn.disabled = false;
      }
      return;
    }

    // Filter only Ramadan days
    const ramadanData = districtData.filter(
      (item) => item.ramadanDay != null && item.ramadanDay > 0
    );

    if (ramadanData.length === 0) {
      alert("No Ramadan calendar data available for this district.");
      if (btn) {
        btn.classList.remove("loading");
        btn.disabled = false;
      }
      return;
    }

    // Initialize jsPDF
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();

    // Set up colors
    const primaryColor = [12, 59, 46]; // #0c3b2e
    const secondaryColor = [26, 92, 72]; // #1a5c48
    const accentColor = [255, 158, 109]; // #ff9e6d

    // Add title
    doc.setFontSize(20);
    doc.setTextColor(...primaryColor);
    doc.setFont(undefined, "bold");
    doc.text("Pantonix Daily Ramadan Schedule", 105, 20, { align: "center" });

    // Add Logo and District Name (Centered)
    doc.setFontSize(14);
    doc.setTextColor(...secondaryColor);

    const districtText = `District: ${activeDistrictKey}`;
    const textWidth = doc.getTextWidth(districtText);

    // Logo dimensions
    const logoWidth = 36;
    const logoHeight = 15;
    const gap = 15;

    // Calculate centered position
    const totalContentWidth = logoWidth + gap + textWidth;
    const headerStartX = 105 - totalContentWidth / 2;

    // Draw Logo if available
    if (typeof LOGO_BASE64 !== "undefined") {
      doc.addImage(
        LOGO_BASE64,
        "JPEG",
        headerStartX,
        22,
        logoWidth,
        logoHeight
      );
    }

    // Draw Text
    doc.text(districtText, headerStartX + logoWidth + gap, 30);

    // Add line separator
    doc.setDrawColor(...accentColor);
    doc.setLineWidth(0.5);
    doc.line(20, 35, 190, 35);

    // Table headers
    const headers = ["Ramadan Day", "Date", "Sehri Ends", "Iftar Time"];

    // Prepare table data
    const tableData = ramadanData.map((item) => [
      item.ramadanDay.toString(),
      item.date || "--",
      item.sehri || "--",
      item.iftar || "--",
    ]);

    // Calculate column widths
    const pageWidth = 190;
    const startX = 20;
    const colWidths = [30, 40, 40, 40];

    // Draw table header
    let currentY = 42;
    doc.setFillColor(...primaryColor);
    doc.rect(startX, currentY, pageWidth - 20, 10, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(11);
    doc.setFont(undefined, "bold");

    let currentX = startX;
    headers.forEach((header, index) => {
      doc.text(header, currentX + colWidths[index] / 2, currentY + 7, {
        align: "center",
      });
      currentX += colWidths[index];
    });

    currentY += 10;

    // Draw table rows
    doc.setTextColor(0, 0, 0);
    doc.setFont(undefined, "normal");
    doc.setFontSize(10);

    tableData.forEach((row, rowIndex) => {
      // Check if we need a new page
      if (currentY > 280) {
        doc.addPage();
        currentY = 20;

        // Redraw header on new page
        doc.setFillColor(...primaryColor);
        doc.rect(startX, currentY, pageWidth - 20, 10, "F");
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(11);
        doc.setFont(undefined, "bold");

        currentX = startX;
        headers.forEach((header, index) => {
          doc.text(header, currentX + colWidths[index] / 2, currentY + 7, {
            align: "center",
          });
          currentX += colWidths[index];
        });

        currentY += 10;
        doc.setTextColor(0, 0, 0);
        doc.setFont(undefined, "normal");
        doc.setFontSize(10);
      }

      // Alternate row colors
      if (rowIndex % 2 === 0) {
        doc.setFillColor(248, 253, 250); // Light background
        doc.rect(startX, currentY, pageWidth - 20, 7, "F");
      }

      // Draw row data
      currentX = startX;
      row.forEach((cell, cellIndex) => {
        // Bold the Ramadan Day column
        if (cellIndex === 0) {
          doc.setFont(undefined, "bold");
          doc.setTextColor(...secondaryColor);
        } else {
          doc.setFont(undefined, "normal");
          doc.setTextColor(0, 0, 0);
        }

        doc.text(cell, currentX + colWidths[cellIndex] / 2, currentY + 5, {
          align: "center",
        });
        currentX += colWidths[cellIndex];
      });

      // Draw row border
      doc.setDrawColor(230, 230, 230);
      doc.setLineWidth(0.1);
      doc.line(startX, currentY + 7, startX + pageWidth - 20, currentY + 7);

      currentY += 7;
    });

    // Add footer
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.setFontSize(9);
      doc.setTextColor(128, 128, 128);
      doc.setFont(undefined, "normal");
      doc.text(`Powered by PANTONIX | Page ${i} of ${pageCount}`, 105, 290, {
        align: "center",
      });
    }

    // Save the PDF
    const fileName = `Ramadan_Calendar_${activeDistrictKey}_2025.pdf`;
    doc.save(fileName);

    // Remove loading state
    if (btn) {
      btn.classList.remove("loading");
      btn.disabled = false;
    }
  } catch (error) {
    console.error("Error generating PDF:", error);
    alert("Failed to generate PDF. Please try again.");

    // Remove loading state
    const btn = document.getElementById("downloadCalendarBtn");
    if (btn) {
      btn.classList.remove("loading");
      btn.disabled = false;
    }
  }
}

document.addEventListener("DOMContentLoaded", initApp);
