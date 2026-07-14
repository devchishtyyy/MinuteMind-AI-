import dotenv from 'dotenv';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import geminiRoutes from './routes/gemini.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Always load backend/.env by absolute path, not the process's cwd, since
// run.bat/PM2 launch this with cwd set to the project root.
dotenv.config({ path: path.join(__dirname, '.env'), quiet: true });

if (!process.env.GEMINI_API_KEY) {
  console.warn('WARNING: GEMINI_API_KEY is not set. AI features will fail. Set it in backend/.env');
}

const app = express();
const port = parseInt(process.env.PORT || '4001', 10);
const distPath = path.resolve(__dirname, '../dist');

// ── Security headers ─────────────────────────────────────────────────────────
// connect-src/frame-src allow Firebase Auth + Firestore (client SDK talks to
// Google APIs directly); script-src allows the Chart.js CDN tag in index.html.
const CSP = [
  "default-src 'none'",
  "script-src 'self' https://cdn.jsdelivr.net",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob: https://*.googleusercontent.com",
  "connect-src 'self' https://*.googleapis.com https://securetoken.googleapis.com",
  "frame-src https://accounts.google.com https://*.firebaseapp.com",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "upgrade-insecure-requests",
].join('; ');

app.use((_req, res, next) => {
  res.setHeader('Content-Security-Policy', CSP);
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains; preload');
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  next();
});

app.use(express.json({ limit: '10mb' }));

app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/gemini', geminiRoutes);

// ── Static assets ─────────────────────────────────────────────────────────────
// Vite outputs hashed filenames (e.g. index-CNluxwLo.js) which are safe to cache
// long-term. The HTML shell must never be cached so users always get the latest
// asset URLs after a deployment.
app.use(express.static(distPath, {
  setHeaders(res, filePath) {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-store');
    }
  },
}));

// ── SPA fallback ──────────────────────────────────────────────────────────────
app.get('/*', (_req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.sendFile(path.join(distPath, 'index.html'));
});

app.listen(port, () => {
  console.log(`MinuteMind AI server running at http://localhost:${port}`);
});
