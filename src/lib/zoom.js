/*
 * Blocks page-level zooming everywhere so the only zoom in the app
 * is the photo-placement zoom inside the template (handled by the
 * preview's own pointer/wheel gestures).
 *
 * Covers:
 *  - iOS Safari pinch gestures (gesturestart / gesturechange)
 *  - multi-touch touchmove outside the exempt element
 *  - desktop ctrl/meta + wheel (trackpad pinch and Ctrl+scroll)
 *  - ctrl/meta +, -, 0 keyboard zoom shortcuts
 */
export function installZoomGuards({ exemptSelector = ".preview-wrap" } = {}) {
  const preventGesture = (event) => event.preventDefault();

  const preventMultiTouch = (event) => {
    if (event.touches.length <= 1) return;

    /* Let the preview handle its own pinch gestures. */
    if (exemptSelector && event.target?.closest?.(exemptSelector)) return;

    event.preventDefault();
  };

  const preventZoomWheel = (event) => {
    if (event.ctrlKey || event.metaKey) event.preventDefault();
  };

  const preventZoomKeys = (event) => {
    if (!(event.ctrlKey || event.metaKey)) return;
    if (["+", "=", "-", "_", "0"].includes(event.key)) event.preventDefault();
  };

  document.addEventListener("gesturestart", preventGesture);
  document.addEventListener("gesturechange", preventGesture);
  document.addEventListener("touchmove", preventMultiTouch, {
    passive: false,
  });
  document.addEventListener("wheel", preventZoomWheel, { passive: false });
  document.addEventListener("keydown", preventZoomKeys);

  return () => {
    document.removeEventListener("gesturestart", preventGesture);
    document.removeEventListener("gesturechange", preventGesture);
    document.removeEventListener("touchmove", preventMultiTouch);
    document.removeEventListener("wheel", preventZoomWheel);
    document.removeEventListener("keydown", preventZoomKeys);
  };
}
