// GET /api/reviews?steamid=<steamID64>
// Steam heeft geen officiële API voor "reviews van gebruiker X", dus deze functie
// leest de openbare pagina steamcommunity.com/profiles/<id>/recommended/ uit (10 reviews per pagina).

const MAX_PAGES = 100; // = max. 1000 reviews
const BATCH = 5;
const UA = 'Mozilla/5.0 (compatible; steam-backlog/1.0)';

export default async function handler(req, res) {
  const steamid = String(req.query.steamid || '').trim();
  if (!/^\d{17}$/.test(steamid)) {
    return send(res, 400, { error: 'Ongeldig steamid (verwacht 17 cijfers).' });
  }

  try {
    const first = await fetchPage(steamid, 1);
    if (first.private) {
      return send(res, 200, { steamid, private: true, reviews: {}, count: 0 });
    }

    const reviews = { ...first.reviews };
    const pages = Math.min(MAX_PAGES, first.total ? Math.ceil(first.total / 10) : guessPages(first));

    for (let start = 2; start <= pages; start += BATCH) {
      const nums = [];
      for (let p = start; p < start + BATCH && p <= pages; p++) nums.push(p);
      const results = await Promise.all(nums.map((p) => fetchPage(steamid, p).catch(() => null)));
      let added = 0;
      for (const r of results) {
        if (!r) continue;
        for (const [id, v] of Object.entries(r.reviews)) if (!reviews[id]) { reviews[id] = v; added++; }
      }
      // Zonder totaal-aantal: stoppen zodra een batch niets nieuws oplevert
      if (!first.total && !added) break;
    }

    res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
    return send(res, 200, {
      steamid,
      private: false,
      count: Object.keys(reviews).length,
      fetchedAt: new Date().toISOString(),
      reviews,
    });
  } catch (err) {
    return send(res, 502, { error: `Reviews ophalen mislukt: ${err.message}` });
  }
}

// Zonder "of N entries" op de pagina: doorgaan zolang er volle pagina's komen
function guessPages(first) {
  return Object.keys(first.reviews).length >= 10 ? MAX_PAGES : 1;
}

async function fetchPage(steamid, p) {
  const url = `https://steamcommunity.com/profiles/${steamid}/recommended/?p=${p}&l=english`;
  const r = await fetch(url, { headers: { 'User-Agent': UA, 'Accept-Language': 'en' } });
  if (!r.ok) throw new Error(`Steam antwoordde met HTTP ${r.status}`);
  return parse(await r.text());
}

export function parse(html) {
  const isPrivate = /profile_private_info|This profile is private/i.test(html);
  const totalMatch = html.match(/of\s+([\d,.]+)\s+entries/i);
  const total = totalMatch ? Number(totalMatch[1].replace(/[^\d]/g, '')) : 0;

  const reviews = {};
  const boxes = html.split(/class="review_box[\s"]/).slice(1);

  for (const box of boxes) {
    const link = box.match(/https?:\/\/steamcommunity\.com\/(?:id|profiles)\/[^"'\s]+?\/recommended\/(\d+)\/?/i);
    if (!link) continue;
    const appid = link[1];
    if (reviews[appid]) continue;
    const up = /thumbsUp/i.test(box) ? true : /thumbsDown/i.test(box) ? false : null;
    const posted = box.match(/Posted\s+([^<]+?)\.?\s*</i);
    const hours = box.match(/([\d,.]+)\s+hrs on record/i);
    reviews[appid] = {
      up,
      url: link[0],
      posted: posted ? posted[1].trim() : null,
      hours: hours ? Number(hours[1].replace(/,/g, '')) : null,
    };
  }

  // Fallback als de opmaak verandert: alle review-links op de pagina
  if (!boxes.length) {
    for (const m of html.matchAll(/https?:\/\/steamcommunity\.com\/(?:id|profiles)\/[^"'\s]+?\/recommended\/(\d+)\/?/gi)) {
      reviews[m[1]] ??= { up: null, url: m[0], posted: null, hours: null };
    }
  }

  return { private: isPrivate && !boxes.length, total, reviews };
}

function send(res, status, body) {
  if (status !== 200) res.setHeader('Cache-Control', 'no-store');
  res.status(status).json(body);
}
