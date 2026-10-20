/*
 * Single source of truth for template geometry, API and tuneables.
 * Everything that used to be hard-coded across App.jsx lives here.
 */

export const TEMPLATE_SIZE = 2048;

/*
 * Photo opening inside the template, matching photo-mask.webp.
 * The mask artwork is authored at 3375x3375 (artwork/photo-mask.png)
 * and rendered to 2048 by tools/optimize-images.mjs. This rect is the
 * mask's full alpha bounding box - measured from the rendered file so
 * even the faint resampling fringe is covered; the mask itself clips
 * the photo, so a small overshoot is invisible while a shortfall
 * would leave visible slivers. Re-measure whenever the artwork is
 * replaced (see tools/optimize-images.mjs).
 * Shared by the canvas renderer, the live camera preview and the
 * capture crop so all three line up pixel-for-pixel.
 */
export const PHOTO_SLOT = {
  x: 114,
  y: 650,
  width: 1817,
  height: 1280,
};

/* Raw camera captures use the same aspect ratio as the opening. */
export const CAPTURE_SIZE = {
  width: 1817,
  height: 1280,
};

/*
 * API origin for every backend call.
 *
 * - Dev: "/api" rides the Vite proxy to localhost:5000, so the HTTPS
 *   dev pages never send plain-HTTP requests (mixed content).
 * - Published over plain HTTP: the backend normally runs on the same
 *   machine as the web server, so calls follow the host the page was
 *   opened from (<protocol>://<hostname>:5000/api). That covers both
 *   localhost and the LAN address, and keeps working when the LAN IP
 *   changes — no rebuild needed.
 * - Published over HTTPS: the backend is reached through the web
 *   server's reverse proxy on the same origin, so "/api" is used (see
 *   "Publish the booth" in README.md for the Apache proxy setup).
 *
 * VITE_API_BASE (see .env.example) overrides everything when the
 * backend runs somewhere else; rebuild after changing it.
 */
const envBase = import.meta.env.VITE_API_BASE;

export const API_BASE = envBase
  ? envBase
  : import.meta.env.DEV || window.location.protocol === "https:"
    ? "/api"
    : `${window.location.protocol}//${window.location.hostname}:5000/api`;

/* BroadcastChannel name shared by the booth and the live screen. */
export const LIVE_CHANNEL = "batangas-photobooth-live";

export const MIN_PHOTO_SCALE = 0.5;
export const MAX_PHOTO_SCALE = 3;

export const COUNTDOWN_START = 3;
export const COUNTDOWN_TICK_MS = 850;
export const COUNTDOWN_SMILE_MS = 450;

/*
 * The word shown when the countdown reaches zero. It is much wider
 * than a single digit, so the styles give it its own smaller size
 * (the ".smile" class) that always fits inside the frame.
 */
export const COUNTDOWN_SMILE_TEXT = "SMILE!";

/*
 * Live frames streamed from a booth to a remote screening. The size
 * keeps the torn-paper slot's ratio at 1/2.5 scale; the interval
 * gives roughly 6 frames per second over the local network.
 */
export const FRAME_SIZE = {
  width: 727,
  height: 512,
};

export const FRAME_INTERVAL_MS = 170;

/* Converts a template-space value into a CSS percentage. */
export function pctOfTemplate(value) {
  return `${(value / TEMPLATE_SIZE) * 100}%`;
}
