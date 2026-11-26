// Which update to offer, from GitHub's "latest release" answer. Pure functions, tested in
// test/updates.test.js; updater.js does the network, the files and the restart.
export const RELEASES_URL = "https://api.github.com/repos/Guillerming/widgetian/releases/latest";
export const DOWNLOAD_PREFIX = "https://github.com/Guillerming/widgetian/releases/download/";

/** "v0.2.0" or "0.2.0" → [0, 2, 0]; null for anything else (pre-release tags included). */
export const parseVersion = (text) => {
  const match = /^v?(\d+)\.(\d+)\.(\d+)$/.exec(String(text ?? "").trim());
  return match ? match.slice(1).map(Number) : null;
};

export const isNewer = (candidate, current) => {
  const [a, b] = [parseVersion(candidate), parseVersion(current)];
  if (!a || !b) return false;
  const index = a.findIndex((part, position) => part !== b[position]);
  return index !== -1 && a[index] > b[index];
};

/**
 * The update a release offers this Mac, or null when there is nothing newer. `download` is null
 * when the release has no zip for this architecture, or no SHA-256 to check it against: then the
 * only way to update is the release page.
 * @param {any} release GitHub's release object
 * @param {{ current: string, arch: string, downloadPrefix?: string }} options
 * @returns {{ version: string, page: string, notes: string, download: { url: string, sha256: string, size: number } | null } | null}
 */
export const updateFrom = (release, { current, arch, downloadPrefix = DOWNLOAD_PREFIX }) => {
  if (!release || release.draft || release.prerelease) return null;
  const version = parseVersion(release.tag_name)?.join(".");
  if (!version || !isNewer(version, current)) return null;
  const asset = (release.assets ?? []).find(({ name }) => name === `Widgetian-${version}-${arch}.zip`);
  const sha256 = /^sha256:([0-9a-f]{64})$/.exec(asset?.digest ?? "")?.[1];
  const url = String(asset?.browser_download_url ?? "");
  return {
    version,
    page: String(release.html_url ?? ""),
    notes: String(release.body ?? ""),
    download: sha256 && url.startsWith(downloadPrefix) ? { url, sha256, size: Number(asset.size) || 0 } : null,
  };
};

/** /Applications/Widgetian.app/Contents/MacOS/Widgetian → /Applications/Widgetian.app; null outside a bundle. */
export const bundleOf = (executable) => /^(.+?\.app)\/Contents\/MacOS\/[^/]+$/.exec(executable)?.[1] ?? null;

/**
 * Places the app cannot replace itself in: the disk image it was opened from, or the read-only copy
 * macOS runs when an app downloaded from the internet is opened where it was unzipped.
 */
export const isReadOnlyPlace = (bundle) => bundle.startsWith("/Volumes/") || bundle.includes("/AppTranslocation/");

/**
 * Runs detached after Widgetian quits: waits for it to exit, swaps the bundles (putting the old one
 * back if the new one cannot be moved in) and opens the app again. Every value arrives as an
 * argument, never pasted into the script. $1 pid, $2 installed app, $3 new app, $4 work folder,
 * then the arguments to open the app with.
 */
export const SWAP_SCRIPT = `
pid="$1"; target="$2"; fresh="$3"; work="$4"; shift 4
tries=0
while kill -0 "$pid" 2>/dev/null; do
  tries=$((tries + 1))
  if [ "$tries" -gt 300 ]; then rm -rf "$work"; exit 1; fi
  sleep 0.1
done
if mv "$target" "$work/previous.app"; then
  mv "$fresh" "$target" || mv "$work/previous.app" "$target"
fi
/usr/bin/open "$target" --args "$@"
rm -rf "$work"
`;
