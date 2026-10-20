import React, { useCallback, useEffect, useRef, useState } from "react";

import {
  CAPTURE_SIZE,
  COUNTDOWN_SMILE_MS,
  COUNTDOWN_SMILE_TEXT,
  COUNTDOWN_START,
  COUNTDOWN_TICK_MS,
  FRAME_INTERVAL_MS,
  FRAME_SIZE,
  MAX_PHOTO_SCALE,
  MIN_PHOTO_SCALE,
  PHOTO_SLOT,
  TEMPLATE_SIZE,
  pctOfTemplate,
} from "../config";
import {
  blobToDataURL,
  deletePhoto,
  downloadBlob,
  fetchSavedPhotos,
  savePhoto,
} from "../lib/api";
import { createThumbnailDataURL, renderComposite } from "../lib/composite";
import {
  createLiveChannel,
  LIVE_EVENT,
  LIVE_RELAY_URL,
  openLiveScreen,
} from "../lib/liveChannel";
import {
  attachStreamToVideo,
  describeCameraError,
  getCoverCrop,
  requestCameraStream,
  stopStream,
} from "../lib/media";
import { installZoomGuards } from "../lib/zoom";
import GalleryPage from "./GalleryPage";
import Icon from "./Icon";
import SettingsMenu from "./SettingsMenu";

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/*
 * Main photobooth screen: template preview, camera flow, direct
 * photo placement, save/download and the saved photos gallery.
 */
