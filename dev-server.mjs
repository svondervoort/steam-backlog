// Lokale testserver zonder Vercel: serveert index.html en de functies in api/.
// Start met: npm run dev  (leest STEAM_API_KEY uit .env)
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import games from './api/games.js';
import reviews from './api/reviews.js';
import sync from './api/sync.js';
import appinfo from './api/appinfo.js';

const routes = { '/api/games': games, '/api/reviews': reviews, '/api/sync': sync, '/api/appinfo': appinfo };

const PORT = Number(process.env.PORT) || 3000;

if (!process.env.STEAM_API_KEY) {
  console.warn('⚠ STEAM_API_KEY ontbreekt. Maak een .env aan (zie .env.example).');
}

http
  .createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host}`);

    const handler = routes[url.pathname];
    if (handler) {
      // Minimale nabootsing van Vercel's req.query / res.status().json()
      req.query = Object.fromEntries(url.searchParams);
      if (req.method === 'POST') {
        let raw = '';
        for await (const chunk of req) raw += chunk;
        try { req.body = JSON.parse(raw || '{}'); } catch { req.body = raw; }
      }
      res.status = (code) => ((res.statusCode = code), res);
      res.json = (body) => {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
        res.end(JSON.stringify(body));
      };
      return handler(req, res);
    }

    if (url.pathname === '/' || url.pathname === '/index.html') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      return res.end(await readFile(new URL('./index.html', import.meta.url)));
    }

    res.statusCode = 404;
    res.end('Niet gevonden');
  })
  .listen(PORT, () => console.log(`Steam Backlog draait op http://localhost:${PORT}`));
