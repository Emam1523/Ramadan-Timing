//Configurations
const CONFIG = {
  GPS_TIMEOUT: 6000,
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
  return `${pad2(date.getDate())}/${pad2(date.getMonth() + 1)}/${date.getFullYear()}`;
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
  districtInput: document.getElementById("districtInput"),
  districtOptions: document.getElementById("districtOptions"),

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

//Prayer Time 
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
let activeDistrictKey = null;
let districtKeyByLower = null;
let ramadanDateSet = null;
let locationWatchId = null;
let lastResolvedDistrict = null;
let calendarState = {
  year: new Date().getFullYear(),
  monthIndex: new Date().getMonth(), 
  selectedDateKey: null, 
};

async function ensureRamadanDateSet() {
  if (ramadanDateSet) return ramadanDateSet;
  const db = await loadDB();
  const keys = Object.keys(db);
  if (keys.length === 0) {
    ramadanDateSet = new Set();
    return ramadanDateSet;
  }

// Use the first district's data to extract Ramadan dates
  const firstKey = keys[0];
  const list = Array.isArray(db[firstKey]) ? db[firstKey] : [];
  ramadanDateSet = new Set(list.filter(x => x && x.date && x.ramadanDay != null).map(x => x.date));
  return ramadanDateSet;
}

//Clock
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
  setText(el.district, `${loc && loc.district ? loc.district : "Select district"}`);

  const now = new Date();
  const isMobile = window.matchMedia && window.matchMedia("(max-width: 650px)").matches;
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
    .forEach(r => r.classList.remove("current-prayer"));
}

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

function showLocationGate(
  message,
  { showButton, title, buttonText } = { showButton: true, title: null, buttonText: null }
) {
  if (!el.locationGate) el.locationGate = document.getElementById("locationGate");
  if (!el.locationGateText) el.locationGateText = document.getElementById("locationGateText");
  if (!el.locationGateTitle) el.locationGateTitle = document.querySelector(".location-gate-title");
  if (!el.turnOnLocationBtn) el.turnOnLocationBtn = document.getElementById("turnOnLocationBtn");
  if (!el.appContainer) el.appContainer = document.getElementById("appContainer");

  if (el.locationGateText) el.locationGateText.textContent = message || "Location is required.";
  if (el.locationGateTitle && title) el.locationGateTitle.textContent = title;
  if (el.turnOnLocationBtn && buttonText) el.turnOnLocationBtn.textContent = buttonText;
  if (el.turnOnLocationBtn) el.turnOnLocationBtn.hidden = !showButton;
  if (el.locationGate) el.locationGate.hidden = false;
  if (el.appContainer) el.appContainer.hidden = true;

  hideDistrictSelector();
  setLocationNotice(null);
}

function showTurnOnLocationButton(message) {
  showLocationGate(message || "Location is unavailable.", {
    showButton: true,
    title: "Turn on location",
    buttonText: "Turn on location",
  });
}

function showLocationPermissionGate(message) {
  showLocationGate(message || "Please allow location access to continue.", {
    showButton: false,
    title: "Allow location access",
  });
}

function showLocationAccessButtonGate(message) {
  showLocationGate(message || "Tap the button to allow location access.", {
    showButton: true,
    title: "Allow location access",
    buttonText: "Allow location access",
  });
}

function hideTurnOnLocationButton() {
  if (!el.locationGate) el.locationGate = document.getElementById("locationGate");
  if (!el.appContainer) el.appContainer = document.getElementById("appContainer");
  if (el.locationGate) el.locationGate.hidden = true;
  if (el.appContainer) el.appContainer.hidden = false;
}

async function getGeolocationPermissionState() {
  try {
    if (!navigator.permissions || !navigator.permissions.query) return null;
    const status = await navigator.permissions.query({ name: "geolocation" });
    return status && status.state ? status.state : null;
  } catch {
    return null;
  }
}

