# Widgetian

Glass desktop widgets for macOS. A small menu bar app that puts a clock, the weather, your batteries,
music, calendar, a to-do list, AI plan usage and service status cards on your desktop, over an
animated gradient wallpaper. Everything is set up from a settings window; nothing to install besides
the app.

Made by [guillerming.es](https://guillerming.es). Free to use.

## Install

1. Download Widgetian from [guillerming.es/projects/widgetian](https://guillerming.es/projects/widgetian):
   `Widgetian-<version>-arm64.dmg` for Apple Silicon, `Widgetian-<version>-x64.dmg` for Intel. Open it
   and drag Widgetian to Applications.
2. Open Widgetian. The settings window opens the first time; after that, find it in the menu bar
   (the icon with three cards) › **Settings…**
3. Until the app is signed and notarised by Apple, macOS blocks the first launch: open
   **System Settings › Privacy & Security**, scroll down and click **Open Anyway** next to Widgetian.

Widgetian starts at login (turn it off in **General**). It has no Dock icon.

## Widgets

| Widget | What it shows | Set up |
| --- | --- | --- |
| Clock | Time, seconds and date, in any time zone. Add several for several cities. | 12/24 h, time zone, date format |
| Weather | Now and the next days, from Open-Meteo (no account). | Automatic location or a city |
| Power | Battery rings for this Mac and connected Bluetooth devices. | — |
| Music | Plays a folder of songs: shuffle, artist lock, media keys, Now Playing. | A music folder |
| Wallpaper picker | Swatches to switch the gradient wallpaper from the desktop. | — |
| Calendar | Today's and the next days' events, the current one highlighted. | iCal addresses (Google, iCloud, Outlook…) |
| To do | A checklist you edit on the desktop. Items can carry a note to copy. | — |
| AI usage | What is left of your Claude Code and Codex plans, and whether they are working. | Claude Code statusline (below) |
| Finder | Opens your Desktop folder in a Finder window, with one click. Pairs with **General › Hide desktop icons**. | — |
| Service status | Anything about a website or service: health checks, Umami visits, your own JavaScript, in tabs. | Blocks (below) |

The **wallpaper** is drawn by Widgetian, under your desktop icons or over them to hide them: an animated mesh gradient (eight
themes inspired by classic macOS wallpapers, or your own four colours), a folder of pictures with an
optional effect, or off.

### Service status

A card is a list of **blocks**, each refreshed at its own pace. Blocks with a tab name share tabs; the
rest are always visible. The ring shows what a script says or, if none does, the worst check.

| Block | What it shows |
| --- | --- |
| Checks | One row per check (below) |
| Umami visits | 14-day chart and who is on the site now, from an [Umami](https://umami.is) share link (Cloud's free plan or self-hosted). Can be limited to some hosts. |
| Script | Whatever your own JavaScript returns |

Each **check** uses a format monitoring tools already use, so existing endpoints work as they are:

| Type | Healthy when | Typical use |
| --- | --- | --- |
| `http` | The expected status code; optionally the page contains a text and answers fast enough | Home page, `/healthz` |
| `json` | A field of a JSON body has the healthy value (`UP`, `ok`, `pass`… are understood) | Spring Boot actuator, IETF `application/health+json` |
| `statuspage` | Atlassian Statuspage `/api/v2/status.json` says all is operational | GitHub, Cloudflare, OpenAI, Anthropic, your vendors |
| `tls` | The certificate is trusted and not about to expire | Any HTTPS site |
| `tcp` | The port accepts connections | Databases, SSH, mail |
| `github` | The last GitHub Actions run (of a workflow) succeeded; a running one shows as "Deploying…" | Deploy pipelines |
| `command` | Any shell command, with [Nagios plugin](https://nagios-plugins.org/doc/guidelines.html#AEN78) exit codes: 0 OK, 1 warning, 2 failing | A backup script, a Nagios/Icinga plugin |

The first line a command prints becomes the row's detail. Any check can have a link for its row.

A **script** runs in its own Node.js process, as you, and returns what to show. Settings has a Run
button with a preview, examples to start from and the full list of what it can return:

```js
if (action === "backup") await sh("launchctl kickstart gui/$(id -u)/com.example.backup");
const backup = JSON.parse(await sh("my-backup --status --json"));

return {
  hero: { tone: backup.ok, title: "Backup up to date", detail: ago(backup.date), action: "backup", hint: "Back up now" },
  rows: [{ tone: "good", label: "Size", detail: bytes(backup.size) }],
  refresh: backup.running ? 3 : 0, // look again in 3 s while it runs
};
```

Besides `rows` there are `text`, `stats`, `progress`, `chart`, `list`, `buttons`, `tabs` and your own
`html` with `css`. Anything with a `url` opens it; anything with an `action` runs the script again with
that action. Scripts and commands come only from your `config.json`: only paste ones you trust.

### AI usage and the Claude Code statusline

Codex writes its plan limits to its own logs, so ChatGPT works on its own. Claude Code only shares
them with its statusline: **Settings › AI usage** shows the exact snippet to paste into
`~/.claude/settings.json`. It runs a tiny script with Widgetian's own binary (no Python or Node
needed), saves the two limits and prints nothing.

## Configuration

Everything lives in one file:

```
~/Library/Application Support/Widgetian/config.json
```

The settings window edits it and saves as you go. You can also edit it in any editor: Widgetian
applies changes as soon as the file is saved (an invalid file is ignored until it is fixed).
**Settings › Advanced** has a JSON editor too.

```jsonc
{
  "version": 1,
  "general": { "locale": "", "timeFormat": "24h", "openAtLogin": true, "hideDesktopIcons": false, "display": "primary" },
  "layout": { "columns": 5, "edge": 24, "gap": 12 },
  "wallpaper": { "mode": "gradient", "theme": "big-sur", "speed": 1 },
  "widgets": [
    { "id": "clock", "type": "clock", "enabled": true, "column": 1, "order": 1, "settings": { "timezone": "" } }
  ]
}
```

Each widget has a `column` (1 = left) and an `order` inside its column. Widget types and their
settings are defined in [`src/shared/catalog.js`](src/shared/catalog.js).

## Development

```bash
npm install
npm start                                  # run the app
npm test                                   # unit tests (node --test)
npx electron . --user-data=/tmp/wt         # use a separate data folder, not your own config
npx electron . --user-data=/tmp/wt --capture=/tmp/shots   # render each window to a PNG and quit
npx electron scripts/make-icons.js         # regenerate build/icon.png and the menu bar icon
npm run dist                               # build the Apple Silicon and Intel installers in dist/
```

### How it works

```
src/
  main/            Electron main process
    index.js         menu bar icon, app lifecycle
    windows.js       wallpaper + widgets windows per display, the settings window
    native.js        desktop window levels through the Objective-C runtime (koffi)
    pointer.js       makes widgets clickable and the rest of the desktop click-through
    desktop-icons.js hides the Finder's desktop icons while Widgetian runs (macOS 14+); the wallpaper
                     also covers them, as macOS shows them again when it reveals the desktop
    config-store.js  config.json: load, save atomically, follow outside edits
    ipc.js           everything pages may ask for (validated here)
    protocols.js     app:// (pages) and media:// (music, pictures): no local server
    sources/         data: power, weather, calendar, checks, umami, ai-usage, media
  preload/         the only bridge pages get (window.widgetian)
  renderer/
    widgets/         the transparent desktop window: columns, mounting widgets
    wallpaper/       the wallpaper window (Paper Shaders gradient, pictures)
    settings/        the settings window
    shared/          a tiny DOM builder and shared UI pieces
  shared/          config defaults, normalisation and the widget catalog (main + pages)
  widgets/<type>/  widget.js (mount(root, ctx)) + widget.css
```

- **Desktop windows.** Electron cannot put a window below the normal level, so `native.js` calls
  `-[NSWindow setLevel:]` through the Objective-C runtime: the wallpaper at the desktop level (under
  the icons, or just above them to hide them) and the widgets above both, on every Space. The widgets window ignores the
  mouse except while the pointer is over a widget. The main process watches the pointer for that:
  Chromium drops mouse-move events in windows that are not active, so the page cannot.
- **No framework, no build step.** Pages are ES modules served from `app://`. Widgets build DOM with
  `h()` (no `innerHTML`). Pages are sandboxed with context isolation; network, files and shell
  commands only happen in the main process.
- **A widget** exports `mount(root, ctx)` and returns a cleanup function, or `{ destroy, update }`
  to take new settings without remounting (the to-do list does this). `ctx` gives its settings,
  `ctx.api.source(name, params)` for data, `ctx.save(settings)` and `ctx.every(ms, task)`.

### Adding a widget type

1. Describe it in [`src/shared/catalog.js`](src/shared/catalog.js): defaults and fields. The settings
   form is generated from the fields.
2. Create `src/widgets/<type>/widget.js` and `widget.css`.
3. If it needs data from the Mac or the network, add a source in `src/main/sources/` and register it
   in `sources/index.js`.

## Before the first public release

- Sign and notarise with an Apple Developer ID (`mac.identity`, `hardenedRuntime`, notarisation in
  electron-builder) so macOS opens the app without the "Open Anyway" step.

The code is under the [MIT licence](LICENSE).
Third-party software: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
