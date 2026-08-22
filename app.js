// Vacanze travel diary — reads markdown files from /diary at runtime (no build step).

const REPO = "hatschibratschi/vacanze";
const DIARY_PATH = "diary";
const API_URL = `https://api.github.com/repos/${REPO}/contents/${DIARY_PATH}`;

const el = {
  content: document.getElementById("content"),
  tripList: document.getElementById("tripList"),
  sidebar: document.getElementById("sidebar"),
  scrim: document.getElementById("scrim"),
  navToggle: document.getElementById("navToggle"),
  lightbox: document.getElementById("lightbox"),
  lightboxImg: document.getElementById("lightboxImg"),
  lightboxClose: document.getElementById("lightboxClose"),
};

let trips = [];              // [{ name, slug, entries: [...], tags: Set }]
let activeTripSlug = null;
let activeTags = new Set();

init();

async function init() {
  bindGlobalUI();
  try {
    const files = await listDiaryFiles();
    const entries = await Promise.all(files.map(loadEntry));
    trips = groupIntoTrips(entries.filter(Boolean));
    renderSidebar();
    handleRoute();
    window.addEventListener("hashchange", handleRoute);
  } catch (err) {
    console.error(err);
    showError(err);
  }
}

// ---------- Data loading ----------

async function listDiaryFiles() {
  const res = await fetch(API_URL, { headers: { Accept: "application/vnd.github.v3+json" } });
  if (!res.ok) throw new Error(`Could not list diary files (GitHub API returned ${res.status}).`);
  const items = await res.json();
  return items.filter((item) => item.type === "file" && item.name.toLowerCase().endsWith(".md"));
}

async function loadEntry(file) {
  const res = await fetch(file.download_url);
  if (!res.ok) return null;
  const raw = await res.text();
  const { data, body } = parseFrontMatter(raw);
  const title = extractTitle(body) || file.name.replace(/\.md$/i, "");
  const date = dateFromFilename(file.name);
  return {
    fileName: file.name,
    vacationName: (data.vacationName || "Untitled Trip").toString(),
    tags: Array.isArray(data.tags) ? data.tags : data.tags ? [data.tags] : [],
    date,
    title,
    html: marked.parse(body),
  };
}

function parseFrontMatter(raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!match) return { data: {}, body: raw };
  const [, fm, body] = match;
  const data = {};
  let currentKey = null;
  for (const line of fm.split(/\r?\n/)) {
    const listItem = line.match(/^\s*-\s+(.*)$/);
    if (listItem && currentKey) {
      const val = stripQuotes(listItem[1].trim());
      (data[currentKey] = data[currentKey] || []).push(val);
      continue;
    }
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (kv) {
      const [, key, value] = kv;
      currentKey = key;
      data[key] = value.trim() === "" ? [] : stripQuotes(value.trim());
    }
  }
  return { data, body };
}

function stripQuotes(s) {
  return s.replace(/^["']|["']$/g, "");
}

function extractTitle(body) {
  const m = body.match(/^#\s+(.+)$/m);
  return m ? m[1].trim() : null;
}

function dateFromFilename(name) {
  const m = name.match(/^(\d{4})(\d{2})(\d{2})/);
  if (!m) return null;
  return new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00`);
}

function slugify(s) {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function groupIntoTrips(entries) {
  const byName = new Map();
  for (const entry of entries) {
    if (!byName.has(entry.vacationName)) {
      byName.set(entry.vacationName, { name: entry.vacationName, slug: slugify(entry.vacationName), entries: [], tags: new Set() });
    }
    const trip = byName.get(entry.vacationName);
    trip.entries.push(entry);
    entry.tags.forEach((t) => trip.tags.add(t));
  }
  const list = Array.from(byName.values());
  for (const trip of list) {
    trip.entries.sort((a, b) => (a.date && b.date ? a.date - b.date : 0));
  }
  list.sort((a, b) => {
    const aLast = a.entries.at(-1)?.date || 0;
    const bLast = b.entries.at(-1)?.date || 0;
    return bLast - aLast;
  });
  return list;
}

// ---------- Sidebar ----------

function renderSidebar() {
  el.tripList.innerHTML = "";
  for (const trip of trips) {
    const li = document.createElement("li");
    const btn = document.createElement("button");
    btn.className = "trip-link";
    btn.dataset.slug = trip.slug;
    btn.innerHTML = `<span><span class="trip-icon">🗺️</span>${escapeHtml(trip.name)}</span><span class="trip-count">${trip.entries.length}</span>`;
    btn.addEventListener("click", () => {
      location.hash = `#/trip/${trip.slug}`;
      closeMobileNav();
    });
    li.appendChild(btn);
    el.tripList.appendChild(li);
  }
}

