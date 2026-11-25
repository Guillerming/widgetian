// Starting points for a script block, offered in Settings › a status card › Script.
export const SCRIPT_EXAMPLES = [
  {
    name: "Web page and JSON endpoint",
    code: `const started = Date.now();
const health = await json("https://www.githubstatus.com/api/v2/status.json");

return {
  hero: { tone: health.status.indicator === "none" ? "good" : "bad", title: health.status.description },
  rows: [
    { tone: "good", label: "Answered in", detail: \`\${Date.now() - started} ms\`, url: "https://www.githubstatus.com" },
  ],
};`,
  },
  {
    name: "Shell command",
    code: `const disk = await sh("df -h / | tail -1 | awk '{print $5, $4}'");
const [used, free] = disk.split(" ");

return {
  progress: { label: "Disk", value: parseInt(used) / 100, detail: \`\${free} free\`, tone: parseInt(used) > 90 ? "bad" : "good" },
};`,
  },
  {
    name: "A button that runs something",
    code: `// Clicking a button, row or ring with an "action" runs this script again with that action.
if (action === "backup") {
  await sh("echo 'your backup command here'");
  state.lastBackup = new Date().toISOString(); // state is kept between runs, until Widgetian quits
}

const last = state.lastBackup;
return {
  hero: {
    tone: last ? "good" : "wait",
    title: last ? "Backup done" : "No backup yet",
    detail: last ? new Date(last).toLocaleTimeString() : "Click the ring to start one",
    action: "backup",
    hint: "Back up now",
  },
  buttons: [{ label: "Back up now", action: "backup" }],
};`,
  },
  {
    name: "Last deploy, with the GitHub CLI",
    code: `const [run] = JSON.parse(await sh("gh run list -R owner/repo -L 1 --json status,conclusion,createdAt,headSha,url"));
if (!run) return { rows: [{ tone: "wait", label: "No deploys yet" }] };
const running = run.status !== "completed";

return {
  rows: [{
    tone: running ? "wait" : run.conclusion === "success" ? "good" : "bad",
    running,
    label: running ? "Deploying" : "Last deploy",
    detail: \`\${ago(run.createdAt)} · \${run.headSha.slice(0, 7)}\`,
    url: run.url,
  }],
  refresh: running ? 10 : 0, // seconds until the next run; 0 = the block's own interval
};`,
  },
  {
    name: "Tabs, chart and list",
    code: `return {
  tabs: [
    {
      name: "Traffic",
      chart: { label: "Visitors · 14 days", value: 128, note: "3 now", live: true, values: [3, 5, 4, 8, 9, 7, 12, 10, 14, 11, 9, 13, 12, 11], from: "1 Nov", to: "Today" },
    },
    {
      name: "People",
      live: true,
      list: { title: "Latest", items: [{ icon: "🇩🇪", text: "/pricing", detail: "2m", live: true }, { icon: "🇫🇷", text: "/", detail: "40s" }] },
    },
  ],
};`,
  },
  {
    name: "Your own HTML and CSS",
    code: `// Links open in the browser; anything with data-action runs the script again.
if (action === "hello") state.clicks = (state.clicks ?? 0) + 1;

return {
  html: \`<div class="box">
    <a href="https://example.com">example.com</a>
    <button data-action="hello">Clicked \${state.clicks ?? 0} times</button>
  </div>\`,
  css: ".box { display: flex; justify-content: space-between; align-items: center }",
};`,
  },
];
