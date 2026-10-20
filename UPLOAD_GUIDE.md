# Batangas Photo Booth — Complete Upload & Setup Guide

## What you are installing

This project has three separate parts:

1. **React + JavaScript frontend** — the photobooth screen.
2. **Node.js + Express backend** — receives saved photos and talks to MySQL.
3. **MySQL in XAMPP** — the real database.

phpMyAdmin is only the browser tool you use to manage MySQL.

```text
Browser
  │
  ▼
React website
  │
  │ HTTP requests
  ▼
Node.js backend :5000
  │
  │ MySQL connection
  ▼
XAMPP MySQL :3307
  │
  ▼
photobooth database
```

---

# PART 1 — Install the requirements

## 1. Install Node.js

Install Node.js 18 or newer.

After installing, open Command Prompt and run:

```bash
node -v
npm -v
```

Both commands should show a version number.

## 2. Install XAMPP

Open XAMPP Control Panel.

You need **MySQL** running.

Your MySQL port for this project is:

```text
3307
```

Apache is useful when you want to open the built website at:

```text
http://localhost/photobooth/
```

---

# PART 2 — Put the project on your computer

You can keep the source project anywhere. A simple location is:

```text
C:\photobooth-app\
```

Extract the ZIP there.

You should see folders such as:

```text
C:\photobooth-app\
├── backend\
├── database\
├── public\
├── src\
├── package.json
└── ...
```

Open this folder in VS Code.

**Do not put the MySQL database inside VS Code.** The database is created in XAMPP MySQL.

---

# PART 3 — Create the database in XAMPP

## 1. Start MySQL

Open XAMPP Control Panel and start **MySQL**.

Make sure it is running on port **3307**.

## 2. Open phpMyAdmin

Open:

```text
http://localhost/phpmyadmin/
```

## 3. Import the database

In phpMyAdmin:

1. Click **Import**.
2. Choose:
   `database/db.sql`
3. Click **Go**.

The database should be created:

```text
photobooth
```

Inside it should be:

```text
photos
```

The table contains:

```text
id
filename
original_name
created_at
```

## 4. Do not create a database manually in VS Code

The `.sql` file is only an instruction file.

The real database is stored and managed by MySQL running inside XAMPP.

---

# PART 4 — Configure the JavaScript backend

Open:

```text
backend/.env
```

It should contain:

```env
DB_HOST=127.0.0.1
DB_PORT=3307
DB_USER=root
DB_PASSWORD=
DB_NAME=photobooth
PORT=5000
```

If your XAMPP MySQL root account has a password, put it after `DB_PASSWORD=`.

Example:

```env
DB_PASSWORD=mypassword
```

If your root password is blank, leave it empty.

---

# PART 5 — Install backend packages

Open a VS Code terminal.

Run:

```bash
cd backend
npm install
```

This installs:

- Express
- MySQL2
- CORS
- dotenv

Then start the backend:

```bash
npm start
```

You should see:

```text
Photobooth JavaScript backend running at http://localhost:5000
```

Keep this terminal open.

---

# PART 6 — Test the JavaScript backend

Open your browser and visit:

```text
http://localhost:5000/api/health
```

If everything is correct, you should see something similar to:

```json
{
  "ok": true,
  "message": "JavaScript backend and MySQL are connected."
}
```

If you see a MySQL error, check:

- XAMPP MySQL is running.
- MySQL is really using port 3307.
- Database name is `photobooth`.
- Username is `root`.
- Password in `backend/.env` is correct.

---

# PART 7 — Start the React photobooth

Open a **second** VS Code terminal.

Go to the project root, not the backend folder:

```bash
cd C:\photobooth-app
```

Install frontend packages:

```bash
npm install
```

Start React/Vite:

```bash
npm run dev
```

Vite will show a URL similar to:

```text
http://localhost:5173/
```

Open that URL.

---

# PART 8 — Test the complete save workflow

1. Click **TAKE PHOTO**.
2. Allow camera permission.
3. Wait for:
   `3 → 2 → 1 → SMILE!`
4. The photo is captured automatically.
5. The photo is automatically placed inside the jagged/torn-paper opening.
6. Click **SAVE**.

The website sends the finished 2048 × 2048 PNG to:

