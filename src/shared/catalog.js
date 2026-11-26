// Every widget type Widgetian knows: its default settings and the fields the settings window shows.
// Pure data, imported by the main process (defaults, validation) and by the settings window (forms).
//
// Field types: text, textarea, code, number, boolean, select, timezone, folder, image, location, color, list.
// A `list` holds objects described by `itemFields`; an item field with `when` only applies to
// items whose fields match it (e.g. a check's options depend on its `type`).

const TIME_FORMAT = {
  key: "timeFormat",
  label: "Time format",
  type: "select",
  options: [
    { value: "inherit", label: "Same as General" },
    { value: "24h", label: "24-hour" },
    { value: "12h", label: "12-hour" },
  ],
};

export const CHECK_TYPES = [
  { value: "http", label: "Web page (HTTP status, text, speed)" },
  { value: "json", label: "JSON health endpoint" },
  { value: "statuspage", label: "Status page (Atlassian Statuspage)" },
  { value: "tls", label: "TLS certificate expiry" },
  { value: "tcp", label: "TCP port open" },
  { value: "github", label: "GitHub Actions last run" },
  { value: "command", label: "Shell command (Nagios exit codes)" },
];

const when = (...types) => ({ type: types });

const CHECK_FIELDS = [
  { key: "type", label: "Type", type: "select", options: CHECK_TYPES },
  { key: "label", label: "Label", type: "text" },
  { key: "url", label: "URL", type: "text", when: when("http", "json", "statuspage") },
  { key: "expectStatus", label: "Expected HTTP status", type: "number", min: 100, max: 599, when: when("http", "json") },
  { key: "contains", label: "Page must contain", type: "text", when: when("http"), help: "Optional text that proves it is the right page." },
  { key: "maxMs", label: "Slow above (ms)", type: "number", min: 0, max: 60000, when: when("http", "json"), help: "Optional. Slower answers show as a warning." },
  { key: "path", label: "JSON field", type: "text", placeholder: "status", when: when("json"), help: "Dot path, e.g. status or checks.db.status." },
  { key: "equals", label: "Healthy value", type: "text", placeholder: "UP, ok, pass…", when: when("json") },
  { key: "host", label: "Host", type: "text", placeholder: "example.com", when: when("tls", "tcp") },
  { key: "port", label: "Port", type: "number", min: 1, max: 65535, when: when("tls", "tcp") },
  { key: "warnDays", label: "Warn this many days before expiry", type: "number", min: 1, max: 90, when: when("tls") },
  { key: "repo", label: "Repository", type: "text", placeholder: "owner/name", when: when("github") },
  { key: "workflow", label: "Workflow file", type: "text", placeholder: "deploy.yml (empty = any)", when: when("github") },
  { key: "token", label: "Token (private repos)", type: "text", secret: true, when: when("github"), help: "Fine-grained token with Actions: read. Stored in plain text in config.json." },
  { key: "command", label: "Command", type: "textarea", placeholder: "curl -fsS https://example.com/healthz", when: when("command"), help: "Runs with your shell. Exit 0 = OK, 1 = warning, 2+ = failing. The first line it prints is shown." },
  { key: "link", label: "Link", type: "text", placeholder: "https://example.com/logs", help: "Optional. Opened when you click the row." },
];

