# Changelog

What changed in each version of Widgetian. The newest comes first; each release on GitHub uses its
section as release notes (`npm run release-notes`).

## 0.2.3 (unreleased)

- **AI usage: Claude's real usage.** An option, off by default, that asks Anthropic every 5 minutes for
  the numbers Claude Code's `/usage` shows, with the login Claude Code keeps in the Keychain. It works
  with Claude's desktop app, which runs no statusline. The statusline stays as the fallback.
- **AI usage: logos.** Claude and ChatGPT show their logos, and a window that has reset reads just
  "5h" or "Week" (no more "fresh").

## 0.2.2 (2026-11-27)

- **Layout: drag and drop works.** Drag a widget from "Add a widget" into a column, between
  columns, or up and down within one.
- **Wallpaper "System"** replaces "Off": macOS shows the wallpaper you chose in System Settings, untouched.
- **Gradients of your own.** Make as many as you like, name them and delete them. Any gradient, built-in
  or your own, can be hidden: it stays in Settings but the Wallpaper picker widget no longer offers it.
- **Images: transitions.** Each effect brings its own way of changing pictures: a cross-fade, rising out
  of the dark (Dim), coming into focus (Blur) or settling in from a little closer (Slow drift).
- **Images: breathing blur.** With Blur, the blur slowly deepens and eases. On by default.
- No more hidden widgets: a widget is on the desktop or deleted. Hidden ones from earlier versions are
  removed, and new users no longer get Music, AI usage and System hidden in their layout.
- About reads "By Guillerming"; the sidebar items no longer touch each other.

## 0.2.1 (2026-11-27)

- **About.** A new page at the top of Settings: who makes Widgetian, links to the code, the author's
  portfolio and X, the version you have and the update check, which moves here from General.
- **Changelog.** This file, linked from About.
- Clicking the update notification or the menu bar item now opens About.

## 0.2.0 (2026-11-27)

- **System widget.** CPU, memory and startup disk at a glance, a bar per core (efficiency and
  performance cores apart) and temperatures where your Mac reports them.
- **Updates from the app.** Once a day Widgetian asks GitHub whether there is a newer version. When
  there is, you get a notification and an item in the menu bar, and Settings offers **Install and
  restart**. The download is checked against the SHA-256 GitHub publishes for it before anything is
  replaced. The check can be turned off.
- This version has to be installed by hand once, over 0.1.0. From here on, updates install from the app.

## 0.1.0 (2026-11-25)

- First release: glass widgets on the macOS desktop (clock, weather, calendar, music, to-do and more),
  a wallpaper of your own, and a settings window to arrange them.
