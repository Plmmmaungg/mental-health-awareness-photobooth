# Deployment checklist

## Architecture

- Frontend: Vercel (Vite/React)
- Backend: Render (Node.js/Express)
- Database: managed MySQL
- Image storage: Cloudinary

## 1. Database

Import `database/db.sql` into your managed MySQL database.

## 2. Cloudinary

Create a Cloudinary account and collect:
- CLOUDINARY_CLOUD_NAME
- CLOUDINARY_API_KEY
- CLOUDINARY_API_SECRET

Photos are uploaded to Cloudinary. MySQL stores only metadata and the Cloudinary URL/public ID.

## 3. Render

Create a Render Web Service from this Git repository.

Root Directory:
`backend`

Build Command:
`npm install`

Start Command:
`npm start`

Health Check:
`/api/health`

Set the environment variables from `backend/.env.example`.

Set `CORS_ORIGIN` to your Vercel URL, for example:
`https://your-project.vercel.app`

## 4. Vercel

Import the same GitHub repository.

Framework:
Vite

Build Command:
`npm run build`

Output Directory:
`dist`

Add:
`VITE_API_BASE=https://YOUR-RENDER-SERVICE.onrender.com/api`

Redeploy after setting the variable.

## 5. Local development

Backend:
`cd backend`
`npm install`
copy `.env.example` to `.env`
`npm start`

Frontend:
`npm install`
`npm run dev`

## Security

Never commit `.env` files or Cloudinary API secrets.
For production, restrict `CORS_ORIGIN` to your actual Vercel/custom domain.
