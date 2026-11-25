// Pure geometry for the pointer tracking (see pointer.js).

const isRect = (rect) =>
  rect !== null && typeof rect === "object" && ["x", "y", "width", "height"].every((key) => Number.isFinite(rect[key]));

/** Rectangles as a page reported them, with anything malformed dropped. */
export const cleanRects = (rects, limit = 200) => (Array.isArray(rects) ? rects.filter(isRect).slice(0, limit) : []);

export const isInside = (point, rects) =>
  rects.some(
    (rect) => point.x >= rect.x && point.x < rect.x + rect.width && point.y >= rect.y && point.y < rect.y + rect.height,
  );
