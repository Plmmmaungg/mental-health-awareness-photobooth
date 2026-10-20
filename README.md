# Batangas Photo Booth — React + JavaScript Backend + XAMPP MySQL

This version uses:

- **React + JavaScript** for the frontend.
- **Node.js + Express** for the backend/API.
- **MySQL running inside XAMPP** for the database.
- **phpMyAdmin** only to manage/view the MySQL database.

PHP is **not** used by the application backend.

## Architecture

```text
React frontend
    ↓ HTTP / JSON
Node.js + Express backend (localhost:5000)
    ↓ MySQL connection
MySQL running in XAMPP (port 3307)
    ↑
phpMyAdmin manages the database
```

## Requirements

- Node.js 18 or newer
- XAMPP
- XAMPP MySQL running on port **3307**
- A modern browser with camera permission

## Database

Open `database/db.sql` in phpMyAdmin and import it. It creates:

- database: `photobooth`
- table: `photos`

The actual PNG files are stored by the Node.js backend in `backend/uploads/`; MySQL stores their filenames and metadata.

## Run locally

### Terminal 1 — backend

```bash
cd backend
npm install
npm start
```

The backend should say:

```text
Photobooth JavaScript backend running at http://localhost:5000
```

Test it at:

```text
http://localhost:5000/api/health
```

You should see a JSON message saying the JavaScript backend and MySQL are connected.

### Terminal 2 — React frontend

From the project root:

```bash
npm install
npm run dev
```

Open the Vite URL shown in the terminal.

## iPhone / iPad camera setup (trusted certificate)

iOS and iPadOS only give a page access to the camera when its HTTPS
certificate is **trusted by the device**. A self-signed certificate
shows a warning but still blocks the camera, so this project uses a
local certificate generated with `mkcert`:

1. The certificate files live in `certs/` and are wired up in
   `vite.config.js`. When they are missing, the dev server falls back
   to the usual self-signed `basicSsl` certificate (desktop only).
2. On the phone (once per device), open
   `https://<LAN-IP>:5173/rootCA.crt` in Safari, install the profile
   from *Settings → General → VPN & Device Management*, then enable
   full trust under *Settings → General → About → Certificate Trust
   Settings*.
3. Reload the booth — the camera now works in Safari and Chrome on iOS.

Regenerate the certificate whenever the LAN IP changes:

```powershell
tools/mkcert.exe -cert-file certs/dev-cert.pem -key-file certs/dev-key.pem <LAN-IP> localhost 127.0.0.1
Copy-Item "$env:LOCALAPPDATA\mkcert\rootCA.pem" public/rootCA.pem -Force
```

(`tools/mkcert.exe` is the Windows build from the mkcert releases page.
`tools/` and `certs/` are gitignored; `public/rootCA.pem` is the public
CA certificate the phones install.)

## Publish the booth (deployment guide)

Everything runs on one host PC. Phones, tablets and the second display
join over the local network:

```text
Devices on the Wi-Fi
    │ open the website and the API
    ▼
Host PC — XAMPP
    ├── Apache :80 / :443   the built React website (htdocs\photobooth)
    │                       + /api and /uploads proxy for HTTPS devices
    ├── MySQL  :3307        the photobooth database
    ▼
Node.js backend :5000       API, saved photos, live-screen relay
```

### Step 1 — One-time setup on the host PC

1. Install **Node.js 18+** and **XAMPP**.
2. In the XAMPP Control Panel, start **MySQL** (port **3307**) and **Apache**.
3. Import `database/db.sql` in <http://localhost/phpmyadmin/> — it creates the
   `photobooth` database and the `photos` table.

   Upgrading a database that was created before duplicate detection? Run this
   once in the phpMyAdmin **SQL** tab:

   ```sql
   USE photobooth;
   ALTER TABLE photos ADD COLUMN image_hash CHAR(64) DEFAULT NULL;
   ALTER TABLE photos ADD KEY idx_photos_image_hash (image_hash);
   ```

4. Check `backend/.env` (MySQL port **3307**, the root password if you set one,
   backend port 5000) — see `.env.example`.
5. Install the dependencies once:

   ```bash
   cd backend
   npm install

   cd ..
   npm install
   ```

### Step 2 — Build the website

```bash
npm run build
```

The result is the `dist/` folder. No configuration is needed when the backend
runs on the same PC: over plain HTTP the build calls the backend on port 5000
of whatever host the page was opened from, and over HTTPS it calls `/api` on
the same origin (proxied in Step 5). The asset paths are relative, so the
folder can be copied to any subfolder.

Only when the backend runs on a **different** machine, create a `.env` in the
project root, point it at that backend and build again:

