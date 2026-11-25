// What a block of a "Service status" card shows, as plain data. Built-in blocks and the user's own
// scripts return a loose object; normalizeView() turns it into a safe, complete one:
//   { hero, sections, live, refresh }
// The keys of the object are the sections, shown in the order they are written:
//   text, stats, progress, rows, chart, list, buttons, html (with css), tabs
// An array of such objects is the same thing, one after the other. Pure functions.

const MAX_ITEMS = 40;
const MAX_VALUES = 400;
const MAX_TEXT = 4000;
const MAX_HTML = 100000;
const MAX_DEPTH = 3;
const MIN_REFRESH_S = 2;

const TONES = {
  good: "good", ok: "good", up: "good", success: "good",
  wait: "wait", warn: "wait", warning: "wait", running: "wait",
  bad: "bad", error: "bad", fail: "bad", failed: "bad", down: "bad",
};
const TONE_RANK = { none: 0, good: 1, wait: 2, bad: 3 };

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);

const text = (value, max = 300) => {
  if (value === null || value === undefined || typeof value === "object" || typeof value === "function") return "";
  return String(value).slice(0, max);
};

const toneOf = (value) => (value === true ? "good" : value === false ? "bad" : (TONES[String(value ?? "").toLowerCase()] ?? "none"));

const number = (value, fallback = 0) => (Number.isFinite(Number(value)) && value !== null && value !== "" ? Number(value) : fallback);

const fraction = (value) => (value === null || value === undefined || !Number.isFinite(Number(value)) ? null : Math.min(1, Math.max(0, Number(value))));

const webUrl = (value) => {
  try {
    return ["http:", "https:"].includes(new URL(value).protocol) ? String(value) : "";
  } catch {
    return "";
  }
};

/** What a click does: open a web page, or run the script again with that action. */
const clickOf = (raw) => ({ url: webUrl(raw.url), action: text(raw.action, 100), title: text(raw.title) });

const list = (value) => (Array.isArray(value) ? value : value === null || value === undefined ? [] : [value]).slice(0, MAX_ITEMS);

const objects = (value) => list(value).filter(isObject);

const row = (raw) => ({ tone: toneOf(raw.tone), label: text(raw.label), detail: text(raw.detail), running: raw.running === true, ...clickOf(raw) });

const series = (raw) => {
  const given = Array.isArray(raw) ? { values: raw } : raw;
  const values = (Array.isArray(given.values) ? given.values : []).slice(-MAX_VALUES).map((value) => Math.max(0, number(value)));
  return { name: text(given.name), style: ["area", "line", "dashed"].includes(given.style) ? given.style : "area", values };
};

const chartSeries = (raw) => {
  if (Array.isArray(raw.series)) return raw.series.slice(0, 6).filter((entry) => Array.isArray(entry) || isObject(entry)).map(series);
  return [series({ values: raw.values })];
};

const BUILDERS = {
  text: (value) => list(value).map((entry) => ({ kind: "text", text: text(entry, MAX_TEXT) })).filter((section) => section.text),
  stats: (value) => [
    { kind: "stats", items: objects(value).map((raw) => ({ label: text(raw.label), value: text(raw.value), detail: text(raw.detail), tone: toneOf(raw.tone) })) },
  ],
  progress: (value) => objects(value).map((raw) => ({ kind: "progress", label: text(raw.label), value: fraction(raw.value) ?? 0, detail: text(raw.detail), tone: toneOf(raw.tone) })),
  rows: (value) => [{ kind: "rows", items: objects(value).map(row) }],
  chart: (value) =>
    objects(value)
      .map((raw) => ({
        kind: "chart",
        label: text(raw.label),
        value: text(raw.value),
        detail: text(raw.detail),
        note: text(raw.note),
        live: raw.live === true,
        from: text(raw.from),
        to: text(raw.to),
        series: chartSeries(raw).filter((entry) => entry.values.length > 1),
        ...clickOf(raw),
      }))
      .filter((section) => section.series.length > 0),
  list: (value) =>
    (Array.isArray(value) ? [{ items: value }] : objects(value)).map((raw) => ({
      kind: "list",
      title: text(raw.title),
      empty: text(raw.empty),
      items: list(raw.items)
        .map((item) => (isObject(item) ? item : { text: item }))
        .map((item) => ({ icon: text(item.icon, 8), label: text(item.label), text: text(item.text), detail: text(item.detail), live: item.live === true, ...clickOf(item) })),
    })),
  buttons: (value) => [{ kind: "buttons", items: objects(value).map((raw) => ({ label: text(raw.label) || "Run", ...clickOf(raw) })) }],
  html: (value, raw) => [{ kind: "html", html: text(value, MAX_HTML), css: text(raw.css, MAX_HTML) }],
  tabs: (value, _raw, depth) => [
    {
      kind: "tabs",
      items: objects(value).map((raw, index) => ({
        name: text(raw.name, 60) || `Tab ${index + 1}`,
        live: raw.live === true,
        sections: depth < MAX_DEPTH ? sectionsOf(raw, depth + 1) : [],
      })),
    },
  ],
};

