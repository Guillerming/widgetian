// Service status: one card per service. A ring with the overall state, then its blocks (checks,
// Umami visits, the user's own scripts), each refreshed on its own; blocks with a tab name share tabs.
import { cardHero } from "../../shared/status-view.js";
import { h, icon, replace } from "../../renderer/shared/dom.js";
import { ICONS, card, notice, openLink, toneIcon } from "../../renderer/shared/ui.js";
import { drawSections, tabStrip } from "./view.js";

const isWebUrl = (value) => /^https?:\/\//i.test(value ?? "");
const isFile = (value) => /^[~/]/.test(value ?? "");

const initialsOf = (name) =>
  String(name || "?")
    .split(/[\s.-]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((word) => word[0].toUpperCase())
    .join("");

const logoImage = (src, settings) => h("img", { class: "logo", src, alt: settings.showName ? "" : settings.name });

const logoOf = (settings, ctx) => {
  const logo = settings.logo.trim();
  if (isWebUrl(logo)) return logoImage(logo, settings);
  const badge = h("span", { class: "logo logo-text", "aria-hidden": "true" }, isFile(logo) || !logo ? initialsOf(settings.name) : logo);
  if (isFile(logo)) {
    ctx.api
      .source("logo", { widgetId: ctx.id })
      .then(({ url }) => badge.replaceWith(logoImage(url, settings)))
      .catch(() => {}); // the initials stay
  }
  return badge;
};

const FULL = 100;

const ringArc = (hero) => {
  if (hero.running) return 75;
  return hero.progress === null ? 0 : FULL - hero.progress * FULL;
};

const statusRing = (hero, settings, handlers) => {
  const url = hero.url || (isWebUrl(settings.url) ? settings.url : "");
  const click = hero.action ? () => handlers.run(hero.action) : () => openLink(url);
  return h(
    "button",
    {
      type: "button",
      class: "status-ring",
      dataset: { tone: hero.tone, ...(hero.running ? { running: "true" } : {}) },
      title: hero.hint || (hero.action ? null : url),
      disabled: hero.running || !(hero.action || url),
      onClick: click,
    },
    h(
      "svg",
      { viewBox: "0 0 80 80", "aria-hidden": "true" },
      h("circle", { class: "ring-track", cx: 40, cy: 40, r: 36 }),
      h("circle", { class: "ring-arc", cx: 40, cy: 40, r: 36, pathLength: FULL, "stroke-dasharray": FULL, "stroke-dashoffset": ringArc(hero) }),
    ),
    h("span", { class: "ring-state" }, toneIcon(hero.tone, 24)),
    h("span", { class: "ring-action" }, icon(hero.action ? ICONS.refresh : ICONS.external, { size: 22, stroke: 2 })),
  );
};

/** Consecutive runs of blocks: the ones without a tab, and the tabbed ones gathered where the first is. */
const arrange = (blocks) => {
  const tabbed = blocks.filter((block) => block.tab);
  const names = [...new Set(tabbed.map((block) => block.tab))];
  return blocks.flatMap((block) => {
    if (!block.tab) return [{ kind: "block", block }];
    if (block !== tabbed[0]) return [];
    return [{ kind: "tabs", tabs: names.map((name) => ({ name, blocks: tabbed.filter((entry) => entry.tab === name) })) }];
  });
};

export function mount(root, ctx) {
  const { settings } = ctx;
  const time = new Intl.DateTimeFormat(ctx.locale ?? "en-GB", { hour: "2-digit", minute: "2-digit", hour12: ctx.hour12() });
  const shell = card({ className: "status" });
  const brand = h("header", { class: "brand" }, logoOf(settings, ctx), settings.showName ? h("span", { class: "brand-name" }, settings.name || "Service") : null);
  const heroArea = h("div", { class: "hero-area" });
  const bodyArea = h("div", { class: "blocks" });
  shell.body.append(brand, heroArea, bodyArea);
  root.append(shell.element);

  /** block id → its last answer; tab memory; what is drawn, to skip redraws that change nothing. */
  const answers = new Map();
  const openTabs = new Map();
  const refreshTimers = new Map();
  let drawn = "";
  let stopped = false;

  const cadence = () => {
    const every = Math.min(...settings.blocks.map((block) => block.every));
    return every >= 120 ? `every ${Math.round(every / 60)} min` : `every ${every} s`;
  };

  const drawHero = () => {
    // In the order of the blocks, not of the answers.
    const known = settings.blocks.filter((block) => answers.has(block.id));
    const hero = cardHero(known.map((block) => answers.get(block.id).view));
    if (!hero) return replace(heroArea);
    const owner = known.find((block) => answers.get(block.id).view.hero === hero);
    const latest = known.map((block) => answers.get(block.id).checkedAt).sort().at(-1);
    const detail = hero.detail || `Checked ${time.format(new Date(latest))} · ${cadence()}`;
    return replace(
      heroArea,
      h(
        "div",
        { class: "hero", dataset: { tone: hero.tone } },
        statusRing(hero, settings, { run: (action) => act(owner, action) }),
        h("div", { class: "hero-text" }, h("h2", {}, hero.title), h("p", { title: detail }, detail)),
      ),
    );
  };

  const drawBlock = (block) => {
    const answer = answers.get(block.id);
    const handlers = { open: openLink, run: (action) => act(block, action) };
    const sections = answer ? drawSections(answer.view.sections, handlers, openTabs, block.id) : [notice("Checking…")];
    // A block that only gives the ring its state takes no room.
    if (sections.length === 0) return null;
    // Blocks that are only rows read as one list.
    const onlyRows = !block.title && (answer?.view.sections.every((section) => section.kind === "rows") ?? false);
    return h("section", { class: `block${onlyRows ? " only-rows" : ""}`, "aria-label": block.title || null }, block.title ? h("h3", { class: "block-title" }, block.title) : null, sections);
  };

  const drawPart = (part) => {
    if (part.kind === "block") return drawBlock(part.block);
    const isLive = (tab) => tab.blocks.some((block) => answers.get(block.id)?.view.live);
    const items = part.tabs.map((tab) => ({ name: tab.name, live: isLive(tab), content: () => tab.blocks.map(drawBlock) }));
    return h("div", { class: "block" }, tabStrip(items, openTabs, "blocks"));
  };

  const draw = () => {
    if (stopped) return;
    drawHero();
    const next = JSON.stringify(settings.blocks.map((block) => answers.get(block.id)?.view ?? null));
    if (next === drawn) return;
    drawn = next;
    replace(bodyArea, arrange(settings.blocks).map(drawPart));
  };

  const take = (block, answer) => {
    answers.set(block.id, answer);
    draw();
    clearTimeout(refreshTimers.get(block.id));
    // A running job asks to be looked at sooner than the block's own interval.
    if (answer.view.refresh > 0 && !stopped) {
      refreshTimers.set(block.id, setTimeout(() => read(block, { fresh: true }), answer.view.refresh * 1000));
    }
  };

  const failed = (block, error) =>
    take(block, {
      checkedAt: new Date().toISOString(),
      view: { hero: null, live: false, refresh: 0, sections: [{ kind: "text", text: `Couldn't refresh: ${error.message}` }] },
    });

  function read(block, options) {
    return ctx.api
      .source("status-block", { widgetId: ctx.id, blockId: block.id }, options)
      .then((answer) => take(block, answer))
      .catch((error) => failed(block, error));
  }

  function act(block, action) {
    shell.element.dataset.busy = "true";
    return ctx.api.status
      .action(ctx.id, block.id, action)
      .then((answer) => take(block, answer))
      .catch((error) => failed(block, error))
      .finally(() => delete shell.element.dataset.busy);
  }

  if (settings.blocks.length === 0) {
    const add = h("button", { type: "button", class: "link-button", onClick: ctx.openSettings }, "Add a block");
    replace(bodyArea, notice("Nothing to show yet."), add);
  }
  for (const block of settings.blocks) ctx.every(block.every * 1000, () => read(block));
  if (settings.blocks.length > 0) draw();

  return () => {
    stopped = true;
    for (const timer of refreshTimers.values()) clearTimeout(timer);
  };
}