function markActiveTrip(slug) {
  el.tripList.querySelectorAll(".trip-link").forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.slug === slug);
  });
}

// ---------- Routing ----------

function handleRoute() {
  const hash = location.hash;
  const m = hash.match(/^#\/trip\/([^/]+)/);
  if (m) {
    activeTripSlug = m[1];
    activeTags = new Set();
    renderTrip(activeTripSlug);
  } else {
    activeTripSlug = null;
    renderHome();
  }
}

// ---------- Rendering: home ----------

function renderHome() {
  markActiveTrip(null);
  if (trips.length === 0) {
    el.content.innerHTML = `
      <div class="state-message">
        <p>No diary entries yet. Add a markdown file to the <code>diary</code> folder to get started.</p>
      </div>`;
    return;
  }

  const cards = trips
    .map((trip) => {
      const cover = firstImage(trip);
      const range = dateRange(trip);
      const style = cover ? ` style="background-image:url('${escapeAttr(cover)}')"` : "";
      return `
        <button class="trip-card" data-slug="${trip.slug}">
          <div class="thumb"${style}></div>
          <div class="body">
            <h3>${escapeHtml(trip.name)}</h3>
            <p class="meta">${trip.entries.length} ${trip.entries.length === 1 ? "entry" : "entries"}${range ? " · " + range : ""}</p>
          </div>
        </button>`;
    })
    .join("");

  el.content.innerHTML = `
    <div class="home-hero">
      <p class="eyebrow">Vacanze</p>
      <h1>Our travel diary</h1>
      <p>A running log of the trips we've taken, one day at a time — pick a trip from the sidebar or below.</p>
    </div>
    <div class="trip-cards">${cards}</div>
  `;

  el.content.querySelectorAll(".trip-card").forEach((card) => {
    card.addEventListener("click", () => {
      location.hash = `#/trip/${card.dataset.slug}`;
    });
  });
}

function firstImage(trip) {
  for (const entry of trip.entries) {
    const m = entry.html.match(/<img[^>]+src="([^"]+)"/);
    if (m) return m[1];
  }
  return null;
}

function dateRange(trip) {
  const dates = trip.entries.map((e) => e.date).filter(Boolean);
  if (dates.length === 0) return "";
  const fmt = (d) => d.toLocaleDateString(undefined, { month: "short", year: "numeric" });
  const first = fmt(dates[0]);
  const last = fmt(dates.at(-1));
  return first === last ? first : `${first} – ${last}`;
}

// ---------- Rendering: trip ----------