```env
VITE_API_BASE=http://192.168.1.50:5000/api
```

### Step 3 — Copy the build into XAMPP

Copy the **contents of `dist/`** (not the folder itself) into:

```text
C:\xampp\htdocs\photobooth\
```

The result should look like:

```text
C:\xampp\htdocs\photobooth\
├── assets\
├── index.html
├── template.webp
└── ...
```

Test on the host PC: <http://localhost/photobooth/>

### Step 4 — Keep the backend running

`npm start` stops when its terminal closes. For a booth that runs all day,
use one of these instead.

**Option A — start script.** Create `start-booth.cmd` in the project folder and
double-click it before an event:

```bat
@echo off
cd /d "%~dp0backend"
start "Photobooth API" cmd /k node server.js
```

**Option B — Windows service** with [NSSM](https://nssm.cc/) (starts with
Windows, restarts after a crash):

```powershell
nssm install PhotoboothAPI "C:\Program Files\nodejs\node.exe" "C:\photobooth-app\backend\server.js"
nssm set PhotoboothAPI AppDirectory "C:\photobooth-app\backend"
nssm start PhotoboothAPI
```

Allow the API through the firewall (once):

```powershell
netsh advfirewall firewall add rule name="Photobooth API 5000" dir=in action=allow protocol=TCP localport=5000
```

Health check — it must say the backend and MySQL are connected:

```text
http://localhost:5000/api/health
http://<LAN-IP>:5000/api/health     (from other devices)
```

### Step 5 — HTTPS for phones, tablets and other devices

Browsers only give a page the camera in a **secure context**:

- On the host PC, `http://localhost/photobooth/` is fine.
- Any other device (phone booth, tablet, second screen) must use **HTTPS with
  a certificate the device trusts**. A self-signed warning still blocks the
  camera, so this project ships mkcert certificates (see "iPhone / iPad camera
  setup" above).

1. Make sure the certificate covers the PC's current LAN address (regenerate it
   after an IP change):

   ```powershell
   tools/mkcert.exe -cert-file certs/dev-cert.pem -key-file certs/dev-key.pem <LAN-IP> localhost 127.0.0.1
   ```

2. Enable SSL, the proxy and the extra configs in
   `C:\xampp\apache\conf\httpd.conf` by removing the leading `#`:

   ```apache
   LoadModule ssl_module modules/mod_ssl.so
   LoadModule proxy_module modules/mod_proxy.so
   LoadModule proxy_http_module modules/mod_proxy_http.so
   Include conf/extra/httpd-vhosts.conf
   Include conf/extra/httpd-ssl.conf
   ```

3. In `C:\xampp\apache\conf\extra\httpd-ssl.conf`, inside the
   `<VirtualHost _default_:443>` block, point the SSL lines at the project
   certificate and add the proxy — this keeps the API on the trusted HTTPS
   origin, because mixed content would block plain-HTTP calls from the page:

   ```apache
   SSLEngine on
   SSLCertificateFile    "C:/photobooth-app/certs/dev-cert.pem"
   SSLCertificateKeyFile "C:/photobooth-app/certs/dev-key.pem"

   ProxyPreserveHost On
   ProxyPass        "/api"     "http://127.0.0.1:5000/api"
   ProxyPassReverse "/api"     "http://127.0.0.1:5000/api"
   ProxyPass        "/uploads" "http://127.0.0.1:5000/uploads"
   ProxyPassReverse "/uploads" "http://127.0.0.1:5000/uploads"
   ```

   Adjust the certificate paths to where the project lives. Keep the default
   `DocumentRoot "C:/xampp/htdocs"` so `/photobooth/` is served.

4. Restart Apache and allow port 443 through the firewall (XAMPP usually asks
   the first time):

   ```powershell
   netsh advfirewall firewall add rule name="Apache HTTPS 443" dir=in action=allow protocol=TCP localport=443
   ```

5. On **each** phone / tablet, install the CA once — open this in Safari
   (iOS ignores profile installs from other browsers):

   ```text
   https://<LAN-IP>/photobooth/rootCA.crt
   ```

   Install the profile under *Settings → General → VPN & Device Management*,
   then enable full trust under *Settings → General → About → Certificate
   Trust Settings*. On Android: *Settings → Security → Encryption &
   credentials → Install a certificate → CA certificate*.

6. Open the booth on the device:

   ```text
   https://<LAN-IP>/photobooth/
   ```

Tip: ask the router to always give the PC the same address (DHCP
reservation) so the URL and the certificate keep working.

### Step 6 — Verify the published booth

