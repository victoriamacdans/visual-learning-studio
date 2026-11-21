export interface BoxRect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface VideoPixelCrop {
  readonly sx: number;
  readonly sy: number;
  readonly sw: number;
  readonly sh: number;
}

/**
 * Computes the rendered content rectangle of an `object-contain` video element
 * inside its CSS container, accounting for aspect ratio, scaling, and letterboxing.
 */
export function computeVideoContentRect(
  containerWidth: number,
  containerHeight: number,
  videoWidth: number,
  videoHeight: number,
): BoxRect {
  if (
    containerWidth <= 0 ||
    containerHeight <= 0 ||
    videoWidth <= 0 ||
    videoHeight <= 0
  ) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  const containerAspect = containerWidth / containerHeight;
  const videoAspect = videoWidth / videoHeight;

  if (containerAspect > videoAspect) {
    // Pillarboxed horizontally
    const height = containerHeight;
    const width = height * videoAspect;
    const x = (containerWidth - width) / 2;
    return { x, y: 0, width, height };
  }

  // Letterboxed vertically
  const width = containerWidth;
  const height = width / videoAspect;
  const y = (containerHeight - height) / 2;
  return { x: 0, y, width, height };
}

/**
 * Clamps a user-drawn selection rectangle in container coordinates so it remains
 * strictly inside the rendered video content box (excluding letterbox margins).
 */
export function clampSelectionToRect(
  selection: BoxRect,
  bounds: BoxRect,
): BoxRect {
  if (bounds.width <= 0 || bounds.height <= 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  const left = Math.max(bounds.x, Math.min(bounds.x + bounds.width, selection.x));
  const top = Math.max(bounds.y, Math.min(bounds.y + bounds.height, selection.y));
  const right = Math.max(
    left,
    Math.min(bounds.x + bounds.width, selection.x + selection.width),
  );
  const bottom = Math.max(
    top,
    Math.min(bounds.y + bounds.height, selection.y + selection.height),
  );

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
}

/**
 * Maps a preview selection rectangle (in container CSS pixels) to exact native
 * video frame pixel coordinates for offscreen canvas cropping.
 */
export function mapPreviewSelectionToVideoPixels(
  selection: BoxRect,
  containerWidth: number,
  containerHeight: number,
  videoWidth: number,
  videoHeight: number,
): VideoPixelCrop | null {
  const contentRect = computeVideoContentRect(
    containerWidth,
    containerHeight,
    videoWidth,
    videoHeight,
  );
  if (contentRect.width <= 0 || contentRect.height <= 0) {
    return null;
  }

  const clamped = clampSelectionToRect(selection, contentRect);
  if (clamped.width < 2 || clamped.height < 2) {
    return null;
  }

  const scaleX = videoWidth / contentRect.width;
  const scaleY = videoHeight / contentRect.height;

  const sx = Math.max(
    0,
    Math.min(videoWidth - 1, Math.round((clamped.x - contentRect.x) * scaleX)),
  );
  const sy = Math.max(
    0,
    Math.min(videoHeight - 1, Math.round((clamped.y - contentRect.y) * scaleY)),
  );
  const sw = Math.max(1, Math.min(videoWidth - sx, Math.round(clamped.width * scaleX)));
  const sh = Math.max(1, Math.min(videoHeight - sy, Math.round(clamped.height * scaleY)));

  return { sx, sy, sw, sh };
}

/**
 * Computes scaled output canvas dimensions bounded by `maxDimension` while
 * preserving the cropped region's aspect ratio.
 */
export function computeBoundedOutputSize(
  srcWidth: number,
  srcHeight: number,
  maxDimension: number,
): { readonly width: number; readonly height: number } {
  if (srcWidth <= 0 || srcHeight <= 0) {
    return { width: 1, height: 1 };
  }
  const longest = Math.max(srcWidth, srcHeight);
  if (longest <= maxDimension) {
    return { width: Math.round(srcWidth), height: Math.round(srcHeight) };
  }
  const scale = maxDimension / longest;
  return {
    width: Math.max(1, Math.round(srcWidth * scale)),
    height: Math.max(1, Math.round(srcHeight * scale)),
  };
}
