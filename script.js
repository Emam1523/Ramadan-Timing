//Configurations
const CONFIG = {
  GPS_TIMEOUT: 10000,
  CACHE_HOURS: 1,
  DEFAULT_LOCATION: {
    district: "Dhaka",
    division: "Dhaka",
    country: "Bangladesh",
  },
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
  locationLine: document.getElementById("current-location"),

  locationNotice: document.getElementById("location-notice"),

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

/* Prayer table */
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
let activeDistrictKey = CONFIG.DEFAULT_LOCATION.district;
let calendarState = {
  year: new Date().getFullYear(),
  monthIndex: new Date().getMonth(), // 0-based
  selectedDateKey: null, // DD/MM/YYYY
};

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
  });
}

//Update Top Info UI
function updateTopInfoUI(loc) {
  if (!el.district) el.district = getDistrictElement();
  setText(el.district, `District: ${loc.district}`);
  const date = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  setText(el.locationLine, `${loc.division}, ${loc.country} • ${date}`);
}

//Cache
function getCache() {
  try {
    const c = JSON.parse(localStorage.getItem("locationCache"));
    if (!c) return null;
    const hours = (Date.now() - c.time) / 36e5;
    return hours < CONFIG.CACHE_HOURS ? c : null;
  } catch {
    return null;
  }
}

function setCache(data) {
  const payload = data && typeof data === "object" ? data : {};
  localStorage.setItem("locationCache", JSON.stringify({ ...payload, time: Date.now() }));
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

  if (message) {
    node.textContent = message;
    node.hidden = false;
  } else {
    node.textContent = "";
    node.hidden = true;
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
  const resolvedKey = key || keys.find(k => k.toLowerCase() === CONFIG.DEFAULT_LOCATION.district.toLowerCase());
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
  const list = Array.isArray(db[activeDistrictKey]) ? db[activeDistrictKey] : [];
  const map = new Map();
  for (const item of list) {
    if (item && item.date) map.set(item.date, item);
  }
  return map;
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

  for (let day = 1; day <= last.getDate(); day++) {
    const d = new Date(calendarState.year, calendarState.monthIndex, day);
    const key = formatDateDDMMYYYY(d);

    const cell = document.createElement("div");
    cell.className = "calendar-day";
    cell.textContent = String(day);
    cell.dataset.dateKey = key;

    if (key === todayKey) cell.classList.add("today");
    if (entries.has(key)) cell.classList.add("ramadan-day");
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

//Location Resolution if needed(Dhaka Default)
async function resolveLocation() {
  try {
    const coords = await getGPS(); 
    const loc = await reverseGeocode(coords.latitude, coords.longitude);
    return { ...loc, source: "gps" };
  } catch (err) {
    const enriched = { ...CONFIG.DEFAULT_LOCATION, source: "default" };
    enriched._defaultReason =
      err && typeof err === "object" && err.code === 1
        ? "permission-denied"
        : "unavailable";
    return enriched;
  }
}


//App Initialization
async function initApp() {
  startClock();
  wireNavigation();

  try {
    const location = await resolveLocation();
    updateTopInfoUI(location);

    if (location && location.source === "default") {
      const msg =
        location._defaultReason === "permission-denied"
          ? "Location permission is denied — showing Dhaka as default location. Allow location for accurate times."
          : "Could not access your location — showing Dhaka as default location.";
      setLocationNotice(msg);
    } else {
      setLocationNotice(null);
    }

    const prayerData = await getPrayerTimes(location.district);
    renderPrayerTimes(prayerData);

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
