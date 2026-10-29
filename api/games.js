// Serverless proxy naar de Steam Web API.
// GET /api/games?profile=<steamID64 | vanity-naam | profiel-URL>
// Vereist env var STEAM_API_KEY (https://steamcommunity.com/dev/apikey).

const API = 'https://api.steampowered.com';

export default async function handler(req, res) {
  const key = process.env.STEAM_API_KEY;
  if (!key) {
    return send(res, 500, { error: 'STEAM_API_KEY is niet ingesteld op de server.' });
  }

  const raw = String(req.query.profile || '').trim();
  if (!raw) {
    return send(res, 400, { error: 'Vul een Steam-ID, profielnaam of profiel-URL in.' });
  }

  try {
    const steamid = await resolveSteamId(raw, key);
    if (!steamid) {
      return send(res, 404, { error: `Geen Steam-profiel gevonden voor "${raw}".` });
    }

    const [owned, summary] = await Promise.all([
      steam(`/IPlayerService/GetOwnedGames/v1/`, {
        key,
        steamid,
        include_appinfo: 1,
        include_played_free_games: 1,
        skip_unvetted_apps: 0,
      }),
      steam(`/ISteamUser/GetPlayerSummaries/v2/`, { key, steamids: steamid }),
    ]);

    const player = summary?.response?.players?.[0] || null;
    const list = owned?.response?.games;

    if (!Array.isArray(list)) {
      return send(res, 403, {
        error:
          'Steam gaf geen gamelijst terug. Staan je profiel en "Gamedetails" op Openbaar? (Steam → Profiel bewerken → Privacyinstellingen)',
        steamid,
        profile: player && mapPlayer(player),
      });
    }

    const games = list.map((g) => ({
      appid: g.appid,
      name: g.name || `App ${g.appid}`,
      playtime: g.playtime_forever || 0,
      playtime2w: g.playtime_2weeks || 0,
      lastPlayed: g.rtime_last_played || 0,
      icon: g.img_icon_url
        ? `https://media.steampowered.com/steamcommunity/public/images/apps/${g.appid}/${g.img_icon_url}.jpg`
        : null,
    }));

    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=600');
    return send(res, 200, {
      steamid,
      profile: player && mapPlayer(player),
      fetchedAt: new Date().toISOString(),
      games,
    });
  } catch (err) {
    return send(res, 502, { error: `Fout bij het ophalen van Steam-data: ${err.message}` });
  }
}

function mapPlayer(p) {
  return {
    name: p.personaname,
    avatar: p.avatarfull || p.avatarmedium || p.avatar,
    url: p.profileurl,
  };
}

async function resolveSteamId(raw, key) {
  let m = raw.match(/steamcommunity\.com\/profiles\/(\d{17})/i);
  if (m) return m[1];

  let vanity = raw;
  m = raw.match(/steamcommunity\.com\/id\/([^/?#]+)/i);
  if (m) vanity = decodeURIComponent(m[1]);
  else if (/^\d{17}$/.test(raw)) return raw;

  const data = await steam(`/ISteamUser/ResolveVanityURL/v1/`, { key, vanityurl: vanity });
  return data?.response?.success === 1 ? data.response.steamid : null;
}

async function steam(path, params) {
  const url = new URL(API + path);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const r = await fetch(url, { headers: { accept: 'application/json' } });
  if (r.status === 401 || r.status === 403) throw new Error('Steam weigert de API key (ongeldig?)');
  if (!r.ok) throw new Error(`Steam antwoordde met HTTP ${r.status}`);
  return r.json();
}

function send(res, status, body) {
  if (status !== 200) res.setHeader('Cache-Control', 'no-store');
  res.status(status).json(body);
}
