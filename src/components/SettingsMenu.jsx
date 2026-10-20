import React from "react";

import Icon from "./Icon";

/*
 * The booth settings dropdown (opened from the gear button).
 * Everything that used to sit in the always-visible controls card
 * now lives in here.
 */
export default function SettingsMenu({
  rotation,
  brightness,
  contrast,
  saturation,
  onRotation,
  onBrightness,
  onContrast,
  onSaturation,
  photoData,
  flipX,
  onResetEdits,
  onCenterPhoto,
  onFlipPhoto,
  onViewGallery,
  onOpenLiveScreen,
}) {
  const hasPhoto = Boolean(photoData);

  return (
    <div className="settings-menu" role="menu" aria-label="Booth settings">
      <div className="settings-section">
        <div className="settings-head">
          <span>
            <Icon name="sliders" size={16} />
            Photo edits
          </span>

          <button
            className="text-button"
            onClick={onResetEdits}
            disabled={!hasPhoto}
          >
            Reset
          </button>
        </div>

        {!hasPhoto && (
          <p className="settings-note">
            Take or upload a photo to use these edits.
          </p>
        )}

        <label>
          <span className="settings-label-head">
            Rotation
            <span className="settings-value">{rotation}°</span>
          </span>
          <input
            type="range"
            min="-180"
            max="180"
            step="1"
            value={rotation}
            disabled={!hasPhoto}
            onChange={(event) => onRotation(Number(event.target.value))}
          />
        </label>

        <label>
          <span className="settings-label-head">
            Brightness
            <span className="settings-value">{brightness}%</span>
          </span>
          <input
            type="range"
            min="50"
            max="150"
            step="1"
            value={brightness}
            disabled={!hasPhoto}
            onChange={(event) => onBrightness(Number(event.target.value))}
          />
        </label>

        <label>
          <span className="settings-label-head">
            Contrast
            <span className="settings-value">{contrast}%</span>
          </span>
          <input
            type="range"
            min="50"
            max="150"
            step="1"
            value={contrast}
            disabled={!hasPhoto}
            onChange={(event) => onContrast(Number(event.target.value))}
          />
        </label>

        <label>
          <span className="settings-label-head">
            Saturation
            <span className="settings-value">{saturation}%</span>
          </span>
          <input
            type="range"
            min="0"
            max="180"
            step="1"
            value={saturation}
            disabled={!hasPhoto}
            onChange={(event) => onSaturation(Number(event.target.value))}
          />
        </label>
      </div>

      <div className="settings-section">
        <div className="settings-head">
          <span>
            <Icon name="move" size={16} />
            Placement
          </span>
        </div>

        <div className="settings-row">
          <button
            className="secondary small"
            onClick={onCenterPhoto}
            disabled={!hasPhoto}
          >
            <Icon name="move" size={16} />
            CENTER
          </button>

          <button
            className="secondary small"
            onClick={onFlipPhoto}
            disabled={!hasPhoto}
          >
            <Icon name="refresh" size={16} />
            {flipX ? "UNFLIP" : "FLIP"}
          </button>
        </div>
      </div>

      <div className="settings-section">
        <div className="settings-head">
          <span>
            <Icon name="monitor" size={16} />
            Booth
          </span>
        </div>

        <button className="secondary full small" onClick={onViewGallery}>
          <Icon name="image" size={16} />
          VIEW SAVED PHOTOS
        </button>

        <button className="secondary full small" onClick={onOpenLiveScreen}>
          <Icon name="monitor" size={16} />
          OPEN LIVE SCREEN
        </button>
      </div>

      <div className="settings-section">
        <div className="settings-head">
          <span>
            <Icon name="help" size={16} />
            How it works
          </span>
        </div>

        <ol className="settings-steps">
          <li>
            <Icon name="camera" size={15} />
            Press TAKE PHOTO to open the camera.
          </li>
          <li>
            <Icon name="timer" size={15} />
            Use the shutter — 3, 2, 1, flash!
          </li>
          <li>
            <Icon name="move" size={15} />
            Tap REPOSITION PHOTO, then drag and pinch to place it.
          </li>
          <li>
            <Icon name="save" size={15} />
            Save it to the gallery or download it.
          </li>
        </ol>
      </div>
    </div>
  );
}
