// POST /api/sync  { steamid, mode?, entries, reviewApplied, playingApplied }
// mode 'merge' (standaard): voegt de indeling van dit apparaat samen met die op de server.
// mode 'pull': geeft alleen de serverversie terug. mode 'replace': de serverversie wordt die van dit apparaat.
// Per game wint de meest recente wijziging (`updated`). Opslag: Upstash Redis via de REST API.
// Vereist env vars SYNC_TOKEN en KV_REST_API_URL + KV_REST_API_TOKEN
// (of UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN).

import { createHash, timingSafeEqual } from 'node:crypto';
import { allowedSteamIds, isAllowed } from '../lib/allowed.js';

const MAX_ENTRIES = 50000;

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'Alleen POST.' });

  const secret = process.env.SYNC_TOKEN;
  const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!secret || !url || !token) {
    return send(res, 501, { error: 'Synchroniseren is niet ingesteld op de server (SYNC_TOKEN en Upstash Redis).' });
  }
  if (!tokenOk(req.headers.authorization, secret)) return send(res, 401, { error: 'Onjuist sync-token.' });

  let body = req.body;
  try { if (typeof body === 'string') body = JSON.parse(body); } catch { body = null; }
  if (!body || typeof body !== 'object') return send(res, 400, { error: 'Ongeldige aanvraag.' });

  const steamid = String(body.steamid || '');
  if (!/^\d{17}$/.test(steamid)) return send(res, 400, { error: 'Ongeldig steamid (verwacht 17 cijfers).' });
  if (allowedSteamIds()?.size === 0) return send(res, 500, { error: 'ALLOWED_STEAMIDS is niet ingesteld op de server.' });
  if (!isAllowed(steamid)) return send(res, 403, { error: 'Dit Steam-profiel mag niet via deze site worden opgevraagd.' });

  const mode = body.mode || 'merge';
  if (!['merge', 'pull', 'replace'].includes(mode)) return send(res, 400, { error: 'Ongeldige mode.' });
  const entries = mode === 'pull' ? {} : body.entries;
  if (!entries || typeof entries !== 'object' || Array.isArray(entries) || Object.keys(entries).length > MAX_ENTRIES) {
    return send(res, 400, { error: 'Ongeldige entries.' });
  }

  try {
    const redis = (...cmd) => redisCall(url, token, cmd);
    const key = `sb:sync:${steamid}`;
    const cur = mode === 'replace' ? {} : JSON.parse((await redis('GET', key)) || 'null') || {};
    if (mode === 'pull') return send(res, 200, { entries: {}, reviewApplied: [], playingApplied: [], ...cur });
    const merged = {
      entries: mergeEntries(cur.entries, entries),
      reviewApplied: union(cur.reviewApplied, body.reviewApplied),
      playingApplied: union(cur.playingApplied, body.playingApplied),
      savedAt: new Date().toISOString(),
    };
    await redis('SET', key, JSON.stringify(merged));
    return send(res, 200, merged);
  } catch (err) {
    return send(res, 502, { error: `Opslag niet bereikbaar: ${err.message}` });
  }
}

function tokenOk(header, secret) {
  const given = String(header || '').replace(/^Bearer\s+/i, '');
  // Hashen geeft gelijke lengtes, zodat timingSafeEqual werkt
  const h = (s) => createHash('sha256').update(s).digest();
  return given.length > 0 && timingSafeEqual(h(given), h(secret));
}

function mergeEntries(server = {}, client = {}) {
  const out = { ...server };
  for (const [id, e] of Object.entries(client)) {
    if (!/^\d+$/.test(id) || !e || typeof e !== 'object') continue;
    if (!out[id] || (Number(e.updated) || 0) > (Number(out[id].updated) || 0)) out[id] = e;
  }
  return out;
}

function union(a, b) {
  return [...new Set([...(Array.isArray(a) ? a : []), ...(Array.isArray(b) ? b : [])].map(String))];
}

async function redisCall(url, token, cmd) {
  const r = await fetch(url, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify(cmd),
  });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || data.error) throw new Error(data.error || `HTTP ${r.status}`);
  return data.result;
}

function send(res, status, body) {
  res.setHeader('Cache-Control', 'no-store');
  res.status(status).json(body);
}
