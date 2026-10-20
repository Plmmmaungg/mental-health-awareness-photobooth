import React, { useCallback, useEffect, useRef, useState } from "react";

import { COUNTDOWN_SMILE_TEXT, PHOTO_SLOT, pctOfTemplate } from "../config";
import {
  createLiveChannel,
  LIVE_EVENT,
  LIVE_RELAY_URL,
} from "../lib/liveChannel";
import { attachStreamToVideo, isIOS, requestCameraStream, stopStream } from "../lib/media";
import { installZoomGuards } from "../lib/zoom";
import Icon from "./Icon";

/*
 * Second-screen view (open with ?screen=live).
 *
 * Mirrors the booth on the template artwork: live camera inside the
 * torn-paper slot, 3-2-1 countdown, flash and the finished composite
 * after each shot.
 *
 * Two sources feed this screen:
 * - BroadcastChannel, when the booth runs in the same browser.
 * - The backend relay (Server-Sent Events), when the booth runs on
 *   another device — e.g. the phone is the camera and the laptop is
 *   the big screen. A remote booth keeps its camera on the phone, so
 *   this screen shows the frame, countdown and finished photo without
 *   opening a camera of its own.
 */
export default function LiveScreen() {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const flashTimerRef = useRef(null);
  const frameTimerRef = useRef(null);

  /* Booth ids that already reach this screen through BroadcastChannel. */
  const localBoothIdsRef = useRef(new Set());

  const [boothOpen, setBoothOpen] = useState(false);
  const [remoteBooth, setRemoteBooth] = useState(false);
  const [facing, setFacing] = useState("user");
  const [countdown, setCountdown] = useState(null);
  const [photo, setPhoto] = useState(null);
  const [liveFrame, setLiveFrame] = useState(null);
  const [flash, setFlash] = useState(false);
  const [cameraError, setCameraError] = useState("");

  /*
   * Set from the flash until the finished composite arrives. The
   * booth closes its camera first and the composite (encode + relay)
   * lands a moment later, so this keeps the board — with the last
   * live frame — on screen instead of the previous photo.
   */
  const [pendingCapture, setPendingCapture] = useState(false);
  const captureTimerRef = useRef(null);

  /* Stable callback ref: attach the stream as soon as the video mounts. */
  const attachVideoRef = useCallback((element) => {
    videoRef.current = element;
    attachStreamToVideo(element, streamRef.current);
  }, []);

  /* Applies one booth event from either source. */
  const applyEvent = useCallback((data, remote) => {
    switch (data.type) {
      case LIVE_EVENT.CAMERA:
        setBoothOpen(Boolean(data.open));
        setRemoteBooth(remote && Boolean(data.open));

        /*
         * Fresh session: the slot stays empty until frames arrive.
         * The last frame is kept while the camera is closing, so it
         * can stand in for the finished composite (see FLASH below).
         */
        if (data.open) {
          setLiveFrame(null);
          clearTimeout(frameTimerRef.current);

          /* A new session is not waiting on a previous capture. */
          setPendingCapture(false);
          clearTimeout(captureTimerRef.current);
        }

        if (data.facing === "user" || data.facing === "environment") {
          setFacing(data.facing);
        }
        break;

      case LIVE_EVENT.COUNTDOWN:
        setCountdown(data.value ?? null);
        break;

      case LIVE_EVENT.FRAME:
        if (data.frame) {
          setLiveFrame(data.frame);

          /* Frames run ~6/s; a gap means the stream stopped. */
          clearTimeout(frameTimerRef.current);
          frameTimerRef.current = setTimeout(() => setLiveFrame(null), 1500);
        }
        break;

      case LIVE_EVENT.FLASH:
        setFlash(true);
        clearTimeout(flashTimerRef.current);
        flashTimerRef.current = setTimeout(() => setFlash(false), 700);

        /*
         * Wait for the finished composite instead of dropping to the
         * last saved photo: the camera closes before the composite is
         * encoded and relayed, and on a retake that gap would show
         * the previous photo. The timer is a safety net.
         */
        setPendingCapture(true);
        clearTimeout(frameTimerRef.current);
        clearTimeout(captureTimerRef.current);
        captureTimerRef.current = setTimeout(
          () => setPendingCapture(false),
          6000
        );
        break;

      case LIVE_EVENT.CAPTURED:
        clearTimeout(captureTimerRef.current);
        setPendingCapture(false);

        if (data.photo) setPhoto(data.photo);
        break;

      default:
        break;
    }
  }, []);

  useEffect(() => {
    document.title = "Photo Booth — Live Screen";
  }, []);

  /* Page-level zoom stays locked, even on the display window. */
  useEffect(() => installZoomGuards(), []);

  /* One-time cleanup for the event timers. */
  useEffect(
    () => () => {
      clearTimeout(flashTimerRef.current);
      clearTimeout(frameTimerRef.current);
      clearTimeout(captureTimerRef.current);
    },
    []
  );

  /* Same-browser events. */
  useEffect(() => {
    const channel = createLiveChannel();

    if (!channel) return undefined;

    const handleMessage = (event) => {
      const data = event.data || {};

      /*
       * Remember which booths live in this browser, so relayed echoes
       * of their events can be skipped below.
       */
      if (data.boothId) localBoothIdsRef.current.add(data.boothId);

      applyEvent(data, false);
    };

    channel.addEventListener("message", handleMessage);

    /* Ask the booth for its current state (covers opening late). */
    channel.postMessage({ type: LIVE_EVENT.REQUEST });

    return () => {
      channel.removeEventListener("message", handleMessage);
      channel.close();
    };
  }, [applyEvent]);

  /* Cross-device events (phone booth -> laptop screen). */
  useEffect(() => {
    if (typeof EventSource === "undefined") return undefined;

    const source = new EventSource(`${LIVE_RELAY_URL}/stream`);

    source.onmessage = (event) => {
      let data;

      try {
        data = JSON.parse(event.data);
      } catch {
        return;
      }

      /* Skip echoes; BroadcastChannel already handled them. */
      if (data.boothId && localBoothIdsRef.current.has(data.boothId)) return;

      applyEvent(data, true);
    };

    /* EventSource reconnects on its own; a failed attempt is not news. */
    source.onerror = () => {};

    return () => source.close();
  }, [applyEvent]);

  /* Local camera preview while a same-browser booth has its camera open. */
  useEffect(() => {
    if (!boothOpen || remoteBooth) {
      stopStream(streamRef.current);
      streamRef.current = null;

      if (videoRef.current?.srcObject) {
        videoRef.current.srcObject = null;
      }

      return undefined;
    }

    /*
     * Every browser on iOS uses WebKit, which only allows one active
     * camera at a time — this screen must not fight the booth for it.
     * Countdown, flash and the finished photo still appear here.
     */
    if (isIOS()) {
      setCameraError("Live camera preview is shown on the booth screen.");
      return undefined;
    }

    let cancelled = false;
    setCameraError("");

    requestCameraStream(facing)
      .then((stream) => {
        if (cancelled) {
          stopStream(stream);
          return;
        }

        streamRef.current = stream;
        attachStreamToVideo(videoRef.current, stream);
      })
      .catch(() => {
        if (!cancelled) {
          setCameraError(
            "Camera preview unavailable on this screen — the booth still works."
          );
        }
      });

    return () => {
      cancelled = true;
      stopStream(streamRef.current);
      streamRef.current = null;
    };
  }, [boothOpen, facing, remoteBooth]);

  /*
   * Stay on the board while a capture is being finished: the booth
   * closes its camera before the fresh composite arrives, and the
   * last saved photo must not be shown in that gap.
   */
  const showBoard = boothOpen || pendingCapture;
  const showPhoto = !showBoard && Boolean(photo);

  const frameUrl = `${import.meta.env.BASE_URL}frame.webp`;

  const slotMaskStyle = {
    "--slot-mask-url": `url(${import.meta.env.BASE_URL}photo-mask.webp)`,
    "--slot-x": pctOfTemplate(PHOTO_SLOT.x),
    "--slot-y": pctOfTemplate(PHOTO_SLOT.y),
    "--slot-w": pctOfTemplate(PHOTO_SLOT.width),
    "--slot-h": pctOfTemplate(PHOTO_SLOT.height),
  };

  return (
    <div className="live-screen">
      <header className="live-header">
        <div className="live-brand">
          <div className="eyebrow">
            BATANGAS STATE UNIVERSITY • BALAYAN
          </div>
          <h1>Photo Booth</h1>
        </div>

        <div className="live-badge">LIVE SCREEN</div>
      </header>

      <main className="live-stage">
        {showBoard ? (
          <div className="live-board">
            <img className="live-board-art" src={frameUrl} alt="" />

            {!remoteBooth && boothOpen && (
              <div className="camera-slot-mask" style={slotMaskStyle}>
                <video
                  ref={attachVideoRef}
                  className={facing === "user" ? "mirrored" : undefined}
                  autoPlay
                  playsInline
                  muted
                />
              </div>
            )}

            {remoteBooth && liveFrame && (
              <div className="camera-slot-mask" style={slotMaskStyle}>
                <img src={liveFrame} alt="" />
              </div>
            )}

            {/*
             * Waiting for the finished composite: hold the last live
             * frame in the slot so the previous photo never shows.
             */}
            {!boothOpen && pendingCapture && liveFrame && (
              <div className="camera-slot-mask" style={slotMaskStyle}>
                <img src={liveFrame} alt="" />
              </div>
            )}

            {boothOpen && !remoteBooth && cameraError && (
              <div className="live-note">{cameraError}</div>
            )}

            {remoteBooth && !liveFrame && countdown === null && (
              <div className="live-note">
                Connecting the live view from the booth phone — get ready to
                smile!
              </div>
            )}

            {countdown !== null && (
              <div
                className={
                  countdown === COUNTDOWN_SMILE_TEXT
                    ? "live-countdown smile"
                    : "live-countdown"
                }
                key={String(countdown)}
              >
                {countdown}
              </div>
            )}
          </div>
        ) : showPhoto ? (
          <div className="live-photo-wrap">
            <img src={photo} alt="Latest capture" className="live-photo" />
          </div>
        ) : (
          <div className="live-board live-board-idle">
            <img className="live-board-art" src={frameUrl} alt="" />

            <div className="live-idle">
              <div className="live-idle-icon">
                <Icon name="camera" size={52} strokeWidth={1.6} />
              </div>
              <h2>Step in front of the booth</h2>
              <p>The live camera appears here when the session starts.</p>
            </div>
          </div>
        )}

        {flash && <div className="live-flash" />}
      </main>

      <footer className="live-footer">
        {boothOpen
          ? "Look at the camera and smile!"
          : "Batangas State University • Balayan Campus"}
      </footer>
    </div>
  );
}