export const CATALOG = {
  clock: {
    name: "Clock",
    description: "Time and date, in this Mac's time zone or any other.",
    multiple: true,
    defaults: {
      label: "",
      timezone: "",
      timeFormat: "inherit",
      showSeconds: true,
      showDate: true,
      dateStyle: "long",
    },
    fields: [
      { key: "label", label: "Label", type: "text", placeholder: "e.g. London", help: "Shown above the time. Empty = none." },
      { key: "timezone", label: "Time zone", type: "timezone", help: "Empty = this Mac's time zone." },
      TIME_FORMAT,
      { key: "showSeconds", label: "Show seconds", type: "boolean" },
      { key: "showDate", label: "Show the date", type: "boolean" },
      {
        key: "dateStyle",
        label: "Date format",
        type: "select",
        options: [
          { value: "long", label: "Sunday 22 November" },
          { value: "medium", label: "Sun, 22 Nov 2026" },
          { value: "short", label: "22/11/2026" },
          { value: "iso", label: "2026-11-22" },
        ],
      },
    ],
  },

  weather: {
    name: "Weather",
    description: "Current conditions and the next days, from Open-Meteo (no account needed).",
    multiple: true,
    defaults: {
      location: { mode: "auto", name: "", latitude: null, longitude: null },
      units: "celsius",
      days: 4,
      showRain: true,
    },
    fields: [
      {
        key: "location",
        label: "Location",
        type: "location",
        help: "Automatic asks macOS for this Mac's location once; without it, the city of your time zone is used.",
      },
      {
        key: "units",
        label: "Units",
        type: "select",
        options: [
          { value: "celsius", label: "°C" },
          { value: "fahrenheit", label: "°F" },
        ],
      },
      { key: "days", label: "Days of forecast", type: "number", min: 0, max: 6 },
      { key: "showRain", label: "Show chance of rain", type: "boolean" },
    ],
  },

  power: {
    name: "Power",
    description: "Battery of this Mac and of connected Bluetooth devices.",
    multiple: false,
    defaults: { showMac: true, showDevices: true, maxGauges: 4, lowAt: 20 },
    fields: [
      { key: "showMac", label: "Show this Mac", type: "boolean" },
      { key: "showDevices", label: "Show Bluetooth devices", type: "boolean" },
      { key: "maxGauges", label: "Maximum gauges", type: "number", min: 1, max: 6 },
      { key: "lowAt", label: "Low battery at (%)", type: "number", min: 5, max: 50 },
    ],
  },

  system: {
    name: "System",
    description: "CPU load per core and temperature, memory and free disk space.",
    multiple: false,
    defaults: { every: 3, showCores: true, showTemperature: true, units: "celsius", disks: "startup" },
    fields: [
      { key: "every", label: "Refresh every (seconds)", type: "number", min: 2, max: 60 },
      { key: "showCores", label: "Show each core", type: "boolean" },
      { key: "showTemperature", label: "Show the CPU temperature", type: "boolean", help: "Apple silicon only: Intel Macs do not share it without administrator rights." },
      {
        key: "units",
        label: "Temperature units",
        type: "select",
        options: [
          { value: "celsius", label: "°C" },
          { value: "fahrenheit", label: "°F" },
        ],
      },
      {
        key: "disks",
        label: "Disks",
        type: "select",
        options: [
          { value: "startup", label: "Startup disk only" },
          { value: "all", label: "Every disk you can write to" },
        ],
        help: "Free space as Finder counts it, with the space macOS can reclaim.",
      },
    ],
  },

  music: {
    name: "Music",
    description: "Plays the songs in a folder, with shuffle and an artist lock. Media keys work.",
    multiple: false,
    defaults: { source: "folder", folder: "~/Music", shuffle: true, volume: 80 },
    fields: [
      {
        key: "source",
        label: "Source",
        type: "select",
        options: [
          { value: "folder", label: "Folder on this Mac" },
          { value: "spotify", label: "Spotify (coming soon)", disabled: true },
          { value: "youtube", label: "YouTube Music (coming soon)", disabled: true },
        ],
      },
      { key: "folder", label: "Music folder", type: "folder", help: "Scanned with its subfolders: mp3, m4a, aac, flac, wav, ogg, opus." },
      { key: "shuffle", label: "Start in shuffle", type: "boolean" },
      { key: "volume", label: "Volume (%)", type: "number", min: 0, max: 100 },
    ],
  },

  "wallpaper-picker": {
    name: "Wallpaper picker",
    description: "Swatches to switch the gradient wallpaper from the desktop. Set up the wallpaper in Wallpaper.",
    multiple: false,
    defaults: {},
    fields: [],
  },

  finder: {
    name: "Finder",
    description: "Opens your Desktop folder in a Finder window, with one click.",
    multiple: false,
    defaults: {},
    fields: [],
  },

  ai: {
    name: "AI usage",
    description: "What is left of your Claude Code and Codex plans, and whether they are working right now. Local files only.",
    multiple: false,
    defaults: { claude: true, codex: true, claudeLimitsFile: "" },
    fields: [
      { key: "claude", label: "Show Claude", type: "boolean" },
      { key: "codex", label: "Show ChatGPT (Codex)", type: "boolean" },
      {
        key: "claudeLimitsFile",
        label: "Claude limits file",
        type: "text",
        placeholder: "~/Library/Application Support/Widgetian/claude-limits.json",
        help: "Written by the Claude Code statusline. Empty = Widgetian's own (see the README).",
      },
    ],
  },

  calendar: {
    name: "Calendar",
    description: "Upcoming events from any calendar that offers an iCal (.ics) address: Google, iCloud, Outlook…",
    multiple: true,
    defaults: { calendars: [], daysAhead: 2, maxEvents: 8, showAllDay: true, timeFormat: "inherit" },
    fields: [
      {
        key: "calendars",
        label: "Calendars",
        type: "list",
        addLabel: "Add calendar",
        help: "Google Calendar: Settings › your calendar › Integrate calendar › Secret address in iCal format.",
        itemDefaults: { name: "", url: "", color: "#4f8cff" },
        itemFields: [
          { key: "name", label: "Name", type: "text", placeholder: "Work" },
          { key: "url", label: "iCal address", type: "text", placeholder: "https://calendar.google.com/calendar/ical/…/basic.ics", secret: true },
          { key: "color", label: "Colour", type: "color" },
        ],
      },
      { key: "daysAhead", label: "Days ahead", type: "number", min: 1, max: 14, help: "1 = today only." },
      { key: "maxEvents", label: "Maximum events", type: "number", min: 1, max: 20 },
      { key: "showAllDay", label: "Show all-day events", type: "boolean" },
      TIME_FORMAT,
    ],
  },

  todo: {
    name: "To do",
    description: "A checklist you edit on the desktop. Items can carry a note you can copy.",
    multiple: true,
    defaults: { title: "To do", items: [], hideDone: false },
    fields: [
      { key: "title", label: "Title", type: "text" },
      { key: "hideDone", label: "Hide completed items", type: "boolean" },
      {
        key: "items",
        label: "Items",
        type: "list",
        addLabel: "Add item",
        itemDefaults: { text: "", note: "", done: false },
        itemFields: [
          { key: "text", label: "Task", type: "text" },
          { key: "note", label: "Note", type: "textarea", help: "Optional. Expand the item on the desktop to read or copy it." },
          { key: "done", label: "Done", type: "boolean" },
        ],
      },
    ],
  },

  status: {
    name: "Service status",
    description: "Health, visits and anything else about a website or service: checks, Umami, or your own JavaScript, in tabs if you like.",
    multiple: true,
    defaults: {
      name: "GitHub",
      logo: "",
      showName: true,
      url: "https://www.githubstatus.com",
      blocks: [
        {
          id: "checks",
          type: "checks",
          title: "",
          tab: "",
          every: 60,
          checks: [{ type: "statuspage", label: "GitHub status", url: "https://www.githubstatus.com" }],
        },
      ],
    },
    fields: [
      { key: "name", label: "Name", type: "text" },
      { key: "logo", label: "Logo", type: "image", placeholder: "https://example.com/logo.png or an emoji", help: "An image on this Mac, an image URL (https) or an emoji. Empty = the name's initials." },
      { key: "showName", label: "Show the name next to the logo", type: "boolean" },
      { key: "url", label: "Link", type: "text", placeholder: "https://example.com", help: "Opened when you click the ring, unless a script gives the ring another action." },
      {
        key: "blocks",
        label: "Blocks",
        type: "list",
        addLabel: "Add block",
        collapsible: true,
        help: "What the card shows, from top to bottom. Give several blocks a tab name to put them in tabs.",
        itemDefaults: { type: "checks", title: "", tab: "", every: 60, checks: [] },
        itemFields: [
          {
            key: "type",
            label: "Type",
            type: "select",
            options: [
              { value: "checks", label: "Checks" },
              { value: "umami", label: "Umami visits" },
              { value: "script", label: "Script (your own JavaScript)" },
            ],
          },
          { key: "title", label: "Title", type: "text", help: "Optional. Shown above the block." },
          { key: "tab", label: "Tab", type: "text", placeholder: "None: always visible" },
          { key: "every", label: "Refresh every (seconds)", type: "number", min: 5, max: 86400 },
          { key: "checks", label: "Checks", type: "list", addLabel: "Add check", itemDefaults: { type: "http", label: "", url: "https://", expectStatus: 200 }, itemFields: CHECK_FIELDS, when: when("checks") },
          { key: "shareUrl", label: "Umami share link", type: "text", secret: true, placeholder: "https://cloud.umami.is/share/…", when: when("umami"), help: "14-day visits chart and who is on the site now." },
          { key: "hosts", label: "Only these hosts", type: "text", placeholder: "example.com, www.example.com", when: when("umami"), help: "Optional, separated by commas." },
          { key: "excludeHosts", label: "All hosts except", type: "text", placeholder: "staging.example.com", when: when("umami"), help: "Optional. Not used if the field above has hosts." },
          { key: "hostSuffix", label: "Hide this part of the host", type: "text", placeholder: ".example.com", when: when("umami"), help: "With several hosts each session shows its own; this shortens it." },
          { key: "code", label: "JavaScript", type: "code", when: when("script") },
        ],
      },
    ],
  },
};

export const WIDGET_TYPE_IDS = Object.keys(CATALOG);
