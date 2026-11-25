// Play-order logic for the music widget. Pure functions (tested in test/music.test.js).

/** Fisher–Yates on a copy. */
export const shuffled = (items, random = Math.random) => {
  const copy = [...items];
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [copy[index], copy[other]] = [copy[other], copy[index]];
  }
  return copy;
};

/**
 * Play order (track ids), starting at `currentId` when it is still in the pool.
 * Locked to an artist: only that artist's songs. Shuffle: random order after the current one;
 * otherwise library order, wrapping around from the current song.
 * @param {{ id: string, artist: string }[]} tracks
 * @param {{ shuffle: boolean, artist?: string | null, currentId?: string | null, random?: () => number }} options
 */
export const buildQueue = (tracks, { shuffle, artist = null, currentId = null, random = Math.random }) => {
  const pool = (artist === null ? tracks : tracks.filter((track) => track.artist === artist)).map((track) => track.id);
  if (!pool.includes(currentId)) return shuffle ? shuffled(pool, random) : pool;
  if (shuffle) return [currentId, ...shuffled(pool.filter((id) => id !== currentId), random)];
  const index = pool.indexOf(currentId);
  return [...pool.slice(index), ...pool.slice(0, index)];
};