function renderTrip(slug) {
  const trip = trips.find((t) => t.slug === slug);
  markActiveTrip(slug);

  if (!trip) {
    el.content.innerHTML = `<div class="state-message error"><p>That trip doesn't exist.</p></div>`;
    return;
  }

  const allTags = Array.from(trip.tags).sort((a, b) => a.localeCompare(b));
  const tagChips = allTags
    .map((tag) => `<button class="tag-chip${activeTags.has(tag) ? " active" : ""}" data-tag="${escapeAttr(tag)}">${escapeHtml(tag)}</button>`)
    .join("");

  const visibleEntries = trip.entries.filter((entry) => activeTags.size === 0 || entry.tags.some((t) => activeTags.has(t)));

  const entriesHtml = visibleEntries.length
    ? visibleEntries.map(renderEntry).join("")
    : `<div class="state-message"><p>No entries match the selected tags.</p></div>`;

  el.content.innerHTML = `
    <div class="trip-hero">
      <p class="eyebrow">Trip</p>
      <h1>${escapeHtml(trip.name)}</h1>
      <p class="trip-meta">${trip.entries.length} ${trip.entries.length === 1 ? "entry" : "entries"}${dateRange(trip) ? " · " + dateRange(trip) : ""}</p>
    </div>
    ${allTags.length ? `<div class="tag-bar">${tagChips}</div>` : ""}
    <div class="entries">${entriesHtml}</div>
  `;

  el.content.querySelectorAll(".tag-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      const tag = chip.dataset.tag;
      if (activeTags.has(tag)) activeTags.delete(tag);
      else activeTags.add(tag);
      renderTrip(slug);
    });
  });

  wireImages(el.content);
}

function renderEntry(entry) {
  const dateLabel = entry.date ? entry.date.toLocaleDateString(undefined, { weekday: "long", year: "numeric", month: "long", day: "numeric" }) : "";
  const tagsHtml = entry.tags.length
    ? `<div class="entry-tags">${entry.tags.map((t) => `<span class="entry-tag">${escapeHtml(t)}</span>`).join("")}</div>`
    : "";
  return `
    <article class="entry">
      ${dateLabel ? `<p class="entry-date">${dateLabel}</p>` : ""}
      <div class="entry-body">${stripLeadingH1(entry.html, entry.title)}</div>
      ${tagsHtml}
    </article>`;
}

function stripLeadingH1(html, title) {
  const withoutH1 = html.replace(/^\s*<h1>.*?<\/h1>/i, "");
  return `<h1>${escapeHtml(title)}</h1>` + withoutH1;
}

// ---------- Images: fallback + lightbox ----------

function wireImages(root) {
  root.querySelectorAll(".entry-body img").forEach((img) => {
    img.loading = "lazy";
    img.decoding = "async";
    img.addEventListener("error", () => {
      const fallback = document.createElement("div");
      fallback.className = "img-fallback";
      fallback.innerHTML = `<span class="icon">🖼️</span><span>${escapeHtml(img.alt || "Photo unavailable")}</span>`;
      img.replaceWith(fallback);
    }, { once: true });
    img.addEventListener("click", () => openLightbox(img.src, img.alt));
  });
}

function openLightbox(src, alt) {
  el.lightboxImg.src = src;
  el.lightboxImg.alt = alt || "";
  el.lightbox.classList.add("open");
}
function closeLightbox() {
  el.lightbox.classList.remove("open");
  el.lightboxImg.src = "";
}

// ---------- Chrome / misc UI ----------

function bindGlobalUI() {
  el.navToggle.addEventListener("click", () => {
    const open = el.sidebar.classList.toggle("open");
    el.scrim.classList.toggle("open", open);
    el.navToggle.setAttribute("aria-expanded", String(open));
  });
  el.scrim.addEventListener("click", closeMobileNav);
  el.lightboxClose.addEventListener("click", closeLightbox);
  el.lightbox.addEventListener("click", (e) => {
    if (e.target === el.lightbox) closeLightbox();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeLightbox();
  });
  document.querySelector("[data-home]").addEventListener("click", (e) => {
    e.preventDefault();
    location.hash = "";
    closeMobileNav();
  });
}

function closeMobileNav() {
  el.sidebar.classList.remove("open");
  el.scrim.classList.remove("open");
  el.navToggle.setAttribute("aria-expanded", "false");
}

function showError(err) {
  el.content.innerHTML = `
    <div class="state-message error">
      <p><strong>Couldn't load the diary.</strong></p>
      <p>${escapeHtml(err.message || String(err))}</p>
    </div>`;
  el.tripList.innerHTML = "";
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
function escapeAttr(s) {
  return escapeHtml(s);
}