- [ ] `http://localhost/photobooth/` (or `https://<LAN-IP>/photobooth/`) shows the landing page with the artwork.
- [ ] `http://<LAN-IP>:5000/api/health` says the backend and MySQL are connected.
- [ ] TAKE PHOTO → countdown → the photo appears in the torn-paper opening right away.
- [ ] SAVE → the photo appears in SAVED PHOTOS and in phpMyAdmin (`photobooth → photos`).
- [ ] DOWNLOAD and DELETE work.
- [ ] The second display at `https://<LAN-IP>/photobooth/?screen=live` mirrors the live camera, countdown, flash and finished photo.
- [ ] On a phone the camera prompt appears and a full session runs.

### Day-to-day startup

1. XAMPP Control Panel → start **MySQL** and **Apache**.
2. Start the backend (`start-booth.cmd`, or let the Windows service start).
3. Host PC: <http://localhost/photobooth/> — other devices: `https://<LAN-IP>/photobooth/`.

### Updating the published booth later

```bash
npm run build
```

Copy the contents of `dist/` over `C:\xampp\htdocs\photobooth\` again, then
hard-refresh the pages (Ctrl+Shift+R). The backend keeps running; restart it
only if `backend/server.js` or `backend/.env` changed.

### Troubleshooting

| Symptom | What to check |
| --- | --- |
| "Camera needs a trusted HTTPS connection" | Open the **https://** URL on that device and install + trust `rootCA.crt` (Step 5.5). Plain `http://` only works on the host PC via `localhost`. |
| Camera works on the host but not on phones | Devices must be on the same Wi-Fi; allow Apache 80/443 through the firewall. |
| SAVE fails ("Could not save the photo…") | Open `http://localhost:5000/api/health`. If MySQL failed: start MySQL (port 3307) and check `backend/.env`. |
| Backend window shows `Unknown column 'image_hash'` | Run the `ALTER TABLE` from Step 1.3 once. |
| Saved photos load but images are broken over HTTPS | Add the `/uploads` proxy lines from Step 5.3 and restart Apache. |
| Live screen stays idle or does not update | Check `http://<LAN-IP>:5000/api/health` from that device, then the Step 5 proxy and firewall. If it only stalls through Apache, add `flushpackets=on` to the `/api` ProxyPass lines. |
| MySQL will not start on port 3307 | Check the port in XAMPP's `my.ini` and set `DB_PORT` in `backend/.env` to the real port. |
| Pages still show old content after an update | Hard-refresh (Ctrl+Shift+R). |

### Publishing beyond the local network (optional)

To reach the booth from outside the Wi-Fi, put a tunnel or reverse proxy in
front of it (for example Tailscale or Cloudflare Tunnel) instead of opening
router ports. Remember the booth has **no login**: anyone who can reach it can
take, download and delete photos, so keep it inside the campus network or
protect it with the tunnel's own access rules.

## Deploy to Vercel (frontend) + Render (backend)

The guide above runs everything on one XAMPP PC. For an internet-facing
deployment the same app is split across managed services:

```text
Browser — Vercel HTTPS page
    │ VITE_API_BASE → https://<api>.onrender.com/api
    ▼
Render web service — backend/server.js (PORT from Render)
    │ DB_HOST / DB_PORT / DB_USER / DB_PASSWORD / DB_NAME (+ DB_SSL)
    ▼
Cloud MySQL — photobooth database + photos table
```

Render does **not** offer MySQL (only PostgreSQL), and XAMPP MySQL on your own
PC cannot be reached from a cloud host. A cloud MySQL database is required.

### 1. Cloud MySQL

1. Create a MySQL 8 database with a provider (Aiven, Clever Cloud, Railway,
   TiDB Cloud, or any managed MySQL server). Note the host, port, user,
   password and database name.
2. Import `database/db.sql` into it (provider console, or):

   ```bash
   mysql -h <DB_HOST> -P <DB_PORT> -u <DB_USER> -p < database/db.sql
   ```

   Use the current file: it creates `photos` with the `image_hash` column.
   For a database created earlier, run this once:

   ```sql
   USE photobooth;
   ALTER TABLE photos ADD COLUMN image_hash CHAR(64) DEFAULT NULL;
   ALTER TABLE photos ADD KEY idx_photos_image_hash (image_hash);
   ```

3. Most managed providers require TLS — note whether yours does
   (`DB_SSL=true` below).

### 2. Backend on Render

Create a **Web Service** from this repository:

| Setting | Value |
| --- | --- |
| Root Directory | `backend` |
| Build Command | `npm install` |
| Start Command | `npm start` |
| Health Check Path | `/api/health` |

