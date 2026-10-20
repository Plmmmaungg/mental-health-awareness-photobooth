import React, { useEffect } from "react";

import { installZoomGuards } from "../lib/zoom";
import Icon from "./Icon";

/*
 * Hero / landing screen shown before the booth starts.
 */
export default function LandingPage({ onStart, onOpenGallery, onOpenLiveScreen }) {
  useEffect(() => installZoomGuards(), []);

  return (
    <div className="app-shell landing">
      <header className="landing-hero">
        <div className="landing-copy">
          <div className="eyebrow">
            BATANGAS STATE UNIVERSITY • BALAYAN
          </div>
          <h1>Office of Guidance and Counseling</h1>

          <p className="landing-tagline">
            Strike a pose, follow the countdown, and take home a framed
            keepsake — captured live and printed into the booth template.
          </p>

          <div className="landing-actions">
            <button className="primary landing-start" onClick={onStart}>
              <Icon name="camera" size={20} />
              START PHOTO SESSION
            </button>

            <button className="secondary" onClick={onOpenGallery}>
              <Icon name="image" size={20} />
              SAVED PHOTOS
            </button>

            <button className="secondary" onClick={onOpenLiveScreen}>
              <Icon name="monitor" size={20} />
              OPEN LIVE SCREEN
            </button>
          </div>
        </div>

        <div className="landing-art">
          <img
            src={`${import.meta.env.BASE_URL}template.webp`}
            alt="Photo booth template preview"
          />
        </div>
      </header>

      <section className="landing-steps">
        <div className="landing-step">
          <div className="landing-step-icon">
            <Icon name="camera" size={22} />
          </div>
          <h3>Pose</h3>
          <p>
            The live camera shows exactly what the finished photo will
            capture.
          </p>
        </div>

        <div className="landing-step">
          <div className="landing-step-icon">
            <Icon name="timer" size={22} />
          </div>
          <h3>Smile</h3>
          <p>Press the shutter and count down from three — flash!</p>
        </div>

        <div className="landing-step">
          <div className="landing-step-icon">
            <Icon name="save" size={22} />
          </div>
          <h3>Keep it</h3>
          <p>
            Adjust the placement, then save it to the gallery or
            download it.
          </p>
        </div>
      </section>

      <footer>Batangas Photo Booth • 2048 × 2048</footer>
    </div>
  );
}