```text
Node.js backend
```

The backend saves the PNG in:

```text
backend/uploads/
```

Then the backend saves the photo information in MySQL:

```text
photobooth → photos
```

---

# PART 9 — Check the database

Open:

```text
http://localhost/phpmyadmin/
```

Click:

```text
photobooth
```

Then click:

```text
photos
```

You should see a row after saving a photo.

For example:

```text
id | filename                         | original_name | created_at
1  | photo_20261017...abc123.png      | camera-photo  | ...
```

The PNG itself is in:

```text
backend/uploads/
```

---

# PART 10 — Build the website for XAMPP

When your development version works, create the production frontend.

From the project root:

```bash
npm run build
```

Vite creates:

```text
dist\
```

---

# PART 11 — Upload the frontend to XAMPP

Create this folder:

```text
C:\xampp\htdocs\photobooth\
```

Copy the **contents of `dist`** into that folder.

For example:

```text
C:\xampp\htdocs\photobooth\
├── assets\
├── index.html
└── ...
```

Start Apache in XAMPP.

Then open:

```text
http://localhost/photobooth/
```

Important:

**Do not copy the Node.js backend into the `htdocs` folder as a PHP application.**

The backend is still JavaScript/Node.js and must continue running separately on:

```text
http://localhost:5000
```

---

# PART 12 — The final local setup

When everything is installed, you will normally have:

```text
C:\photobooth-app\
├── backend\
│   ├── server.js
│   ├── .env
│   ├── package.json
│   └── uploads\
│
├── database\
│   └── db.sql
│
├── src\
├── public\
└── package.json
```

And XAMPP will have:

```text
C:\xampp\htdocs\photobooth\
├── index.html
└── assets\
```

The database itself lives in MySQL managed by XAMPP.

---

# PART 13 — Every time you use the photobooth

Before using the booth:

### 1. Start XAMPP MySQL

MySQL must be running on port 3307.

### 2. Start the JavaScript backend

```bash
cd C:\photobooth-app\backend
npm start
```

### 3. Start Apache if using the XAMPP website

In XAMPP Control Panel, start Apache.

### 4. Open the website

```text
http://localhost/photobooth/
```

---

# PART 14 — If SAVE does not work

First open:

```text
http://localhost:5000/api/health
```

### If it says MySQL is connected

The backend is working. Check that the website is using:

```text
http://localhost:5000/api
```

### If it says MySQL connection failed

Check XAMPP:

```text
MySQL → Port 3307
```

Then check `backend/.env`.

### If `localhost:5000` does not open

The Node.js backend is not running.

Run:

```bash
cd backend
npm start
```

### If the browser says camera permission is blocked

Allow camera access for localhost in the browser.

---

# PART 15 — What each program is doing

## VS Code

You use VS Code to edit:

- React code
- JavaScript backend code
- CSS
- configuration

VS Code is **not the database**.

## React

React creates the photobooth interface.

## Node.js + Express

Node.js is your backend.

It receives the completed image and communicates with MySQL.

## XAMPP MySQL

MySQL is the actual database server.

## phpMyAdmin

phpMyAdmin is a management interface for MySQL.

## Apache

Apache serves the built React website when you use:

```text
http://localhost/photobooth/
```

---

# Quick checklist

Before presenting the project:

- [ ] XAMPP installed
- [ ] MySQL running on port 3307
- [ ] `photobooth` database created
- [ ] `photos` table created
- [ ] `backend/.env` configured
- [ ] `npm install` completed in backend
- [ ] Node.js backend running on port 5000
- [ ] React build completed with `npm run build`
- [ ] `dist` copied to `C:\xampp\htdocs\photobooth\`
- [ ] Apache running
- [ ] Camera permission allowed
- [ ] TAKE PHOTO works
- [ ] 3–2–1–SMILE works
- [ ] Photo fits the jagged opening
- [ ] DOWNLOAD works
- [ ] SAVE works
- [ ] Saved photo appears in phpMyAdmin
- [ ] Gallery displays saved photos
- [ ] Delete works

---

# Important architecture reminder

Your requested setup is:

**JavaScript backend + XAMPP MySQL.**

Not:

**JavaScript frontend + PHP backend.**

The corrected project follows the first architecture.