export default function BoothPage({ onHome, openGalleryInitially = false }) {
  /*
   * ----------------------------------------------------------
   * REFS
   * ----------------------------------------------------------
   */
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);

  /* Which physical camera the current stream came from. */
  const facingRef = useRef("user");

  const photoRef = useRef(null);
  const templateRef = useRef(null);
  const frameRef = useRef(null);
  const maskRef = useRef(null);

  const settingsRef = useRef(null);

  const gestureRef = useRef({
    pointers: new Map(),
    startX: 0,
    startY: 0,
    startPhotoX: 0,
    startPhotoY: 0,
    startDistance: 0,
    startScale: 1,
    dragging: false,
  });

  /* Holds either the countdown interval or the SMILE timeout. */
  const countdownTimerRef = useRef(null);
  const flashTimerRef = useRef(null);
  const liveChannelRef = useRef(null);

  /*
   * Fresh captures stay as a ready-to-draw offscreen canvas. The
   * compositor paints it directly, so the new photo never waits on
   * a JPEG encode + decode round-trip. `token` ties the canvas to
   * the photoData value currently on screen.
   */
  const captureRef = useRef({ token: null, canvas: null });
  const captureSeqRef = useRef(0);

  /*
   * While set, the camera view stays in the torn-paper slot until
   * the fresh composite has been painted — the slot is then handed
   * back (camera closed) with the new photo already on the canvas,
   * so the previous photo is never shown in between.
   */
  const pendingCameraStopRef = useRef(false);
  const pendingStopTimerRef = useRef(null);

  /*
   * Names this booth instance. Live screens use it to ignore relay
   * echoes of a booth that runs in their own browser — the
   * BroadcastChannel has already delivered those instantly.
   */
  const boothIdRef = useRef(null);
  if (!boothIdRef.current) {
    boothIdRef.current =
      typeof crypto !== "undefined" && crypto.randomUUID
        ? crypto.randomUUID()
        : `booth-${Math.random().toString(36).slice(2)}`;
  }

  /* Broadcast the finished composite after the next capture. */
  const shareCompositeRef = useRef(false);
  const lastCompositeRef = useRef(null);

  /* Live-frame stream for remote screenings (throttled JPEG). */
  const frameViewersRef = useRef(0);
  const frameSendingRef = useRef(false);
  const frameSentAtRef = useRef(0);
  const frameCanvasRef = useRef(null);

  /*
   * ----------------------------------------------------------
   * STATE
   * ----------------------------------------------------------
   */
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraFacing, setCameraFacing] = useState("user");
  const [countdown, setCountdown] = useState(null);
  const [flash, setFlash] = useState(false);

  /*
   * The current photo: a fresh capture stores a unique token here
   * (pixels live on captureRef's canvas), an upload stores its data
   * URL. Everything downstream only needs it as an identity.
   */
  const [photoData, setPhotoData] = useState(null);
  const [uploadedName, setUploadedName] = useState("");

  const [message, setMessage] = useState("");
  const [cameraError, setCameraError] = useState("");

  const [brightness, setBrightness] = useState(100);
  const [contrast, setContrast] = useState(100);
  const [saturation, setSaturation] = useState(100);
  const [rotation, setRotation] = useState(0);
  const [flipX, setFlipX] = useState(false);

  /* Direct photo movement / resizing. */
  const [photoX, setPhotoX] = useState(0);
  const [photoY, setPhotoY] = useState(0);
  const [photoScale, setPhotoScale] = useState(1);

  /*
   * REPOSITION mode: the photo only moves while this is on.
   * Off by default so touching the preview never drags the photo
   * by accident (and the page can still scroll normally).
   */
  const [placeMode, setPlaceMode] = useState(false);

  const [savedPhotos, setSavedPhotos] = useState([]);
  const [selectedPhotos, setSelectedPhotos] = useState([]);

  const [saving, setSaving] = useState(false);
  const [showGallery, setShowGallery] = useState(openGalleryInitially);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [templateReady, setTemplateReady] = useState(false);

  /* Prevent saving the exact same composition repeatedly. */
  const [lastSavedSignature, setLastSavedSignature] = useState("");

  /*
   * Always-fresh snapshot so the live screen can ask for state.
   */
  const boothStateRef = useRef({});
  boothStateRef.current = { cameraOpen, cameraFacing, countdown };

  /*
   * ----------------------------------------------------------
   * TEMPLATE
   * ----------------------------------------------------------
   */
  const loadTemplate = useCallback(() => {
    const base = import.meta.env.BASE_URL;

    const template = new Image();
    const frame = new Image();
    const mask = new Image();

    let loaded = 0;

    const done = () => {
      loaded += 1;

      if (loaded === 3) {
        templateRef.current = template;
        frameRef.current = frame;
        maskRef.current = mask;
        setTemplateReady(true);
      }
    };

    template.onload = done;
    frame.onload = done;
    mask.onload = done;

    template.src = `${base}template.webp`;
    frame.src = `${base}frame.webp`;
    mask.src = `${base}photo-mask.webp`;
  }, []);

  /*
   * ----------------------------------------------------------
   * LIVE SCREEN (second display)
   * ----------------------------------------------------------
   */
  useEffect(() => {
    const channel = createLiveChannel();
    liveChannelRef.current = channel;

    if (!channel) return undefined;

    const handleMessage = (event) => {
      if (event.data?.type !== LIVE_EVENT.REQUEST) return;

      const snapshot = boothStateRef.current;

      channel.postMessage({
        type: LIVE_EVENT.CAMERA,
        open: snapshot.cameraOpen,
        facing: snapshot.cameraFacing,
        boothId: boothIdRef.current,
      });
      channel.postMessage({
        type: LIVE_EVENT.COUNTDOWN,
        value: snapshot.countdown ?? null,
        boothId: boothIdRef.current,
      });

      if (lastCompositeRef.current) {
        channel.postMessage({
          type: LIVE_EVENT.CAPTURED,
          photo: lastCompositeRef.current,
          boothId: boothIdRef.current,
        });
      }
    };

    channel.addEventListener("message", handleMessage);

    return () => {
      channel.removeEventListener("message", handleMessage);
      channel.close();
      liveChannelRef.current = null;
    };
  }, []);

  /*
   * When this page closes mid-session, tell the relay the camera is
   * gone so a live screen opened later does not replay a stale
   * "session running" state. sendBeacon survives the unload.
   */
  useEffect(() => {
    const announceClosed = () => {
      if (!navigator.sendBeacon) return;

      navigator.sendBeacon(
        LIVE_RELAY_URL,
        JSON.stringify({
          type: LIVE_EVENT.CAMERA,
          open: false,
          boothId: boothIdRef.current,
        })
      );
    };

    window.addEventListener("pagehide", announceClosed);
    return () => window.removeEventListener("pagehide", announceClosed);
  }, []);

  const broadcast = useCallback((type, payload = {}) => {
    const message = { type, ...payload, boothId: boothIdRef.current };

    /* Same browser: booth and live screen side by side. */
    liveChannelRef.current?.postMessage(message);

    /*
     * Other devices: phone booth -> laptop display. The backend relay
     * forwards the event to every connected live screen. The relay is
     * optional, so failures must never disturb the booth itself.
     */
    fetch(LIVE_RELAY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(message),
    }).catch(() => {});
  }, []);

  /*
   * Stable callback ref so the stream attaches the instant the video
   * mounts — iOS Safari is strict about late play() calls.
   */
  const attachVideoRef = useCallback((element) => {
    videoRef.current = element;
    attachStreamToVideo(element, streamRef.current);
  }, []);

  useEffect(() => {
    broadcast(LIVE_EVENT.CAMERA, { open: cameraOpen, facing: cameraFacing });
  }, [cameraOpen, cameraFacing, broadcast]);

  useEffect(() => {
    broadcast(LIVE_EVENT.COUNTDOWN, { value: countdown });
  }, [countdown, broadcast]);

  /*
   * Live frames for remote screenings. While the camera is open,
   * small JPEG frames are pushed through the relay a few times per
   * second so a laptop shows the live view inside the frame. The
   * booth only encodes and sends while a screening is connected.
   */
  useEffect(() => {
    if (!cameraOpen) return undefined;

    const checkViewers = () => {
      fetch(`${LIVE_RELAY_URL}/viewers`)
        .then((response) => response.json())
        .then((data) => {
          frameViewersRef.current = Number(data?.screens) || 0;
        })
        .catch(() => {
          frameViewersRef.current = 0;
        });
    };

    checkViewers();
    const viewerTimer = setInterval(checkViewers, 2000);

    const sendFrame = () => {
      const video = videoRef.current;

      if (
        frameViewersRef.current < 1 ||
        !video ||
        video.readyState < 2 ||
        !video.videoWidth
      ) {
        return;
      }

      /* One frame in flight at a time; drop stalled attempts. */
      if (frameSendingRef.current) {
        if (Date.now() - frameSentAtRef.current < 2500) return;
        frameSendingRef.current = false;
      }

      frameSendingRef.current = true;
      frameSentAtRef.current = Date.now();

      try {
        const canvas =
          frameCanvasRef.current ||
          (frameCanvasRef.current = document.createElement("canvas"));

        canvas.width = FRAME_SIZE.width;
        canvas.height = FRAME_SIZE.height;

        const ctx = canvas.getContext("2d");

        ctx.save();

        /* Mirror selfies only; the back camera stays true to life. */
        if (facingRef.current === "user") {
          ctx.translate(canvas.width, 0);
          ctx.scale(-1, 1);
        }

        /* Same cover crop as the preview and the capture. */
        const { sx, sy, sw, sh } = getCoverCrop(
          video.videoWidth,
          video.videoHeight,
          FRAME_SIZE.width / FRAME_SIZE.height
        );

        ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

        ctx.restore();

        const frame = canvas.toDataURL("image/jpeg", 0.6);

        fetch(LIVE_RELAY_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: LIVE_EVENT.FRAME,
            frame,
            boothId: boothIdRef.current,
          }),
        })
          .catch(() => {})
          .finally(() => {
            frameSendingRef.current = false;
          });
      } catch {
        frameSendingRef.current = false;
      }
    };

    const frameTimer = setInterval(sendFrame, FRAME_INTERVAL_MS);

    return () => {
      clearInterval(viewerTimer);
      clearInterval(frameTimer);
      frameSendingRef.current = false;
    };
  }, [cameraOpen]);

  /*
   * ----------------------------------------------------------
   * SAVED PHOTOS
   * ----------------------------------------------------------
   */
  async function loadSavedPhotos() {
    try {
      setSavedPhotos(await fetchSavedPhotos());
    } catch {
      /* The booth still works if the backend is unavailable. */
    }
  }

  /*
   * ----------------------------------------------------------
   * LIFECYCLE
   * ----------------------------------------------------------
   */
  useEffect(() => {
    loadTemplate();
    loadSavedPhotos();

    return () => {
      stopCamera();
      clearTimeout(flashTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadTemplate]);

  /*
   * Redraw whenever the composition changes. `showGallery` is in
   * the list because the gallery unmounts its canvas, so returning
   * must repaint the fresh one.
   *
   * The onDone callback also shares the finished composite with the
   * live screen right after a capture (see shareCompositeRef).
   */
  useEffect(() => {
    drawComposite((canvas) => {
      if (!canvas || !shareCompositeRef.current || !photoData) return;

      shareCompositeRef.current = false;

      /*
       * The live screen only shows this inside the artwork, so a JPEG
       * keeps the encode and the relay transfer fast. Downloads and
       * saves still use the lossless PNG export.
       */
      canvas.toBlob(
        async (blob) => {
          if (!blob) return;

          const composite = await blobToDataURL(blob);
          lastCompositeRef.current = composite;

          broadcast(LIVE_EVENT.CAPTURED, { photo: composite });
        },
        "image/jpeg",
        0.85
      );
    });

    /*
     * A fresh capture painted straight from its canvas above, so the
     * canvas already shows the new photo. Only now hand the slot
     * back by closing the camera: the live view is swapped for the
     * finished composite in the same frame, so the previous photo is
     * never revealed.
     */
    if (pendingCameraStopRef.current) {
      pendingCameraStopRef.current = false;
      clearTimeout(pendingStopTimerRef.current);
      stopCamera();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    photoData,
    brightness,
    contrast,
    saturation,
    photoX,
    photoY,
    photoScale,
    rotation,
    flipX,
    templateReady,
    showGallery,
  ]);

  /*
   * Mobile + desktop: block page-level zoom everywhere. The only
   * zoom in the app is the photo-placement zoom inside the
   * template preview (handled by the preview's own gestures).
   */
  useEffect(() => installZoomGuards(), []);

  /* Close the settings dropdown on outside click or Escape. */
  useEffect(() => {
    if (!settingsOpen) return undefined;

    const handlePointerDown = (event) => {
      if (!settingsRef.current?.contains(event.target)) {
        setSettingsOpen(false);
      }
    };

    const handleKeyDown = (event) => {
      if (event.key === "Escape") setSettingsOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [settingsOpen]);

  /*
   * ----------------------------------------------------------
   * CAMERA
   * ----------------------------------------------------------
   */
  function stopCamera() {
    clearTimeout(pendingStopTimerRef.current);
    pendingCameraStopRef.current = false;

    clearInterval(countdownTimerRef.current);
    clearTimeout(countdownTimerRef.current);
    countdownTimerRef.current = null;

    stopStream(streamRef.current);
    streamRef.current = null;

    if (videoRef.current?.srcObject) {
      videoRef.current.srcObject = null;
    }

    setCameraOpen(false);
    setCountdown(null);
  }

  async function openCamera(facing = cameraFacing, { successMessage } = {}) {
    setCameraError("");
    setPlaceMode(false);

    /*
     * Normalize to a valid facing string (guards against stray
     * arguments, e.g. an event object passed to onClick).
     */
    const resolvedFacing =
      facing === "environment" ? "environment" : "user";

    try {
      stopCamera();

      const stream = await requestCameraStream(resolvedFacing);

      streamRef.current = stream;
      facingRef.current = resolvedFacing;

      setCameraFacing(resolvedFacing);
      setCameraOpen(true);
      setMessage(
        successMessage ||
          (resolvedFacing === "user"
            ? "Front camera ready — press the shutter when you're set."
            : "Back camera ready — press the shutter when you're set.")
      );

      attachStreamToVideo(videoRef.current, stream);
    } catch (error) {
      console.error("Camera error:", error);

      setCameraError(describeCameraError(error));
      setMessage("Camera unavailable.");
    }
  }

  function switchCamera() {
    openCamera(cameraFacing === "user" ? "environment" : "user");
  }

  /* Closing the camera without taking a photo. */
  function cancelCamera() {
    stopCamera();
    setMessage(
      photoData ? "Photo kept — adjust it or retake." : ""
    );
  }

  function startCountdown() {
    if (!streamRef.current || countdownTimerRef.current) return;

    let number = COUNTDOWN_START;
    setCountdown(number);

    countdownTimerRef.current = setInterval(() => {
      number -= 1;

      if (number > 0) {
        setCountdown(number);
        return;
      }

      clearInterval(countdownTimerRef.current);
      setCountdown(COUNTDOWN_SMILE_TEXT);

      countdownTimerRef.current = setTimeout(() => {
        countdownTimerRef.current = null;
        capturePhoto();
        setCountdown(null);
      }, COUNTDOWN_SMILE_MS);
    }, COUNTDOWN_TICK_MS);
  }

  function triggerFlash() {
    setFlash(true);
    broadcast(LIVE_EVENT.FLASH);

    clearTimeout(flashTimerRef.current);
    flashTimerRef.current = setTimeout(() => setFlash(false), 650);
  }

  /*
   * Grabs the exact region the live camera slot shows: a center
   * crop of the video matching the torn-paper opening's aspect.
   *
   * The frame is kept as a canvas and passed to the compositor
   * as-is — no JPEG encode/decode round-trip — so the new photo is
   * painted the moment state commits. The live view stays in the
   * slot until then (the render effect closes the camera), so the
   * previous photo is never shown in between.
   */
  function capturePhoto() {
    const video = videoRef.current;

    if (!video || video.readyState < 2) {
      setMessage("Camera is still loading. Please try again.");
      return;
    }

    /* Reuse one offscreen canvas so captures stay allocation-free. */
    if (!captureRef.current.canvas) {
      captureRef.current.canvas = document.createElement("canvas");
    }

    const canvas = captureRef.current.canvas;
    canvas.width = CAPTURE_SIZE.width;
    canvas.height = CAPTURE_SIZE.height;

    const ctx = canvas.getContext("2d");

    ctx.save();

    /* Mirror selfies only; the back camera stays true to life. */
    if (facingRef.current === "user") {
      ctx.translate(canvas.width, 0);
      ctx.scale(-1, 1);
    }

    const targetRatio = canvas.width / canvas.height;
    const { sx, sy, sw, sh } = getCoverCrop(
      video.videoWidth,
      video.videoHeight,
      targetRatio
    );

    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

    ctx.restore();

    /*
     * Unique identity for this capture. Changing it re-renders the
     * composite, and two shots can never collide.
     */
    captureSeqRef.current += 1;
    const token = `capture-${captureSeqRef.current}`;
    captureRef.current.token = token;

    /* Ask the render effect to share the finished composite. */
    shareCompositeRef.current = true;

    /*
     * Leave the camera running for now: the render effect closes it
     * right after the fresh composite is on the canvas. The timer is
     * a safety net so the booth can never get stuck mid-capture.
     */
    pendingCameraStopRef.current = true;
    clearTimeout(pendingStopTimerRef.current);
    pendingStopTimerRef.current = setTimeout(() => {
      if (!pendingCameraStopRef.current) return;
      pendingCameraStopRef.current = false;
      stopCamera();
    }, 1500);

    setPhotoData(token);
    setUploadedName("");
    resetPhotoPosition();
    setPlaceMode(false);
    setMessage("Photo captured!");

    triggerFlash();
  }

  /*
   * ----------------------------------------------------------
   * UPLOAD
   * ----------------------------------------------------------
   */
  function onUpload(event) {
    const file = event.target.files?.[0];

    if (!file) return;

    const reader = new FileReader();

    reader.onload = () => {
      setPhotoData(reader.result);
      setUploadedName(file.name);
      resetPhotoPosition();
      setPlaceMode(false);
      setMessage("Photo imported. Place it in the frame!");
    };

    reader.readAsDataURL(file);

    /* Allows selecting the same file again later. */
    event.target.value = "";
  }

  /*
   * ----------------------------------------------------------
   * PHOTO CONTROLS
   * ----------------------------------------------------------
   */
  function resetPhotoPosition() {
    setPhotoX(0);
    setPhotoY(0);
    setPhotoScale(1);
  }

  function resetEdits() {
    setBrightness(100);
    setContrast(100);
    setSaturation(100);
    setRotation(0);
    setFlipX(false);
    resetPhotoPosition();
  }

  function clearPhoto() {
    captureRef.current.token = null;

    setPhotoData(null);
    setUploadedName("");
    resetEdits();
    setPlaceMode(false);
    setMessage("Photo deleted.");
    setLastSavedSignature("");
  }

  /*
   * ----------------------------------------------------------
   * DIRECT TOUCH / MOUSE PHOTO CONTROL
   * (only active while REPOSITION mode is on)
   * ----------------------------------------------------------
   */
  function getPointerDistance(p1, p2) {
    return Math.hypot(p1.x - p2.x, p1.y - p2.y);
  }

  function handlePointerDown(event) {
    if (!photoData || !placeMode || cameraOpen || showGallery) return;

    event.currentTarget.setPointerCapture?.(event.pointerId);

    const gesture = gestureRef.current;

    gesture.pointers.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });

    /* One finger / mouse = move. */
    if (gesture.pointers.size === 1) {
      gesture.startX = event.clientX;
      gesture.startY = event.clientY;
      gesture.startPhotoX = photoX;
      gesture.startPhotoY = photoY;
      gesture.dragging = true;
    }

    /* Two fingers = pinch resize. */
    if (gesture.pointers.size === 2) {
      const points = [...gesture.pointers.values()];

      gesture.startDistance = getPointerDistance(points[0], points[1]);
      gesture.startScale = photoScale;
    }
  }

  function handlePointerMove(event) {
    if (!placeMode) return;

    const gesture = gestureRef.current;

    if (!gesture.pointers.has(event.pointerId)) return;

    gesture.pointers.set(event.pointerId, {
      x: event.clientX,
      y: event.clientY,
    });

    if (gesture.pointers.size === 1 && gesture.dragging) {
      const dx = event.clientX - gesture.startX;
      const dy = event.clientY - gesture.startY;

      /* Convert screen movement to 2048-template movement. */
      const canvasElement = canvasRef.current;

      if (!canvasElement) return;

      const scale =
        TEMPLATE_SIZE / canvasElement.getBoundingClientRect().width;

      setPhotoX(gesture.startPhotoX + dx * scale);
      setPhotoY(gesture.startPhotoY + dy * scale);
    }

    if (gesture.pointers.size === 2) {
      const points = [...gesture.pointers.values()];
      const distance = getPointerDistance(points[0], points[1]);

      if (gesture.startDistance > 0) {
        const ratio = distance / gesture.startDistance;

        setPhotoScale(
          clamp(
            gesture.startScale * ratio,
            MIN_PHOTO_SCALE,
            MAX_PHOTO_SCALE
          )
        );
      }
    }
  }

  function handlePointerUp(event) {
    const gesture = gestureRef.current;

    gesture.pointers.delete(event.pointerId);

    if (gesture.pointers.size === 0) {
      gesture.dragging = false;
    }

    if (gesture.pointers.size === 1) {
      const remaining = [...gesture.pointers.values()][0];

      gesture.startX = remaining.x;
      gesture.startY = remaining.y;
      gesture.startPhotoX = photoX;
      gesture.startPhotoY = photoY;
      gesture.dragging = true;
    }
  }

  function handleWheel(event) {
    if (!photoData || !placeMode || cameraOpen || showGallery) return;

    event.preventDefault();

    const amount = event.deltaY > 0 ? -0.06 : 0.06;

    setPhotoScale((current) =>
      clamp(current + amount, MIN_PHOTO_SCALE, MAX_PHOTO_SCALE)
    );
  }

  /*
   * ----------------------------------------------------------
   * CANVAS RENDERING
   * ----------------------------------------------------------
   */
  function drawComposite(onDone) {
    const photo = photoRef.current || new Image();
    photoRef.current = photo;

    /*
     * A fresh capture is still an offscreen canvas: hand it over so
     * the compositor paints it immediately instead of waiting for a
     * JPEG data URL to decode. Uploads keep using the reusable Image.
     */
    const freshCapture =
      captureRef.current.token !== null &&
      captureRef.current.token === photoData
        ? captureRef.current.canvas
        : null;

    renderComposite({
      canvas: canvasRef.current,
      frame: frameRef.current,
      mask: maskRef.current,
      photo,
      photoDrawable: freshCapture,
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
    });
  }

  /*
   * ----------------------------------------------------------
   * EXPORT / DOWNLOAD / SAVE
   * ----------------------------------------------------------
   */
  function exportCanvas(callback) {
    drawComposite((canvas) => {
      canvas?.toBlob(
        (blob) => {
          if (blob) callback(blob, canvas);
        },
        "image/png",
        1
      );
    });
  }

  function downloadCurrentPhoto() {
    if (!photoData) return;

    exportCanvas((blob) => {
      downloadBlob(blob, `photobooth-${Date.now()}.png`);
      setMessage("Photo downloaded to your device.");
    });
  }

  function getCompositionSignature() {
    return JSON.stringify({
      photoData,
      photoX,
      photoY,
      photoScale,
      brightness,
      contrast,
      saturation,
      rotation,
      flipX,
    });
  }

  async function saveToDatabase() {
    if (!photoData) {
      setMessage("Take or upload a photo first.");
      return;
    }

    const signature = getCompositionSignature();

    /* Frontend duplicate protection. */
    if (lastSavedSignature === signature) {
      setMessage("This exact photo is already saved.");
      return;
    }

    setSaving(true);

    exportCanvas(async (blob, canvas) => {
      try {
        const base64 = await blobToDataURL(blob);
        const data = await savePhoto(
          base64,
          uploadedName || "camera-photo",
          createThumbnailDataURL(canvas)
        );

        await loadSavedPhotos();

        /*
         * Hand the booth back to the next guest right away: the
         * photo lives on in SAVED PHOTOS, and the live camera comes
         * back up so everyone can see the booth is ready for the
         * next session (remote live screens follow the camera state).
         */
        const savedLabel = data.duplicate
          ? "Already in Saved Photos."
          : "Saved!";
        const readyMessage = data.duplicate
          ? "Already in Saved Photos — camera ready for the next photo."
          : "Saved! Camera ready for the next photo.";

        clearPhoto();

        /* Keep the duplicate guard for this composition alive. */
        setLastSavedSignature(signature);

        setMessage(`${savedLabel} Getting the camera ready…`);

        if (streamRef.current) {
          /* A live camera is already running — keep it as is. */
          setMessage(readyMessage);
        } else {
          await openCamera(cameraFacing, { successMessage: readyMessage });

          /* Camera refused: keep the save confirmation on screen. */
          if (!streamRef.current) setMessage(savedLabel);
        }
      } catch (error) {
        console.error(error);

        /* fetch() rejects with a TypeError when the API cannot be
           reached at all (wrong URL, sleeping service, offline). */
        const detail =
          error instanceof TypeError
            ? "The backend could not be reached — check the API URL and that the service is awake."
            : error.message;

        setMessage(`Could not save the photo. ${detail}`);
      } finally {
        setSaving(false);
      }
    });
  }

  /*
   * ----------------------------------------------------------
   * GALLERY HANDLERS
   * ----------------------------------------------------------
   */
  function togglePhotoSelection(id) {
    setSelectedPhotos((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id]
    );
  }

  function selectAllPhotos() {
    setSelectedPhotos(savedPhotos.map((photo) => photo.id));
  }

  function clearSelection() {
    setSelectedPhotos([]);
  }

  async function deleteSavedPhoto(id) {
    try {
      await deletePhoto(id);

      setSelectedPhotos((current) =>
        current.filter((item) => item !== id)
      );

      await loadSavedPhotos();
      setMessage("Saved photo deleted.");
    } catch {
      setMessage("Could not delete the saved photo.");
    }
  }

  async function deleteSelectedPhotos() {
    if (selectedPhotos.length === 0) return;

    const confirmed = window.confirm(
      `Delete ${selectedPhotos.length} selected photo(s)?`
    );

    if (!confirmed) return;

    for (const id of selectedPhotos) {
      try {
        await deletePhoto(id);
      } catch {
        /* Continue deleting remaining items. */
      }
    }

    setSelectedPhotos([]);
    await loadSavedPhotos();
    setMessage("Selected photos deleted.");
  }

  function downloadSavedPhoto(photo) {
    const link = document.createElement("a");
    link.href = photo.image_url;
    link.download = `photobooth-saved-${photo.id}.png`;
    link.target = "_blank";
    link.click();
  }

  function downloadSelectedPhotos() {
    const selected = savedPhotos.filter((photo) =>
      selectedPhotos.includes(photo.id)
    );

    if (selected.length === 0) return;

    selected.forEach((photo, index) => {
      setTimeout(() => downloadSavedPhoto(photo), index * 250);
    });
  }

  /*
   * ----------------------------------------------------------
   * LIVE SCREEN LAUNCHER
   * ----------------------------------------------------------
   */
  function handleOpenLiveScreen() {
    openLiveScreen();
    setSettingsOpen(false);
    setMessage("Live screen opened on the second display.");
  }

  /*
   * ----------------------------------------------------------
   * RENDER: SAVED PHOTOS SCREEN
   * ----------------------------------------------------------
   */
  if (showGallery) {
    return (
      <GalleryPage
        photos={savedPhotos}
        selectedPhotos={selectedPhotos}
        onToggle={togglePhotoSelection}
        onSelectAll={selectAllPhotos}g
        onClearSelection={clearSelection}
        onDownloadSelected={downloadSelectedPhotos}
        onDeleteSelected={deleteSelectedPhotos}
        onDownloadPhoto={downloadSavedPhoto}
        onDeletePhoto={deleteSavedPhoto}
        onBack={() => {
          setShowGallery(false);
          setSelectedPhotos([]);
        }}
      />
    );
  }

  /*
   * ----------------------------------------------------------
   * RENDER: BOOTH
   * ----------------------------------------------------------
   */
  const slotMaskStyle = {
    "--slot-mask-url": `url(${import.meta.env.BASE_URL}photo-mask.webp)`,
    "--slot-x": pctOfTemplate(PHOTO_SLOT.x),
    "--slot-y": pctOfTemplate(PHOTO_SLOT.y),
    "--slot-w": pctOfTemplate(PHOTO_SLOT.width),
    "--slot-h": pctOfTemplate(PHOTO_SLOT.height),
  };

  const canPlace = photoData && !cameraOpen;

  return (
    <div className={cameraOpen ? "app-shell session" : "app-shell"}>
      <header className="topbar">
        <div className="topbar-brand">
          <div className="eyebrow">
            BATANGAS STATE UNIVERSITY • BALAYAN CAMPUS
          </div>
          <h1>Office of Guidance and Counseling</h1>
        </div>

        <div className="topbar-actions">
          {cameraOpen && (
            <div className="status-pill">
              <span className="dot live" />
              Camera live
            </div>
          )}

          <button
            type="button"
            className="icon-button"
            onClick={onHome}
            aria-label="Back to the start screen"
          >
            <Icon name="home" />
          </button>

          <div className="settings" ref={settingsRef}>
            <button
              type="button"
              className="icon-button"
              onClick={() => setSettingsOpen((open) => !open)}
              aria-label="Booth settings"
              aria-expanded={settingsOpen}
            >
              <Icon name="settings" />
            </button>

            {settingsOpen && (
              <SettingsMenu
                rotation={rotation}
                brightness={brightness}
                contrast={contrast}
                saturation={saturation}
                onRotation={setRotation}
                onBrightness={setBrightness}
                onContrast={setContrast}
                onSaturation={setSaturation}
                photoData={photoData}
                flipX={flipX}
                onResetEdits={resetEdits}
                onCenterPhoto={resetPhotoPosition}
                onFlipPhoto={() => setFlipX(!flipX)}
                onViewGallery={() => {
                  setShowGallery(true);
                  setSettingsOpen(false);
                }}
                onOpenLiveScreen={handleOpenLiveScreen}
              />
            )}
          </div>
        </div>
      </header>

      <main className="layout">
        <section className="booth-card">
          <div className="booth-stage">
            <div
              className={
                canPlace && placeMode ? "preview-wrap placing" : "preview-wrap"
              }
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
              onWheel={handleWheel}
            >
              <canvas ref={canvasRef} className="final-canvas" />

              {!templateReady && (
                <div className="loading">Loading template…</div>
              )}

              {cameraOpen && (
                <div className="camera-overlay">
                  <div className="camera-slot-mask" style={slotMaskStyle}>
                    <video
                      ref={attachVideoRef}
                      className={cameraFacing === "user" ? "mirrored" : undefined}
                      autoPlay
                      playsInline
                      muted
                    />
                  </div>

                  {countdown !== null && (
                    <div
                      className={
                        countdown === COUNTDOWN_SMILE_TEXT
                          ? "countdown smile"
                          : "countdown"
                      }
                      key={String(countdown)}
                    >
                      {countdown}
                    </div>
                  )}

                  <div className="camera-note">Look at the camera</div>
                </div>
              )}

              {flash && <div className="flash-overlay" />}
            </div>

            {canPlace && placeMode && (
              <div className="gesture-hint">
                <Icon name="move" size={16} />
                Drag to move
                <span>•</span>
                Pinch or scroll to resize
              </div>
            )}
          </div>

          {cameraOpen && (
            <div className="camera-controls">
              <button
                type="button"
                className="camera-round"
                onClick={cancelCamera}
                aria-label="Cancel camera"
              >
                <Icon name="close" />
              </button>

              <button
                type="button"
                className="camera-shutter"
                onClick={startCountdown}
                disabled={countdown !== null}
                aria-label="Take the photo"
              >
                <Icon name="camera" size={30} />
              </button>

              <button
                type="button"
                className="camera-round"
                onClick={switchCamera}
                disabled={countdown !== null}
                aria-label="Flip camera"
              >
                <Icon name="refresh" />
              </button>
            </div>
          )}

          <div className="booth-panel">
            {message && <div className="message">{message}</div>}

            {cameraError && <div className="error">{cameraError}</div>}

            <div className="main-actions">
              {!cameraOpen && (
                <button className="primary" onClick={() => openCamera()}>
                  <Icon name={photoData ? "refresh" : "camera"} size={18} />
                  {photoData ? "RETAKE PHOTO" : "TAKE PHOTO"}
                </button>
              )}

              <label className="button secondary">
                <Icon name="upload" size={18} />
                UPLOAD PHOTO
                <input
                  type="file"
                  accept="image/*"
                  onChange={onUpload}
                  hidden
                />
              </label>

              <button
                className="secondary"
                onClick={() => setShowGallery(true)}
              >
                <Icon name="image" size={18} />
                SAVED PHOTOS
              </button>

              {canPlace && (
                <button
                  className={placeMode ? "primary" : "secondary"}
                  onClick={() => setPlaceMode((mode) => !mode)}
                >
                  <Icon name={placeMode ? "check" : "move"} size={18} />
                  {placeMode ? "DONE PLACING" : "REPOSITION PHOTO"}
                </button>
              )}

              {photoData && (
                <>
                  <button
                    className="secondary"
                    onClick={downloadCurrentPhoto}
                  >
                    <Icon name="download" size={18} />
                    DOWNLOAD
                  </button>

                  <button
                    className="primary"
                    onClick={saveToDatabase}
                    disabled={saving}
                  >
                    <Icon name="save" size={18} />
                    {saving ? "SAVING…" : "SAVE"}
                  </button>

                  <button className="danger" onClick={clearPhoto}>
                    <Icon name="trash" size={18} />
                    DELETE
                  </button>
                </>
              )}
            </div>
          </div>
        </section>
      </main>

      <footer>Batangas Photo Booth • 2048 × 2048</footer>
    </div>
  );
}
