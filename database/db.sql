CREATE DATABASE IF NOT EXISTS photobooth
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE photobooth;

CREATE TABLE IF NOT EXISTS photos (
  id INT UNSIGNED NOT NULL AUTO_INCREMENT,
  filename VARCHAR(255) NOT NULL,
  original_name VARCHAR(255) DEFAULT NULL,
  image_hash CHAR(64) DEFAULT NULL,
  cloudinary_public_id VARCHAR(255) DEFAULT NULL,
  cloudinary_url TEXT DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_photos_image_hash (image_hash)
);
