import { PHOTO_SLOT, TEMPLATE_SIZE } from "../config";

/*
 * Canvas compositor: draws the final 2048x2048 picture
 * (photo through the torn-paper mask + frame artwork).
 *
 * The caller owns the Image instances. `photo` is reused between
 * renders, so the bitmap only reloads when its src changes.
 *
 * `photoDrawable` is an already-decoded source (a canvas or an
 * ImageBitmap, e.g. a frame that was just pulled off the camera).
 * When it is given, the composite is painted immediately — no URL
 * load or JPEG decode — which is what makes a fresh capture appear
 * the moment the live view leaves the slot.
 */
export function renderComposite(options) {
  const {
    canvas,
    frame,
    mask,
    photo,
    photoDrawable,
    photoData,
    brightness,
    contrast,
    saturation,
    photoX,
    photoY,
    photoScale,
    rotation,
    flipX,
    onDone,
  } = options;

  if (!canvas || !frame || !mask) {
    onDone?.(canvas);
    return;
  }

  /*
   * Leave the canvas alone when it is already the right size:
   * assigning width/height resets the bitmap, so doing it on every
   * redraw (every drag frame) would reallocate 16 MB each time.
   */
  if (canvas.width !== TEMPLATE_SIZE) canvas.width = TEMPLATE_SIZE;
  if (canvas.height !== TEMPLATE_SIZE) canvas.height = TEMPLATE_SIZE;

  const ctx = canvas.getContext("2d");

  ctx.clearRect(0, 0, TEMPLATE_SIZE, TEMPLATE_SIZE);

  /* No photo yet: just show the frame artwork. */
  if (!photoData) {
    ctx.drawImage(frame, 0, 0, TEMPLATE_SIZE, TEMPLATE_SIZE);
    onDone?.(canvas);
    return;
  }

  const paint = (source) => {
    drawMaskedPhoto(ctx, source, mask, {
      brightness,
      contrast,
      saturation,
      photoX,
      photoY,
      photoScale,
      rotation,
      flipX,
    });

    ctx.drawImage(frame, 0, 0, TEMPLATE_SIZE, TEMPLATE_SIZE);

    onDone?.(canvas);
  };

  /* Fresh capture: already decoded, so paint it in this very frame. */
  if (photoDrawable) {
    /* Stop listening on the reusable Image: a late load of an older
       source must not repaint the canvas over the fresh capture. */
    photo.onload = null;
    photo.onerror = null;

    paint(photoDrawable);
    return;
  }

  let finished = false;

  const finish = () => {
    if (finished) return;
    finished = true;

    paint(photo);
  };

  photo.onload = finish;

  photo.onerror = () => {
    if (finished) return;
    finished = true;
    onDone?.(canvas);
  };

  if (photo.src !== photoData) {
    photo.src = photoData;
  }

  /* Cached images finish synchronously. */
  if (photo.complete && photo.naturalWidth) {
    finish();
  }
}

/*
 * Canvas 2D filters (brightness/contrast/saturate) are disabled by
 * default in Safari — every current version, desktop and iOS — so
 * ctx.filter assignments are silently ignored there. Feature-detect
 * once so the editor can fall back to a pixel pass.
 */
let canvasFilterSupport = null;

function supportsCanvasFilter(ctx) {
  if (canvasFilterSupport === null) {
    canvasFilterSupport = typeof ctx.filter === "string";
  }
  return canvasFilterSupport;
}

/*
 * Draws the photo scaled to cover the torn-paper opening, applies
 * the manual adjustments, then clips everything with the mask.
 *
 * Everything happens directly on the target context, clipped to the
 * opening's rectangle, so no full-size temporary canvas is needed
 * and only the opening's pixels are touched.
 */
