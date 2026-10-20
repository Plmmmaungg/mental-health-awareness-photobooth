import { API_BASE, LIVE_CHANNEL } from "../config";

/*
 * Backend relay used when the booth and the live screen run on two
 * different devices (phone camera -> laptop display). Same-browser
 * pairs stay on BroadcastChannel, which is instant and offline-safe.
 */
export const LIVE_RELAY_URL = `${API_BASE}/live`;

/*
 * Message types sent from the booth to the live screen.
 */
export const LIVE_EVENT = {
  /* { open: boolean, facing: "user" | "environment" } */
  CAMERA: "camera",
  /* { value: number | "SMILE!" | null } */
  COUNTDOWN: "countdown",
  /* {} */
  FLASH: "flash",
  /* { photo: dataURL } */
  CAPTURED: "captured",
  /* { frame: dataURL } — one live camera frame for remote screens */
  FRAME: "frame",
  /* {} — live screen asks the booth for its current state */
  REQUEST: "request-state",
};

export function createLiveChannel() {
  if (typeof BroadcastChannel === "undefined") return null;
  return new BroadcastChannel(LIVE_CHANNEL);
}

/*
 * Opens the second-display window and returns it.
 */
export function openLiveScreen() {
  const url = `${window.location.origin}${window.location.pathname}?screen=live`;

  const win = window.open(
    url,
    "photobooth-live-screen",
    "popup=yes,width=1280,height=800"
  );

  win?.focus?.();
  return win;
}
