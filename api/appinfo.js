// GET /api/appinfo?appid=<appid>
// Store-informatie voor één game: reviewscore, korte beschrijving, tags, releasedatum en screenshots.
// Gebruikt IStoreBrowseService/GetItems en IStoreService/GetTagList; die hebben geen API key nodig,
// dus dit telt niet mee voor de limiet van STEAM_API_KEY. Vercel cachet het antwoord een dag.

const API = 'https://api.steampowered.com';
const ASSETS = 'https://shared.akamai.steamstatic.com/store_item_assets/';
const LANG = { language: 'dutch', country_code: 'NL' };

// Tagnamen veranderen zelden: per warme functie-instantie één keer ophalen
let tagNames = null;

export default async function handler(req, res) {
  const appid = String(req.query.appid || '').trim();
  if (!/^\d{1,10}$/.test(appid)) return send(res, 400, { error: 'Ongeldig appid.' });

  try {
    const [items, tags] = await Promise.all([
      steam('/IStoreBrowseService/GetItems/v1/', {
        ids: [{ appid: Number(appid) }],
        context: LANG,
        data_request: { include_basic_info: true, include_reviews: true, include_tag_count: 6, include_release: true, include_screenshots: true },
      }),
      loadTags(),
    ]);

    const item = items?.response?.store_items?.[0];
    if (!item || item.success !== 1) return send(res, 404, { error: 'Geen store-informatie voor deze game.' });

    const rv = item.reviews?.summary_filtered;
    const shots = item.screenshots?.all_ages_screenshots || item.screenshots?.mature_content_screenshots || [];

    res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
    return send(res, 200, {
      appid: Number(appid),
      description: item.basic_info?.short_description || null,
      tags: (item.tags || []).map((t) => tags.get(t.tagid)).filter(Boolean),
      released: item.release?.steam_release_date || item.release?.original_release_date || null,
      reviews: rv?.review_count
        ? { label: rv.review_score_label, percent: rv.percent_positive, count: rv.review_count, score: rv.review_score }
        : null,
      screenshots: shots.slice(0, 4).map((s) => ({
        thumb: ASSETS + s.filename.replace(/\.jpg(\?|$)/, '.600x338.jpg$1'),
        full: ASSETS + s.filename,
      })),
    });
  } catch (err) {
    return send(res, 502, { error: `Fout bij het ophalen van store-informatie: ${err.message}` });
  }
}

async function loadTags() {
  if (tagNames) return tagNames;
  const data = await steam('/IStoreService/GetTagList/v1/', null, { language: LANG.language });
  tagNames = new Map((data?.response?.tags || []).map((t) => [t.tagid, t.name]));
  return tagNames;
}

async function steam(path, input, params = {}) {
  const url = new URL(API + path);
  if (input) url.searchParams.set('input_json', JSON.stringify(input));
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const r = await fetch(url, { headers: { accept: 'application/json' } });
  if (!r.ok) throw new Error(`Steam antwoordde met HTTP ${r.status}`);
  return r.json();
}

function send(res, status, body) {
  if (status !== 200) res.setHeader('Cache-Control', 'no-store');
  res.status(status).json(body);
}
