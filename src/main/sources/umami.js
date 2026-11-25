// Umami stats through a website's public share link (works on Umami Cloud's free plan and on
// self-hosted Umami). GET /share/<id> gives websiteId + token; the website endpoints then accept
// the headers x-umami-share-token and x-umami-share-context: 1. This is what the share page itself
// does and it is not a documented API: if it changes, readUmami() throws and the chart is hidden.
import { httpFetch } from "../http.js";

const TIMEOUT_MS = 10000;
const DAYS = 14;
const SESSIONS_SHOWN = 4;
const LIVE_MS = 5 * 60 * 1000; // Umami's own "active" window
const CLOUD_APIS = ["https://gateway-eu.umami.is/api", "https://gateway-us.umami.is/api", "https://cloud.umami.is/api"];

/** Share link → { id, apis } (API bases to try, in order). */
export const parseShareUrl = (shareUrl) => {
  const url = new URL(shareUrl);
  const match = /\/share\/([^/?#]+)/.exec(url.pathname);
  if (!match) throw new Error("Not an Umami share link");
  const apis = url.hostname === "cloud.umami.is" ? CLOUD_APIS : [`${url.origin}/api`];
  return { id: match[1], apis };
};

const getJson = async (url, headers = {}) => {
  const response = await httpFetch(url, { headers, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!response.ok) throw new Error(`Umami answered ${response.status}`);
  return response.json();
};

const dayKey = (date, timeZone) => new Intl.DateTimeFormat("en-CA", { timeZone }).format(date);

/** Umami only returns days with traffic: fill the rest with zeros. */
export const fillDays = (series, firstDay, timeZone) => {
  const byDay = (points = []) => new Map(points.map((point) => [dayKey(new Date(point.x), timeZone), point.y]));
  const views = byDay(series.pageviews);
  const visitors = byDay(series.sessions);
  return Array.from({ length: DAYS }, (_, offset) => {
    const date = new Date(firstDay);
    date.setDate(firstDay.getDate() + offset);
    const key = dayKey(date, timeZone);
    return { date: key, visitors: visitors.get(key) ?? 0, views: views.get(key) ?? 0 };
  });
};

/** "a.com, b.com" → ["a.com", "b.com"] */
const hostList = (value) =>
  String(value ?? "")
    .split(/[\s,]+/)
    .filter(Boolean);

/** Umami's hostname filter: eq.a,b = only those; neq.a,b = all but those; "" = every host. */
export const hostFilter = ({ hosts, excludeHosts }) => {
  const only = hostList(hosts);
  if (only.length > 0) return `eq.${only.join(",")}`;
  const except = hostList(excludeHosts);
  return except.length > 0 ? `neq.${except.join(",")}` : "";
};

/** A view over several hosts names the host on each session; one host does not need it. */
const showsHosts = ({ hosts, excludeHosts }) => hostList(hosts).length > 1 || (hostList(hosts).length === 0 && hostList(excludeHosts).length > 0);

const shortHost = (host, suffix) => (suffix && host.endsWith(suffix) && host !== suffix ? host.slice(0, -suffix.length) : host);

/** Latest sessions from the realtime feed: where they are and for how long. */
export const latestSessions = (events = [], now = Date.now(), hostSuffix = "") => {
  const sessions = new Map();
  for (const event of events) {
    if (event.__type !== "pageview") continue;
    const at = Date.parse(event.createdAt);
    const session = sessions.get(event.sessionId) ?? { first: at, last: -Infinity, path: "/", host: "", country: null };
    const next = { ...session, first: Math.min(session.first, at) };
    const latest = { last: at, path: event.urlPath || "/", host: shortHost(event.hostname ?? "", hostSuffix), country: event.country ?? null };
    sessions.set(event.sessionId, at >= session.last ? { ...next, ...latest } : next);
  }
  return [...sessions.values()]
    .sort((a, b) => b.last - a.last)
    .slice(0, SESSIONS_SHOWN)
    .map((session) => {
      const live = now - session.last < LIVE_MS;
      return {
        path: session.path,
        host: session.host,
        country: session.country,
        seconds: Math.round(((live ? now : session.last) - session.first) / 1000),
        live,
      };
    });
};

const connect = async ({ id, apis }) => {
  let lastError = new Error("Umami did not answer");
  for (const api of apis) {
    try {
      const share = await getJson(`${api}/share/${encodeURIComponent(id)}`);
      return { api, websiteId: share.websiteId, headers: { "x-umami-share-token": share.token, "x-umami-share-context": "1" } };
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError;
};

const flag = (code) =>
  code && /^[A-Z]{2}$/.test(code) ? String.fromCodePoint(...[...code].map((letter) => 0x1f1e6 + letter.charCodeAt(0) - 65)) : "🏳️";

const duration = (seconds) => {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  return minutes < 60 ? `${minutes}m ${seconds % 60}s` : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
};

const dayLabel = (date) => new Date(`${date}T12:00:00`).toLocaleDateString("en-GB", { day: "numeric", month: "short" });

const sum = (days, key) => days.reduce((total, day) => total + day[key], 0);

/** Umami's numbers → what the card shows (see shared/status-view.js). */
export const visitsView = ({ url, days, active, sessions, showHosts }) => {
  const views = sum(days, "views");
  return {
    live: active > 0,
    chart: {
      label: "Visitors · 14 days",
      value: sum(days, "visitors"),
      detail: `${views} view${views === 1 ? "" : "s"}`,
      note: `${active} now`,
      live: active > 0,
      series: [
        { name: "Visitors", style: "area", values: days.map((day) => day.visitors) },
        { name: "Views", style: "dashed", values: days.map((day) => day.views) },
      ],
      from: dayLabel(days[0].date),
      to: "Today",
      url,
      title: "Open the stats in Umami",
    },
    list: {
      title: "Realtime · 30 min",
      empty: "Nobody in the last 30 minutes.",
      items: sessions.map((session) => ({
        icon: flag(session.country),
        label: showHosts ? session.host : "",
        text: session.path,
        detail: duration(session.seconds),
        live: session.live,
      })),
    },
  };
};

/** @param {{ shareUrl: string, hosts?: string, excludeHosts?: string, hostSuffix?: string }} params */
export const readUmami = async ({ shareUrl, hosts = "", excludeHosts = "", hostSuffix = "" }) => {
  const { api, websiteId, headers } = await connect(parseShareUrl(shareUrl));
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const firstDay = new Date();
  firstDay.setHours(0, 0, 0, 0);
  firstDay.setDate(firstDay.getDate() - (DAYS - 1));
  const site = `${api}/websites/${websiteId}`;
  const hostname = hostFilter({ hosts, excludeHosts });
  const query = (params) => new URLSearchParams({ ...params, ...(hostname ? { hostname } : {}) });
  const [series, active, realtime] = await Promise.all([
    getJson(`${site}/pageviews?${query({ startAt: String(firstDay.getTime()), endAt: String(Date.now()), unit: "day", timezone })}`, headers),
    getJson(`${site}/active?${query({})}`, headers),
    getJson(`${api}/realtime/${websiteId}?${query({ timezone })}`, headers),
  ]);
  return visitsView({
    url: shareUrl,
    days: fillDays(series, firstDay, timezone),
    active: active.visitors ?? 0,
    sessions: latestSessions(realtime.events, Date.now(), hostSuffix),
    showHosts: showsHosts({ hosts, excludeHosts }),
  });
};
