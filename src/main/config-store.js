// config.json on disk: load, save atomically, and follow edits made by hand in any editor.
import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";
import { app } from "electron";
import { defaultConfig, normalizeConfig } from "../shared/config.js";

const FILE_NAME = "config.json";
const WATCH_DEBOUNCE_MS = 250;

const serialize = (config) => `${JSON.stringify(config, null, 2)}\n`;

export class ConfigStore extends EventEmitter {
  constructor(directory = app.getPath("userData")) {
    super();
    this.directory = directory;
    this.file = path.join(directory, FILE_NAME);
    this.current = defaultConfig();
    this.lastWritten = "";
    this.watcher = null;
    this.isFirstRun = false;
  }

  /** Reads config.json, creating it with the defaults the first time. A broken file is set aside. */
  load() {
    fs.mkdirSync(this.directory, { recursive: true });
    if (!fs.existsSync(this.file)) {
      this.isFirstRun = true;
      this.write(defaultConfig());
      return this.current;
    }
    const text = fs.readFileSync(this.file, "utf8");
    try {
      this.current = normalizeConfig(JSON.parse(text));
      this.lastWritten = text;
    } catch (error) {
      const aside = path.join(this.directory, `config.broken-${Date.now()}.json`);
      fs.renameSync(this.file, aside);
      console.error(`config.json is not valid JSON (${error.message}); moved to ${aside}`);
      this.write(defaultConfig());
    }
    return this.current;
  }

  get() {
    return this.current;
  }

  /** Normalises, writes and announces a new config. Returns what was saved. */
  save(next) {
    this.write(normalizeConfig(next));
    this.emit("change", this.current);
    return this.current;
  }

  /** save(update(current)) */
  update(update) {
    return this.save(update(this.current));
  }

  write(config) {
    const text = serialize(config);
    const temporary = `${this.file}.tmp`;
    fs.writeFileSync(temporary, text, { mode: 0o600 });
    fs.renameSync(temporary, this.file);
    this.lastWritten = text;
    this.current = config;
  }

  /** Applies edits other programs make to config.json. Invalid JSON is reported and ignored. */
  watch() {
    let timer = null;
    this.watcher = fs.watch(this.directory, (_event, name) => {
      if (name !== FILE_NAME) return;
      clearTimeout(timer);
      timer = setTimeout(() => this.reloadFromDisk(), WATCH_DEBOUNCE_MS);
    });
  }

  reloadFromDisk() {
    let text;
    try {
      text = fs.readFileSync(this.file, "utf8");
    } catch {
      return; // mid-rename or deleted: the next event brings it back
    }
    if (text === this.lastWritten) return;
    try {
      const parsed = JSON.parse(text);
      this.lastWritten = text;
      this.current = normalizeConfig(parsed);
      this.emit("change", this.current);
    } catch (error) {
      this.emit("invalid", error.message);
    }
  }

  close() {
    this.watcher?.close();
  }
}