const isShown = (section) => !Array.isArray(section.items) || section.items.length > 0 || Boolean(section.empty);

function sectionsOf(raw, depth = 0) {
  if (Array.isArray(raw)) return depth < MAX_DEPTH ? raw.slice(0, MAX_ITEMS).flatMap((entry) => sectionsOf(entry, depth + 1)) : [];
  if (!isObject(raw)) return BUILDERS.text(raw);
  return Object.entries(raw)
    .flatMap(([key, value]) => (Object.hasOwn(BUILDERS, key) && value !== null && value !== undefined ? BUILDERS[key](value, raw, depth) : []))
    .filter(isShown);
}

const heroOf = (raw) => {
  if (!isObject(raw?.hero)) return null;
  const { hero } = raw;
  return {
    tone: toneOf(hero.tone),
    title: text(hero.title),
    detail: text(hero.detail),
    progress: fraction(hero.progress),
    running: hero.running === true,
    hint: text(hero.hint),
    url: webUrl(hero.url),
    action: text(hero.action, 100),
  };
};

/** Anything a block returned → a complete view. Never throws. */
export const normalizeView = (raw) => {
  const parts = Array.isArray(raw) ? raw : [raw];
  const refresh = parts.map((part) => (isObject(part) ? number(part.refresh) : 0)).find((value) => value > 0) ?? 0;
  return {
    hero: parts.map(heroOf).find(Boolean) ?? null,
    sections: sectionsOf(raw),
    live: parts.some((part) => isObject(part) && part.live === true),
    refresh: refresh > 0 ? Math.max(MIN_REFRESH_S, refresh) : 0,
  };
};

const rowsIn = (sections) =>
  sections.flatMap((section) => {
    if (section.kind === "rows") return section.items;
    return section.kind === "tabs" ? section.items.flatMap((tab) => rowsIn(tab.sections)) : [];
  });

/**
 * The ring of the card: a block's own hero if one gives it, otherwise the worst row of all of them.
 * null when there is nothing to judge (a card with only visits, say).
 */
export const cardHero = (views) => {
  const own = views.map((view) => view.hero).find(Boolean);
  if (own) return own;
  const rows = views.flatMap((view) => rowsIn(view.sections)).filter((entry) => entry.tone !== "none");
  if (rows.length === 0) return null;
  const worst = rows.reduce((current, entry) => (TONE_RANK[entry.tone] > TONE_RANK[current.tone] ? entry : current));
  const base = { detail: "", progress: null, running: worst.running, hint: "", url: "", action: "" };
  if (worst.tone === "good") return { ...base, tone: "good", title: "All systems OK", running: false };
  if (worst.running) return { ...base, tone: "wait", title: `${worst.label || "Working"}…` };
  return { ...base, tone: worst.tone, title: worst.tone === "bad" ? `${worst.label} failing` : `${worst.label} needs a look` };
};
