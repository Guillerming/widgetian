# Third-party software in Widgetian

| Component | Use | Licence |
| --- | --- | --- |
| [Electron](https://www.electronjs.org/) | App runtime (Chromium + Node.js) | MIT |
| [Paper Shaders](https://shaders.paper.design) (`@paper-design/shaders` 0.0.82) | Animated gradient wallpaper. The files it needs, unmodified, with its LICENSE and NOTICE: `src/renderer/wallpaper/vendor/paper-shaders/` | Apache-2.0 |
| [ical.js](https://github.com/kewisch/ical.js) | Reading iCal calendars | MPL-2.0 (used unmodified) |
| [music-metadata](https://github.com/Borewit/music-metadata) | Reading song tags | MIT |
| [koffi](https://koffi.dev/) | Setting desktop window levels through the Objective-C runtime | MIT |
| [Bootstrap Icons](https://icons.getbootstrap.com/) 1.13 | The Claude and OpenAI logos in the AI usage widget (`src/widgets/ai/widget.js`). The logos are trademarks of Anthropic and OpenAI, shown only to name their services | MIT |

Data services used at runtime, without accounts or keys: [Open-Meteo](https://open-meteo.com/)
(forecast and city search, CC BY 4.0 data). The town name for an automatic location comes from macOS.
