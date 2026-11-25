// HTTP Range header parsing for media:// (audio seeking needs partial responses).

/**
 * Parses "bytes=start-end" against a file size.
 * @returns {{ start: number, end: number } | null} null when absent, malformed or unsatisfiable
 */
export const parseRange = (header, size) => {
  const match = /^bytes=(\d*)-(\d*)$/.exec(header ?? "");
  if (!match || (match[1] === "" && match[2] === "")) return null;
  let start;
  let end;
  if (match[1] === "") {
    start = Math.max(0, size - Number(match[2]));
    end = size - 1;
  } else {
    start = Number(match[1]);
    end = match[2] === "" ? size - 1 : Math.min(Number(match[2]), size - 1);
  }
  return start <= end && start < size ? { start, end } : null;
};
