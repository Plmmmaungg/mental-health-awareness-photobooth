import express from "express";
import cors from "cors";
import crypto from "crypto";
import mysql from "mysql2/promise";
import { v2 as cloudinary } from "cloudinary";

const app = express();

const PORT = Number(process.env.PORT || 5000);
const MAX_BODY_SIZE = process.env.MAX_BODY_SIZE || "15mb";

const allowedOrigins = (process.env.CORS_ORIGIN || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      // Allow non-browser/server-to-server requests and local development.
      if (!origin) return callback(null, true);
      if (
        allowedOrigins.length === 0 ||
        allowedOrigins.includes("*") ||
        allowedOrigins.includes(origin) ||
        (process.env.NODE_ENV !== "production" &&
          /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin))
      ) {
        return callback(null, true);
      }
      return callback(new Error("CORS origin not allowed"));
    },
  })
);

app.use(express.json({ limit: MAX_BODY_SIZE }));
app.use(express.urlencoded({ extended: true, limit: MAX_BODY_SIZE }));

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: Number(process.env.DB_CONNECTION_LIMIT || 10),
  queueLimit: 0,
  ssl:
    String(process.env.DB_SSL || "").toLowerCase() === "true"
      ? { rejectUnauthorized: false }
      : undefined,
});

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const clients = new Set();

function makeFilename() {
  const now = new Date();
  const stamp = now.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  return `photo_${stamp}_${crypto.randomBytes(4).toString("hex")}.png`;
}

function stripDataUrl(data) {
  if (typeof data !== "string") return null;
  const match = data.match(/^data:image\/(?:png|jpeg|jpg|webp);base64,(.+)$/i);
  return match ? match[1] : data;
}

function dataUrlMime(data) {
  const match = typeof data === "string" && data.match(/^data:(image\/[^;]+);base64,/i);
  return match ? match[1] : "image/png";
}

async function uploadToCloudinary(imageData, filename) {
  const base64 = stripDataUrl(imageData);
  if (!base64) throw new Error("Invalid image data");

  const mime = dataUrlMime(imageData);
  const dataUri = `data:${mime};base64,${base64}`;

  return cloudinary.uploader.upload(dataUri, {
    folder: process.env.CLOUDINARY_FOLDER || "mental-health-photobooth",
    public_id: filename.replace(/\.[^.]+$/, ""),
    resource_type: "image",
  });
}

function broadcast(event, payload) {
  const message = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
  for (const client of clients) {
    try {
      client.res.write(message);
    } catch {
      clients.delete(client);
    }
  }
}

app.get("/api/health", async (_req, res) => {
  try {
    await pool.query("SELECT 1");
    res.json({
      ok: true,
      message: "JavaScript backend and MySQL are connected.",
      storage: "cloudinary",
    });
  } catch (error) {
    console.error("Health check failed:", error);
    res.status(500).json({
      ok: false,
      message: "Backend is running, but MySQL is not connected.",
    });
  }
});

app.get("/api/photos", async (_req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT id, filename, original_name, image_hash,
             cloudinary_public_id, cloudinary_url, created_at
      FROM photos
      ORDER BY created_at DESC
    `);
    res.json(rows);
  } catch (error) {
    console.error("GET /api/photos failed:", error);
    res.status(500).json({ error: "Failed to load photos." });
  }
});

app.get("/api/photos/:id", async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, filename, original_name, image_hash,
              cloudinary_public_id, cloudinary_url, created_at
       FROM photos WHERE id = ? LIMIT 1`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ error: "Photo not found." });
    res.json(rows[0]);
  } catch (error) {
    console.error("GET /api/photos/:id failed:", error);
    res.status(500).json({ error: "Failed to load photo." });
  }
});

app.post("/api/photos", async (req, res) => {
  try {
    const image = req.body?.image || req.body?.data || req.body?.imageData;
    const originalName = req.body?.original_name || req.body?.originalName || null;
    const imageHash = req.body?.image_hash || req.body?.imageHash || null;

    if (!image) {
      return res.status(400).json({ error: "Image data is required." });
    }

    const filename = makeFilename();
    const uploaded = await uploadToCloudinary(image, filename);

    const [result] = await pool.query(
      `INSERT INTO photos
       (filename, original_name, image_hash, cloudinary_public_id, cloudinary_url)
       VALUES (?, ?, ?, ?, ?)`,
      [
        filename,
        originalName,
        imageHash,
        uploaded.public_id,
        uploaded.secure_url,
      ]
    );

    const photo = {
      id: result.insertId,
      filename,
      original_name: originalName,
      image_hash: imageHash,
      cloudinary_public_id: uploaded.public_id,
      cloudinary_url: uploaded.secure_url,
      created_at: new Date().toISOString(),
    };

    broadcast("photo", photo);
    broadcast("photos", photo);

    res.status(201).json(photo);
  } catch (error) {
    console.error("POST /api/photos failed:", error);
    res.status(500).json({
      error: "Failed to save photo.",
      detail:
        process.env.NODE_ENV === "production"
          ? undefined
          : error?.message,
    });
  }
});

app.delete("/api/photos/:id", async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT cloudinary_public_id FROM photos WHERE id = ? LIMIT 1`,
      [req.params.id]
    );

    if (!rows.length) {
      return res.status(404).json({ error: "Photo not found." });
    }

    const publicId = rows[0].cloudinary_public_id;
    if (publicId) {
      try {
        await cloudinary.uploader.destroy(publicId, { resource_type: "image" });
      } catch (cloudError) {
        console.error("Cloudinary delete failed:", cloudError);
      }
    }

    await pool.query("DELETE FROM photos WHERE id = ?", [req.params.id]);
    broadcast("delete", { id: Number(req.params.id) });

    res.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/photos/:id failed:", error);
    res.status(500).json({ error: "Failed to delete photo." });
  }
});

app.get("/api/live/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders?.();

  const client = { res };
  clients.add(client);

  res.write(`event: connected\ndata: ${JSON.stringify({ ok: true })}\n\n`);

  const heartbeat = setInterval(() => {
    try {
      res.write(`: heartbeat ${Date.now()}\n\n`);
    } catch {
      clearInterval(heartbeat);
      clients.delete(client);
    }
  }, 25000);

  req.on("close", () => {
    clearInterval(heartbeat);
    clients.delete(client);
  });
});

app.get("/", (_req, res) => {
  res.json({
    name: "Mental Health Awareness Photobooth API",
    ok: true,
  });
});

app.use((err, _req, res, _next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error." });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Backend listening on port ${PORT}`);
});