function drawMaskedPhoto(ctx, photo, mask, transform) {
  const {
    brightness,
    contrast,
    saturation,
    photoX,
    photoY,
    photoScale,
    rotation,
    flipX,
  } = transform;

  const { x: maskX, y: maskY, width: maskW, height: maskH } = PHOTO_SLOT;

  const hasColorAdjust =
    brightness !== 100 || contrast !== 100 || saturation !== 100;

  const useNativeFilter = hasColorAdjust && supportsCanvasFilter(ctx);

  /* Cover the whole opening at scale 1. */
  const baseRatio = Math.max(maskW / photo.width, maskH / photo.height);
  const ratio = baseRatio * photoScale;

  const dw = photo.width * ratio;
  const dh = photo.height * ratio;

  const centerX = maskX + maskW / 2 + photoX;
  const centerY = maskY + maskH / 2 + photoY;

  ctx.save();
  ctx.beginPath();
  ctx.rect(maskX, maskY, maskW, maskH);
  ctx.clip();
  ctx.translate(centerX, centerY);
  ctx.rotate((rotation * Math.PI) / 180);
  ctx.scale(flipX ? -1 : 1, 1);
  if (useNativeFilter) {
    ctx.filter =
      `brightness(${brightness}%) ` +
      `contrast(${contrast}%) ` +
      `saturate(${saturation}%)`;
  }
  ctx.drawImage(photo, -dw / 2, -dh / 2, dw, dh);
  ctx.restore();

  /*
   * Apply the irregular jagged mask. Only the photo is on the canvas
   * at this point (the frame is drawn after), so destination-in
   * keeps the photo exactly where the mask allows it.
   */
  ctx.save();
  ctx.globalCompositeOperation = "destination-in";
  ctx.drawImage(mask, 0, 0, TEMPLATE_SIZE, TEMPLATE_SIZE);
  ctx.restore();

  /* Browsers without ctx.filter need the manual pixel pass. */
  if (hasColorAdjust && !useNativeFilter) {
    adjustSlotPixels(ctx, maskX, maskY, maskW, maskH, {
      brightness,
      contrast,
      saturation,
    });
  }
}

/*
 * Software brightness / contrast / saturation over the masked slot.
 * Matches the CSS filter maths: brightness scales the channels,
 * contrast pivots around mid grey, saturation lerps toward the
 * luminance (Rec. 709 coefficients, same as the filter spec).
 */
function adjustSlotPixels(
  ctx,
  x,
  y,
  width,
  height,
  { brightness, contrast, saturation }
) {
  const left = Math.max(0, Math.floor(x));
  const top = Math.max(0, Math.floor(y));
  const right = Math.min(TEMPLATE_SIZE, Math.ceil(x + width));
  const bottom = Math.min(TEMPLATE_SIZE, Math.ceil(y + height));

  const regionW = right - left;
  const regionH = bottom - top;

  if (regionW <= 0 || regionH <= 0) return;

  const image = ctx.getImageData(left, top, regionW, regionH);
  const data = image.data;

  const bright = brightness / 100;
  const contrastFactor = contrast / 100;
  const saturationFactor = saturation / 100;

  for (let i = 0; i < data.length; i += 4) {
    const r = (data[i] * bright - 128) * contrastFactor + 128;
    const g = (data[i + 1] * bright - 128) * contrastFactor + 128;
    const b = (data[i + 2] * bright - 128) * contrastFactor + 128;

    const l = 0.213 * r + 0.715 * g + 0.072 * b;

    data[i] = l + (r - l) * saturationFactor;
    data[i + 1] = l + (g - l) * saturationFactor;
    data[i + 2] = l + (b - l) * saturationFactor;
  }

  ctx.putImageData(image, left, top);
}

/*
 * Small JPEG preview of a finished composite for the gallery grid
 * (~50 KB instead of the multi-MB PNG). The full-size image is only
 * fetched when a photo is downloaded or opened.
 */
export function createThumbnailDataURL(sourceCanvas, size = 512) {
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;

  const ctx = canvas.getContext("2d");

  ctx.drawImage(sourceCanvas, 0, 0, size, size);

  return canvas.toDataURL("image/jpeg", 0.82);
}
