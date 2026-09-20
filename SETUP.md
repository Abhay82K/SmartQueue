# SmartQueue — Setup Guide

## Folder structure
```
SmartQueue/
├── backend/      (Express + Postgres + Socket.io API)
└── frontend/     (React + Vite)
```

## 1. Backend setup
```
cd backend
npm install
copy .env.example .env
```
Edit `.env` and fill in your real DB password + a random JWT_SECRET.

Run:
```
npm run dev
```

## 2. Frontend setup
```
cd frontend
npm install
copy .env.example .env
npm run dev
```

## 3. Deploying live (free)
- Database: neon.tech (free Postgres)
- Backend: render.com — Root Directory: `backend`, Build: `npm install`, Start: `npm start`
- Frontend: vercel.com — Root Directory: `frontend`, framework auto-detects as Vite

Set `VITE_API_URL` on Vercel to your Render backend URL.
Set `CLIENT_ORIGIN` on Render to your Vercel frontend URL.
