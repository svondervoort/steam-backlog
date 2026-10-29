// Welke Steam-profielen deze installatie mag opvragen (env var ALLOWED_STEAMIDS, komma-gescheiden steamID64's).
// Lokaal zonder ALLOWED_STEAMIDS mag alles; op Vercel is de var verplicht, zodat je key niet voor iedereen open staat.

export function allowedSteamIds() {
  const ids = String(process.env.ALLOWED_STEAMIDS || '').split(/[\s,]+/).filter(Boolean);
  if (ids.length) return new Set(ids);
  return process.env.VERCEL ? new Set() : null;
}

export function isAllowed(steamid) {
  const ids = allowedSteamIds();
  return !ids || ids.has(String(steamid));
}
