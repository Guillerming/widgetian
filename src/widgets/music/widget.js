// Music: plays the songs in a folder. Shuffle, previous/next, and an artist lock that keeps the
// queue on the current artist. Media keys and macOS's Now Playing work through the Media Session API.
// The library comes from the main process (tags read once, cached); files stream as media://track/<id>.
import { h, icon, replace } from "../../renderer/shared/dom.js";
import { card, clockDuration, notice } from "../../renderer/shared/ui.js";
import { buildQueue } from "./queue.js";

const RESTART_INSTEAD_OF_PREVIOUS_S = 3;
const SAVE_EVERY_MS = 10000;
const STATE_KEY = "music/last";

const ICONS = {
  play: { d: "M8 5.2v13.6a.8.8 0 0 0 1.2.7l10.6-6.8a.8.8 0 0 0 0-1.4L9.2 4.5A.8.8 0 0 0 8 5.2Z", filled: true },
  pause: { d: "M7 5h3.2v14H7zM13.8 5H17v14h-3.2z", filled: true },
  next: { d: "M5.5 6.2v11.6L14.5 12 5.5 6.2ZM18 6v12" },
  previous: { d: "M18.5 6.2v11.6L9.5 12l9-5.8ZM6 6v12" },
  shuffle: { d: "M16 4h4v4M4 19 20 4M20 16v4h-4M14.5 14.5 20 20M4 5l5 5" },
  lock: { d: "M7.5 11V8a4.5 4.5 0 0 1 9 0v3M5.5 11h13v9.5h-13zM12 15v2" },
  unlock: { d: "M7.5 11V8a4.5 4.5 0 0 1 8.7-1.6M5.5 11h13v9.5h-13zM12 15v2" },
  note: { d: "M9 18V6l11-2v12M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm11-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" },
};

const glyph = (kind, size) => icon(ICONS[kind].d, { size, filled: Boolean(ICONS[kind].filled) });

const readState = () => {
  try {
    return JSON.parse(localStorage.getItem(STATE_KEY) ?? "null");
  } catch {
    return null;
  }
};

const writeState = (state) => {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch {
    // Not remembered: the player starts from the top next time.
  }
};

const MEDIA_ACTIONS = ["play", "pause", "nexttrack", "previoustrack"];

