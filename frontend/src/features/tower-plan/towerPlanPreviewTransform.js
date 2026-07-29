export const MIN_PREVIEW_ZOOM = 0.5;
export const MAX_PREVIEW_ZOOM = 2.5;
export const PREVIEW_VISIBLE_EDGE = 100;

export function clampZoom(value) {
  return Math.min(
    MAX_PREVIEW_ZOOM,
    Math.max(MIN_PREVIEW_ZOOM, Number(value) || 1),
  );
}

export function zoomAroundPoint(transform, nextZoomValue, point) {
  const nextZoom = clampZoom(nextZoomValue);
  const ratio = nextZoom / transform.zoom;
  return {
    zoom: nextZoom,
    x: point.x - (point.x - transform.x) * ratio,
    y: point.y - (point.y - transform.y) * ratio,
  };
}

export function clampPan(transform, viewport, documentSize) {
  if (viewport.width <= 0 || viewport.height <= 0) return transform;

  const scaledWidth = documentSize.width * transform.zoom;
  const scaledHeight = documentSize.height * transform.zoom;
  const minX = PREVIEW_VISIBLE_EDGE - scaledWidth;
  const maxX = viewport.width - PREVIEW_VISIBLE_EDGE;
  const minY = PREVIEW_VISIBLE_EDGE - scaledHeight;
  const maxY = viewport.height - PREVIEW_VISIBLE_EDGE;

  return {
    ...transform,
    x: Math.min(maxX, Math.max(minX, transform.x)),
    y: Math.min(maxY, Math.max(minY, transform.y)),
  };
}
