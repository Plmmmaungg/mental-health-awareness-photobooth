import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import basicSsl from "@vitejs/plugin-basic-ssl";

/*
 * Certificate policy
 * ------------------
 * iOS/iPadOS only gives the camera to a page whose HTTPS
 * certificate is TRUSTED by the device. The auto-generated
 * basicSsl certificate is not trusted, so we generate a local one
 * with mkcert whenever the files exist:
 *
 *   tools/mkcert.exe -cert-file certs/dev-cert.pem -key-file certs/dev-key.pem 192.168.100.113 192.168.194.49 192.168.137.1 localhost 127.0.0.1
 *
 * Each phone installs public/rootCA.pem once (Settings -> General ->
 * VPN & Device Management, then full trust under About ->
 * Certificate Trust Settings) and the camera works on iOS.
 *
 * Without the files we fall back to basicSsl so the project still
 * runs on machines that have not generated a certificate.
 */
const rootDir = path.dirname(fileURLToPath(import.meta.url));
const certFile = path.join(rootDir, "certs", "dev-cert.pem");
const keyFile = path.join(rootDir, "certs", "dev-key.pem");
const hasLocalCert = fs.existsSync(certFile) && fs.existsSync(keyFile);

export default defineConfig({
  /*
   * Relative asset paths: the same dist folder works from
   * C:\xampp\htdocs\photobooth\ (recommended) or the htdocs root,
   * and from any other folder the site is published to.
   */
  base: "./",

  plugins: [react(), ...(hasLocalCert ? [] : [basicSsl()])],

  server: {
    /*
     * Bind every interface: the machine is reached by its current
     * LAN address, which changes with the network (and is unknown
     * up front on phones using the Windows hotspot).
     */
    host: true,
    port: 5173,
    strictPort: true,
    https: hasLocalCert
      ? { key: fs.readFileSync(keyFile), cert: fs.readFileSync(certFile) }
      : true,

    /*
     * The pages are served over HTTPS (needed for iOS cameras), so
     * calls straight to the plain-HTTP backend would be blocked as
     * mixed content. Everything under /api and /uploads is proxied to
     * the backend instead, which keeps every request on this trusted
     * origin — including the photo API and the live-screen relay.
     */
    proxy: {
      "/api": {
        target: "http://127.0.0.1:5000",
        changeOrigin: true,
      },
      "/uploads": {
        target: "http://127.0.0.1:5000",
        changeOrigin: true,
      },
    },
  },
});