export function mount(root, ctx) {
  const { settings } = ctx;
  const shell = card({ eyebrow: "Music", className: "music" });
  root.append(shell.element);

  const statusCard = (message, action = null) => {
    shell.setEyebrow("Music");
    shell.setAside(glyph("note", 17));
    replace(shell.body, notice(message), action);
  };
  const chooseFolder = () => h("button", { type: "button", class: "link-button", onClick: ctx.openSettings }, "Choose a folder");
  statusCard("Reading your music…");

  const audio = new Audio();
  audio.preload = "auto";
  audio.volume = Math.min(1, Math.max(0, settings.volume / 100));

  const remembered = readState();
  let tracks = [];
  let byId = new Map();
  let queue = [];
  let position = 0;
  let shuffle = remembered?.shuffle ?? settings.shuffle;
  let lockedArtist = remembered?.lockedArtist ?? null;

  const current = () => byId.get(queue[position]) ?? null;
  const remember = () => writeState({ trackId: queue[position] ?? null, time: audio.currentTime || 0, shuffle, lockedArtist });

  // ---------- view ----------
  const queueLabel = h("span", { class: "queue" });
  const equalizer = h("span", { class: "equalizer", "aria-hidden": "true" }, h("i"), h("i"), h("i"), h("i"));
  const title = h("h1", { class: "track-title" });
  const subtitle = h("p", { class: "track-artist" });
  const bar = h("span");
  const elapsed = h("span");
  const remaining = h("span");
  const control = (kind, label, onPress) =>
    h("button", { type: "button", class: "control", "aria-label": label, title: label, onClick: onPress }, glyph(kind, 19));
  const shuffleButton = control("shuffle", "Shuffle", () => toggleShuffle());
  const lockButton = control("unlock", "Lock artist", () => toggleLock());
  const playButton = h("button", { type: "button", class: "control primary", "aria-label": "Play", onClick: () => togglePlay() });
  const seek = (event) => {
    if (!audio.duration) return;
    const box = event.currentTarget.getBoundingClientRect();
    audio.currentTime = ((event.clientX - box.left) / box.width) * audio.duration;
  };
  const player = [
    h("div", { class: "track" }, equalizer, h("div", { class: "track-text" }, title, subtitle)),
    h("div", { class: "progress" }, h("div", { class: "progress-track", title: "Seek", onClick: seek }, bar), h("div", { class: "times" }, elapsed, remaining)),
    h(
      "footer",
      { class: "controls" },
      shuffleButton,
      control("previous", "Previous", () => previous()),
      playButton,
      control("next", "Next", () => next()),
      lockButton,
    ),
  ];

  const renderTrack = () => {
    const track = current();
    if (!track) return;
    title.textContent = track.title;
    title.title = track.title;
    const sub = [track.artist, track.album].filter(Boolean).join(" · ");
    subtitle.textContent = sub;
    subtitle.title = sub;
    const counter = `${position + 1} / ${queue.length}`;
    const locked = lockedArtist !== null;
    queueLabel.replaceChildren(locked ? glyph("lock", 11) : "", locked ? `${lockedArtist || "No artist"} · ${counter}` : counter);
    queueLabel.toggleAttribute("data-locked", locked);
    if ("mediaSession" in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({ title: track.title, artist: track.artist, album: track.album });
    }
  };

  const renderPlayback = () => {
    const playing = !audio.paused;
    shell.setEyebrow(playing ? "Now playing" : "Paused");
    equalizer.toggleAttribute("data-playing", playing);
    replace(playButton, glyph(playing ? "pause" : "play", 24));
    playButton.setAttribute("aria-label", playing ? "Pause" : "Play");
    shuffleButton.setAttribute("aria-pressed", String(shuffle));
    lockButton.setAttribute("aria-pressed", String(lockedArtist !== null));
    lockButton.setAttribute("aria-label", lockedArtist !== null ? "Artist locked" : "Lock artist");
    replace(lockButton, glyph(lockedArtist !== null ? "lock" : "unlock", 19));
    if ("mediaSession" in navigator) navigator.mediaSession.playbackState = playing ? "playing" : "paused";
  };

  const renderTime = () => {
    const duration = audio.duration || current()?.duration || 0;
    bar.style.transform = `scaleX(${duration > 0 ? Math.min(1, audio.currentTime / duration) : 0})`;
    elapsed.textContent = clockDuration(audio.currentTime);
    remaining.textContent = `-${clockDuration(duration - audio.currentTime)}`;
  };

  // ---------- playback ----------
  const load = (index, { autoplay, time = 0 } = {}) => {
    if (queue.length === 0) return;
    position = (index + queue.length) % queue.length;
    audio.src = `media://track/${queue[position]}`;
    audio.currentTime = time;
    renderTrack();
    renderTime();
    if (autoplay) audio.play().catch(renderPlayback);
    remember();
  };

  const togglePlay = () => (audio.paused ? audio.play().catch(renderPlayback) : audio.pause());
  const next = () => load(position + 1, { autoplay: !audio.paused || audio.ended });
  const previous = () => {
    if (audio.currentTime > RESTART_INSTEAD_OF_PREVIOUS_S) {
      audio.currentTime = 0;
      return;
    }
    load(position - 1, { autoplay: !audio.paused });
  };

  const rebuildQueue = () => {
    const currentId = queue[position] ?? null;
    queue = buildQueue(tracks, { shuffle, artist: lockedArtist, currentId });
    position = Math.max(0, queue.indexOf(currentId));
    renderTrack();
    renderPlayback();
    remember();
  };
  const toggleShuffle = () => {
    shuffle = !shuffle;
    rebuildQueue();
  };
  const toggleLock = () => {
    lockedArtist = lockedArtist === null ? (current()?.artist ?? "") : null;
    rebuildQueue();
  };

  audio.addEventListener("play", renderPlayback);
  audio.addEventListener("pause", () => {
    renderPlayback();
    remember();
  });
  audio.addEventListener("timeupdate", renderTime);
  audio.addEventListener("ended", () => load(position + 1, { autoplay: true }));
  audio.addEventListener("error", () => {
    // An unreadable file: skip it rather than stall.
    if (queue.length > 1 && audio.src) setTimeout(() => load(position + 1, { autoplay: true }), 500);
  });

  if ("mediaSession" in navigator) {
    navigator.mediaSession.setActionHandler("play", () => audio.play());
    navigator.mediaSession.setActionHandler("pause", () => audio.pause());
    navigator.mediaSession.setActionHandler("nexttrack", next);
    navigator.mediaSession.setActionHandler("previoustrack", previous);
  }
  const saveTimer = setInterval(() => {
    if (!audio.paused) remember();
  }, SAVE_EVERY_MS);

  // ---------- library ----------
  const start = (library) => {
    if (library.error) return statusCard(library.error, chooseFolder());
    if (library.tracks.length === 0) return statusCard("No songs in that folder.", chooseFolder());
    tracks = library.tracks;
    byId = new Map(tracks.map((track) => [track.id, track]));
    if (lockedArtist !== null && !tracks.some((track) => track.artist === lockedArtist)) lockedArtist = null;
    const startId = remembered?.trackId && byId.has(remembered.trackId) ? remembered.trackId : null;
    queue = buildQueue(tracks, { shuffle, artist: lockedArtist, currentId: startId });
    shell.setAside(queueLabel);
    replace(shell.body, ...player);
    load(0, { autoplay: false, time: startId ? remembered.time : 0 });
    renderPlayback();
    return undefined;
  };

  if (settings.source === "folder") {
    ctx.api
      .source("music", { widgetId: ctx.id })
      .then(start)
      .catch(() => statusCard("Couldn't read the music folder.", chooseFolder()));
  } else {
    statusCard("This source is coming soon. Choose a folder for now.", chooseFolder());
  }

  return () => {
    remember();
    clearInterval(saveTimer);
    audio.pause();
    audio.removeAttribute("src");
    audio.load();
    if ("mediaSession" in navigator) for (const action of MEDIA_ACTIONS) navigator.mediaSession.setActionHandler(action, null);
  };
}
