import React from "react";

import Icon from "./Icon";

/*
 * Saved photos screen. Pure presentation: all data and handlers
 * are supplied by the booth page.
 */
export default function GalleryPage({
  photos,
  selectedPhotos,
  onToggle,
  onSelectAll,
  onClearSelection,
  onDownloadSelected,
  onDeleteSelected,
  onDownloadPhoto,
  onDeletePhoto,
  onBack,
}) {
  const selectedCount = selectedPhotos.length;

  return (
    <div className="gallery-page">
      <header className="gallery-header">
        <div>
          <div className="eyebrow">BATANGAS STATE UNIVERSITY</div>
          <h1>Saved Photos</h1>
          <p className="gallery-subtitle">
            Select photos to download or delete.
          </p>
        </div>

        <button className="primary" onClick={onBack}>
          ← BACK TO CAMERA
        </button>
      </header>

      <main className="saved-gallery">
        <div className="gallery-toolbar">
          <div>
            <strong>{photos.length}</strong> saved photo
            {photos.length !== 1 ? "s" : ""}
          </div>

          <div className="gallery-toolbar-actions">
            <button
              className="secondary"
              onClick={onSelectAll}
              disabled={photos.length === 0}
            >
              SELECT ALL
            </button>

            <button
              className="secondary"
              onClick={onClearSelection}
              disabled={selectedCount === 0}
            >
              CLEAR
            </button>

            <button
              className="primary"
              onClick={onDownloadSelected}
              disabled={selectedCount === 0}
            >
              DOWNLOAD SELECTED
            </button>

            <button
              className="danger"
              onClick={onDeleteSelected}
              disabled={selectedCount === 0}
            >
              DELETE SELECTED
            </button>
          </div>
        </div>

        {photos.length === 0 ? (
          <div className="empty-gallery">
            <div className="empty-icon">
              <Icon name="image" size={54} />
            </div>
            <h2>No saved photos yet</h2>
            <p>Take a photo and save it to see it here.</p>
          </div>
        ) : (
          <div className="saved-grid">
            {photos.map((photo) => {
              const selected = selectedPhotos.includes(photo.id);

              return (
                <div
                  className={`saved-card ${selected ? "selected" : ""}`}
                  key={photo.id}
                  onClick={() => onToggle(photo.id)}
                >
                  <div className="saved-image-wrap">
                    <img
                      src={photo.thumb_url || photo.image_url}
                      alt="Saved photobooth"
                      loading="lazy"
                      decoding="async"
                    />
                    <div className="selection-check">
                      {selected && <Icon name="check" size={16} />}
                    </div>
                    <div className="saved-number">#{photo.id}</div>
                  </div>

                  <div className="saved-card-actions">
                    <button
                      className="secondary small"
                      onClick={(event) => {
                        event.stopPropagation();
                        onDownloadPhoto(photo);
                      }}
                    >
                      DOWNLOAD
                    </button>

                    <button
                      className="danger small"
                      onClick={(event) => {
                        event.stopPropagation();
                        onDeletePhoto(photo.id);
                      }}
                    >
                      DELETE
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