//GPS
function getGPS() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("GPS not supported"));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      pos => resolve(pos.coords),
      err => reject(err),
      {
        enableHighAccuracy: true,
        timeout: CONFIG.GPS_TIMEOUT,
        maximumAge: 0,
      }
    );
  });
}

//Reverse Geocoding
async function reverseGeocode(lat, lon) {
  const url =
    `https://api.bigdatacloud.net/data/reverse-geocode-client` +
    `?latitude=${lat}&longitude=${lon}&localityLanguage=en`;

  const res = await fetch(url);
  const data = await res.json();

  return {
    district: data.city || data.locality || "Unknown",
    division: data.principalSubdivision || "Unknown",
    country: data.countryName || "Unknown",
  };
}

//DB.json Loading & Prayer Time Lookup
async function loadDB() {
  if (prayerDB) return prayerDB;
  const res = await fetch("./db.json", { cache: "no-store" });
  prayerDB = await res.json();
  return prayerDB;
}

function today() {
  return formatDateDDMMYYYY(new Date());
}

async function getPrayerTimes(district) {
  const db = await loadDB();
  const keys = Object.keys(db);
  const key = keys.find(k => k.toLowerCase() === String(district).toLowerCase());
  const resolvedKey = key;
  if (!resolvedKey) return null;

  activeDistrictKey = resolvedKey;
  const list = Array.isArray(db[resolvedKey]) ? db[resolvedKey] : [];
  if (list.length === 0) return null;

  const target = today();
  const exact = list.find(d => d.date === target);
  if (exact) return exact;

  const targetDate = parseDateDDMMYYYY(target);
  if (!targetDate) return list[0];

  const withParsed = list
    .map(item => ({ item, parsed: parseDateDDMMYYYY(item.date) }))
    .filter(x => x.parsed);

  const pastOrToday = withParsed
    .filter(x => x.parsed.getTime() <= targetDate.getTime())
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
    .forEach(r => r.classList.remove("current-prayer"));

  let active = currentMinutes < times[0].minutes ? times[times.length - 1].name : times[0].name;
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

function closeMobileNav() {
  navEl.mobileNav?.classList.remove("active");
  navEl.overlay?.classList.remove("active");
}

//Calendar Modal
function openCalendar() {
  navEl.calendarModal?.classList.add("active");
  closeMobileNav();
}

function closeCalendar() {
  navEl.calendarModal?.classList.remove("active");
}

function monthLabel(year, monthIndex) {
  const d = new Date(year, monthIndex, 1);
  return d.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

async function getDistrictEntriesMap() {
  const db = await loadDB();
  if (!activeDistrictKey || !db[activeDistrictKey]) return new Map();
  const list = Array.isArray(db[activeDistrictKey]) ? db[activeDistrictKey] : [];
  const map = new Map();
  for (const item of list) {
    if (item && item.date) map.set(item.date, item);
  }
  return map;
}

async function ensureDistrictOptions() {
  if (!el.districtInput) el.districtInput = document.getElementById("districtInput");
  if (!el.districtOptions) el.districtOptions = document.getElementById("districtOptions");
  if (!el.districtOptions) return;

  const db = await loadDB();
  const keys = Object.keys(db).sort((a, b) => a.localeCompare(b));

  districtKeyByLower = new Map(keys.map(k => [k.toLowerCase(), k]));

  el.districtOptions.innerHTML = "";
  for (const k of keys) {
    const opt = document.createElement("option");
    opt.value = k;
    el.districtOptions.appendChild(opt);
  }
}

function resolveDistrictKeyFromInput(value) {
  const v = String(value || "").trim();
  if (!v) return null;
  if (!districtKeyByLower) return null;
  return districtKeyByLower.get(v.toLowerCase()) || null;
}

function showDistrictSelector(message) {
  if (!el.districtSelector) el.districtSelector = document.getElementById("district-selector");
  if (el.districtSelector) el.districtSelector.hidden = false;
  if (!el.districtInput) el.districtInput = document.getElementById("districtInput");
  if (el.districtInput) el.districtInput.value = "";
  setLocationNotice(message);
}

function hideDistrictSelector() {
  if (!el.districtSelector) el.districtSelector = document.getElementById("district-selector");
  if (el.districtSelector) el.districtSelector.hidden = true;
}

function stopLocationTracking() {
  if (locationWatchId != null && navigator.geolocation) {
    navigator.geolocation.clearWatch(locationWatchId);
  }
  locationWatchId = null;
}

async function applyDistrict(districtName) {
  const prayerData = await getPrayerTimes(districtName);
  if (!prayerData) {
    await ensureDistrictOptions();
    resetPrayerUI();
    showDistrictSelector("Your detected location isn't in our district list — please select a district.");
    return;
  }

  hideDistrictSelector();
  hideTurnOnLocationButton();
  setLocationNotice(null);
  activeDistrictKey = districtName;
  updateTopInfoUI({ district: districtName });
  renderPrayerTimes(prayerData);
  calendarState.selectedDateKey = today();

  if (navEl.calendarModal?.classList.contains("active")) {
    renderCalendar();
  }
}

async function startLocationTracking() {
  stopLocationTracking();

  if (!navigator.geolocation) {
    showTurnOnLocationButton("Location is not supported on this device/browser.");
    return;
  }

  locationWatchId = navigator.geolocation.watchPosition(
    async pos => {
      try {
        const loc = await reverseGeocode(pos.coords.latitude, pos.coords.longitude);
        const district = loc && loc.district ? loc.district : null;
        if (!district) return;

        // Avoid reloading everything if district didn't change.
        if (lastResolvedDistrict && lastResolvedDistrict.toLowerCase() === district.toLowerCase()) return;
        lastResolvedDistrict = district;

        await applyDistrict(district);
      } catch (e) {
        console.error(e);
      }
    },
    async err => {
      const code = err && typeof err === "object" ? err.code : null;

      // 1 = permission denied
      if (code === 1) {
        stopLocationTracking();
        hideTurnOnLocationButton();
        await ensureDistrictOptions();
        resetPrayerUI();
        showDistrictSelector(
          "Location permission denied — please select your location manually from the dropdown box. (To enable GPS permission again, change your browser/site location permission to Allow.)"
        );
        return;
      }

      // 2 = position unavailable (often GPS off), 3 = timeout
      if (code === 2 || code === 3) {
        resetPrayerUI();
        showTurnOnLocationButton(
          "Location is unavailable — please turn on location and tap the button to try again."
        );
        return;
      }

      resetPrayerUI();
      showTurnOnLocationButton(
        "Location is unavailable — please turn on location and tap the button to try again."
      );
    },
    {
      enableHighAccuracy: true,
      timeout: CONFIG.GPS_TIMEOUT,
      maximumAge: 3000,
    }
  );
}

function wireDistrictSelector() {
  if (!el.districtInput) el.districtInput = document.getElementById("districtInput");
  if (!el.districtInput) return;

  const tryLoad = async () => {
    const resolved = resolveDistrictKeyFromInput(el.districtInput.value);
    if (!resolved) return;

    lastResolvedDistrict = resolved;
    await applyDistrict(resolved);
  };

  el.districtInput.addEventListener("change", tryLoad);
  el.districtInput.addEventListener("keydown", e => {
    if (e.key === "Enter") {
      e.preventDefault();
      tryLoad();
    }
  });
}

async function renderCalendar() {
  if (!navEl.calendarGrid || !navEl.currentMonth) return;

  setText(navEl.currentMonth, monthLabel(calendarState.year, calendarState.monthIndex));
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
    if (entries.has(key) || (ramadanDates && ramadanDates.has(key))) cell.classList.add("ramadan-day");
    if (calendarState.selectedDateKey && key === calendarState.selectedDateKey) cell.classList.add("selected");

    cell.addEventListener("click", async () => {
      calendarState.selectedDateKey = key;
      qsa(".calendar-day.selected", navEl.calendarGrid).forEach(n => n.classList.remove("selected"));
      cell.classList.add("selected");

      const entry = entries.get(key);
      if (entry) renderPrayerTimes(entry);
    });

    navEl.calendarGrid.appendChild(cell);
  }
}

function shiftCalendarMonth(delta) {
  const d = new Date(calendarState.year, calendarState.monthIndex + delta, 1);
  calendarState.year = d.getFullYear();
  calendarState.monthIndex = d.getMonth();
  renderCalendar();
}

function wireNavigation() {
  navEl.mobileMenuBtn?.addEventListener("click", openMobileNav);
  navEl.mobileNavClose?.addEventListener("click", closeMobileNav);
  navEl.overlay?.addEventListener("click", closeMobileNav);

  qsa(".nav-link").forEach(link => {
    link.addEventListener("click", e => {
      e.preventDefault();
      const route = link.dataset.route;
      if (route === "calendar" || link.classList.contains("calendar-trigger")) {
        openCalendar();
        renderCalendar();
      } else {
        closeMobileNav();
        if (route === "home") window.scrollTo({ top: 0, behavior: "smooth" });
      }
    });
  });

  navEl.closeCalendar?.addEventListener("click", closeCalendar);
  navEl.calendarModal?.addEventListener("click", e => {
    if (e.target === navEl.calendarModal) closeCalendar();
  });

  document.addEventListener("keydown", e => {
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
  } catch {
    // ignore
  }

  if (!el.turnOnLocationBtn) el.turnOnLocationBtn = document.getElementById("turnOnLocationBtn");
  el.turnOnLocationBtn?.addEventListener("click", () => {
    // GPS OFF: user turns on location, then taps this to retry.
    // Permission prompt: this click triggers the browser permission prompt.
    showLocationPermissionGate("Requesting location access…");
    startLocationTracking();
  });

  try {
    updateTopInfoUI({ district: "Select district" });
    resetPrayerUI();

    showLocationPermissionGate("Checking location permission…");

    const permState = await getGeolocationPermissionState();
    if (permState === "denied") {
      hideTurnOnLocationButton();
      await ensureDistrictOptions();
      resetPrayerUI();
      showDistrictSelector(
        "Location permission denied — please select your location manually from the dropdown box."
      );
    } else if (permState === "granted") {
      // Permission already granted: go inside and track live location immediately.
      hideTurnOnLocationButton();
      await startLocationTracking();
    } else {

      showLocationAccessButtonGate("Allow location access to get your prayer times.");
    }

    // If the user changes location permission while the app is open, recover automatically.
    try {
      if (navigator.permissions && navigator.permissions.query) {
        const status = await navigator.permissions.query({ name: "geolocation" });
        status.onchange = async () => {
          const state = status.state;
          if (state === "granted") {
            lastResolvedDistrict = null;
            hideTurnOnLocationButton();
            await startLocationTracking();
          } else if (state === "denied") {
            stopLocationTracking();
            hideTurnOnLocationButton();
            await ensureDistrictOptions();
            resetPrayerUI();
            showDistrictSelector(
              "Location permission denied — please select your location manually from the dropdown box. (To enable GPS permission again, change your browser/site location permission to Allow.)"
            );
          } else {
            // prompt
            stopLocationTracking();
            showLocationAccessButtonGate("Allow location access to get your prayer times.");
          }
        };
      }
    } catch {
      // ignore
    }

    const now = new Date();
    calendarState.year = now.getFullYear();
    calendarState.monthIndex = now.getMonth();
    calendarState.selectedDateKey = today();
  } catch (e) {
    console.error(e);
    alert("Failed to load prayer times");
  }
}

document.addEventListener("DOMContentLoaded", initApp);
