import { API_BASE } from "../config";

/*
 * Thin wrappers around the backend REST API.
 * Every network call in the app goes through these helpers.
 */

/*
 * Backend asset URLs (photo files under /uploads) come back absolute.
 * When the API is served from the same origin — the Vite dev proxy or
 * an HTTPS reverse proxy, i.e. API_BASE is a path like "/api" — they
 * are rewritten to relative paths. That keeps an HTTPS page from
 * sending plain-HTTP requests, which browsers would block.
 */
function sameOriginAsset(url) {
  if (typeof url !== "string") return url;
  if (/^https?:\/\//i.test(API_BASE)) return url;
  return url.replace(/^https?:\/\/[^/]+/i, "");
}

export async function fetchSavedPhotos() {
  const response = await fetch(`${API_BASE}/photos`);

  if (!response.ok) {
    throw new Error("Could not load saved photos.");
  }

  const data = await response.json();
  const photos = Array.isArray(data.photos) ? data.photos : [];

  return photos.map((photo) => ({
    ...photo,
    image_url: sameOriginAsset(photo.image_url),
    thumb_url: sameOriginAsset(photo.thumb_url),
  }));
}

/*
 * Saves a PNG data URL, with an optional small JPEG thumbnail for the
 * gallery grid. Returns the parsed backend response, which may
 * include { duplicate: true }.
 */
export async function savePhoto(image, originalName, thumb) {
  const response = await fetch(`${API_BASE}/photos`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      image,
      original_name: originalName || "camera-photo",
      thumb: thumb || undefined,
    }),
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok || !data.ok) {
    throw new Error(
      data.message ||
        `Save failed (HTTP ${response.status} from ${API_BASE}). Check that the backend is running and its database is connected.`
    );
  }

  return data;
}

export async function deletePhoto(id) {
  const response = await fetch(
    `${API_BASE}/photos/${encodeURIComponent(id)}`,
    { method: "DELETE" }
  );

  if (!response.ok) {
    throw new Error("Could not delete the saved photo.");
  }
}

export function downloadURL(url, filename) {
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  downloadURL(url, filename);
  URL.revokeObjectURL(url);
}

export function blobToDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
