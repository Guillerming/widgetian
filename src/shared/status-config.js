// The "Service status" card's settings: an ordered list of blocks, each refreshed on its own.
//   checks  rows with the result of monitoring checks (HTTP, JSON, TLS, GitHub Actions…)
//   umami   visits chart and latest sessions, from an Umami share link
//   script  the user's own JavaScript, returning whatever the card should show
// Blocks with a tab name are grouped in tabs; the rest are always visible. Pure functions.

export const BLOCK_TYPES = ["checks", "umami", "script"];

const MIN_SECONDS = { checks: 15, umami: 30, script: 5 };
const MAX_SECONDS = 24 * 60 * 60;

const BLOCK_DEFAULTS = {
  checks: { every: 60, checks: [] },
  umami: { every: 60, shareUrl: "", hosts: "", excludeHosts: "", hostSuffix: "" },
  script: { every: 60, code: "" },
};

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const text = (value) => (typeof value === "string" ? value : "");

const seconds = (value, type) => {
  const number = Math.round(Number(value));
  if (value === null || value === "" || !Number.isFinite(number)) return BLOCK_DEFAULTS[type].every;
  return Math.min(MAX_SECONDS, Math.max(MIN_SECONDS[type], number));
};

const normalizeBlock = (raw, id) => {
  const type = BLOCK_TYPES.includes(raw.type) ? raw.type : "checks";
  const defaults = BLOCK_DEFAULTS[type];
  const own = Object.fromEntries(
    Object.entries(defaults)
      .filter(([key]) => key !== "every")
      .map(([key, fallback]) => [key, Array.isArray(fallback) ? (Array.isArray(raw[key]) ? raw[key].filter(isObject) : []) : text(raw[key])]),
  );
  return { id, type, title: text(raw.title), tab: text(raw.tab), every: seconds(raw.every, type), ...own };
};

/** Settings from before blocks existed: one list of checks and one Umami link. */
const blocksFromOldSettings = ({ checks, interval, umamiShareUrl }) => {
  const blocks = [];
  if (Array.isArray(checks) && checks.length > 0) blocks.push({ id: "checks", type: "checks", every: interval ?? 60, checks });
  if (text(umamiShareUrl)) blocks.push({ id: "visits", type: "umami", shareUrl: umamiShareUrl });
  return blocks;
};

const hasOldSettings = (given) => !Array.isArray(given.blocks) && (Array.isArray(given.checks) || Boolean(given.umamiShareUrl));

const givenBlocks = (given, defaults) => {
  if (Array.isArray(given.blocks)) return given.blocks;
  return hasOldSettings(given) ? blocksFromOldSettings(given) : defaults.blocks;
};

/** Anything → complete status settings. Never throws and never mutates its input. */
export const normalizeStatusSettings = (raw, defaults) => {
  const given = isObject(raw) ? raw : {};
  const seen = new Set();
  const blocks = givenBlocks(given, defaults)
    .filter(isObject)
    .map((block, index) => {
      let id = text(block.id) || `block-${index + 1}`;
      while (seen.has(id)) id = `${id}-${index + 1}`;
      seen.add(id);
      return normalizeBlock(block, id);
    });
  return {
    name: typeof given.name === "string" ? given.name : defaults.name,
    logo: text(given.logo),
    showName: given.showName !== false,
    url: typeof given.url === "string" ? given.url : defaults.url,
    blocks,
  };
};