If **Root Directory** is left at the repository root, `npm start` now forwards
to `backend/` automatically (the root `postinstall`/`start` scripts), so the
same start command also works — but `backend` is the recommended setting.

Add these under **Environment** — do not rely on `backend/.env`, it is
gitignored and never reaches Render:

```text
DB_HOST=<cloud mysql host>
DB_PORT=3306
DB_USER=<user>
DB_PASSWORD=<password>
DB_NAME=photobooth
DB_SSL=true            # false when the provider does not require TLS
# UPLOAD_DIR=/var/data/uploads   # see "Saved files" below
```

Then open `https://<api>.onrender.com/api/health` — it must return
`{"ok":true,…}`. If it says "MySQL connection failed", the host, port,
credentials or TLS setting is wrong; fix that before touching the frontend.

### 3. Frontend on Vercel

Vercel builds from the repository root (`npm run build`, output `dist`).
Add a **build-time** variable under Settings → Environment Variables:

```text
VITE_API_BASE=https://<api>.onrender.com/api
```

Include the `/api` suffix, then **redeploy**. Vite inlines the value during
the build, so changing it without a new deployment has no effect.

This is the usual cause of the XAMPP-style save error in the cloud: on an
HTTPS page without `VITE_API_BASE`, the app calls `/api` on the Vercel
domain, where no backend exists, so SAVE and the gallery fail even though
Render and MySQL are healthy.

### 4. Saved files on Render

PNGs are written to the Render instance disk, which is **ephemeral** — they
disappear on every deploy, restart or free-tier spin-down. On a paid plan,
attach a persistent disk mounted at `/var/data` and set
`UPLOAD_DIR=/var/data/uploads`. Otherwise store the photos in external
storage.

### 5. Verify

- [ ] `https://<api>.onrender.com/api/health` → `ok: true`
- [ ] Vercel site → TAKE PHOTO → SAVE → "Saved!"
- [ ] SAVED PHOTOS lists it and the image loads over HTTPS
- [ ] `?screen=live` mirrors the booth

| Symptom | Cause / fix |
| --- | --- |
| "Could not save the photo. Save failed (HTTP 404 …)" | `VITE_API_BASE` missing in Vercel or without the `/api` suffix. Set it and redeploy. |
| "Could not save the photo. … MySQL connection failed" | Render environment variables or the cloud database. Check `/api/health`. |
| `Unknown column 'image_hash'` | Import the current `db.sql` or run the ALTER above. |
| First request takes ~50 s | Render free instances sleep; the request wakes the service. |
| Photos disappear after a deploy | Ephemeral disk — see "Saved files" above. |
| Gallery images blocked on the HTTPS site | Deploy the current `backend/server.js` (it sets `trust proxy`, so image URLs are `https`). |

## Automatic camera workflow

```text
TAKE PHOTO
  ↓
Camera opens
  ↓
3 → 2 → 1 → SMILE!
  ↓
Automatic capture
  ↓
Automatic insertion into the jagged/torn-paper opening
  ↓
Edit / Download / Save / Retake
  ↓ (after SAVE)
Back to the live camera, ready for the next guest
```

There is no **Use Photo** confirmation step. Saving a photo keeps it in
SAVED PHOTOS and automatically returns the booth to the live camera view,
so the next guest sees what is going on while the booth waits (a remote
live screen follows the booth back to the live view automatically).

## Phone camera + laptop big screen

Run the camera on the phone and show the big screening on a laptop or TV:

1. Start both servers as usual (backend on port 5000, `npm run dev` on 5173).
2. On the laptop open `https://<LAN-IP>:5173/?screen=live` (press F11 for
   fullscreen) — this is the screening.
3. On the phone open `https://<LAN-IP>:5173` and run the photo session.

The phone sends its live events (session start, live camera frames, 3-2-1
countdown, flash and each finished composite) through the backend relay on
port 5000, so the laptop shows the live view inside the frame, the countdown
and every finished photo automatically, even from another device. A screening
opened later catches up with the last captured photo. When the booth and the
screen run in the same browser they still sync instantly over BroadcastChannel.

The live view streams as small JPEG frames (about 6 per second) while the
camera is open — smooth enough for posing on a local network. The booth only
streams while a screening is connected, so nothing is wasted when no screen
is open.

The dev server proxies `/api` and `/uploads` to the backend, so the HTTPS pages
never send plain-HTTP requests that browsers would block as mixed content.

## Important

XAMPP is the database host, not the JavaScript runtime. You need both:

- XAMPP MySQL running on port 3307
- Node.js backend running on port 5000

Apache is only needed when serving the built frontend through `http://localhost/photobooth/`.
