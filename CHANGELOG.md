# Changelog

What changed in each version of Widgetian. The newest comes first; each release on GitHub uses its
section as release notes (`npm run release-notes`).

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
