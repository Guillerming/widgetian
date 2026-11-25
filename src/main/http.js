// Network requests through Chromium's stack (Electron's net.fetch): it uses the macOS trust store
// and system proxies, unlike Node's own fetch. Electron is imported lazily so that the pure parts of
// the data sources can be unit-tested with plain Node.
let electronFetch = null;

/** @type {typeof fetch} */
export const httpFetch = async (input, init) => {
  if (!electronFetch) {
    const electron = await import("electron");
    const net = electron.net ?? electron.default?.net;
    electronFetch = net.fetch.bind(net);
  }
  return electronFetch(input, init);
};
