# Steam Backlog

Vul je Steam-ID, profielnaam of profiel-URL in, haal je hele bibliotheek op en houd per game een status, prioriteit en notitie bij.

- `index.html` – de app (geen build-stap, geen dependencies)
- `api/games.js` – Vercel-functie die de Steam Web API aanroept (ResolveVanityURL, GetOwnedGames, GetPlayerSummaries)
- `api/reviews.js` – Vercel-functie die je openbare reviewpagina's uitleest (Steam heeft hier geen officiële API voor)
- `dev-server.mjs` – lokale testserver

## Via GitHub automatisch deployen

```bash
cd steam-backlog
gh repo create steam-backlog --private --source=. --push
```

Ga daarna in Vercel (je persoonlijke account) naar *Add New → Project*, importeer de repo, laat Framework Preset op *Other* staan en zet bij Environment Variables `STEAM_API_KEY`. Elke push naar `main` geeft dan een nieuwe productie-deploy en elke andere branch een preview-URL.

## Installeren

1. Vraag een Steam Web API key aan: https://steamcommunity.com/dev/apikey (domein mag alles zijn, bv. `localhost`).
2. Zet je Steam-profiel en **Gamedetails** op *Openbaar* (Profiel bewerken → Privacyinstellingen).
3. Deploy op Vercel en zet de env var `STEAM_API_KEY`:

```bash
vercel                      # eerste keer: project koppelen
vercel env add STEAM_API_KEY production
vercel --prod
```

## Lokaal testen

Zonder Vercel-account, alleen Node 20.6+ nodig:

```bash
cp .env.example .env        # en vul je STEAM_API_KEY in
npm run dev                 # → http://localhost:3000
```

`.env` staat in `.gitignore`, dus je key komt niet in git terecht.

## Gebruik

- **Statussen**: Niet ingedeeld, Backlog, Speelt nu, Uitgespeeld, Gestopt, Niet interessant.
- **Prioriteit**: H / M / L (nogmaals klikken haalt hem weg).
- **Snel indelen**: zet alle niet-ingedeelde games onder X minuten speeltijd in één keer op Backlog. De drempel is instelbaar, zodat games die alleen voor kaarten zijn ge-idled ook meetellen.
- **Wat speel ik?**: willekeurige game uit je backlog; hogere prioriteit telt zwaarder mee.
- **Reviews**: de app leest je openbare Steam-reviews (`/recommended/`) en toont per game een badge (Aanbevolen / Niet aanbevolen) met een link naar je review. Je kunt filteren op *Met review* of *Zonder review*.
- **Review = uitgespeeld**: games met een review gaan automatisch naar Uitgespeeld, maar alleen als ze op Niet ingedeeld, Backlog of Speelt nu stonden. Elke game wordt maar één keer omgezet: zet je hem daarna zelf terug, dan blijft dat zo. Je zet dit aan of uit onder *Snel indelen*.
- **Recent gespeeld = speelt nu**: games die je de afgelopen 2 weken hebt gespeeld gaan automatisch naar Speelt nu, maar alleen als ze op Niet ingedeeld of Backlog stonden. Ook hier geldt: elke game maar één keer, dus zet je hem zelf terug, dan blijft dat zo. Aan/uit onder *Snel indelen*.
- **Steam-collecties**: importeer je collecties uit de Steam-client (bv. Uitgespeeld, Gestopt, Play next). Kies het bestand `cloud-storage-namespace-1.json` uit `<Steam>/userdata/<jouw-id>/config/cloudstorage/` (macOS: `~/Library/Application Support/Steam/…`, Windows: `C:\Program Files (x86)\Steam\…`) en kies per collectie een status. Je keuzes worden onthouden. Per game wint de meest recente wijziging, maar automatische indelingen (review, recent gespeeld) worden altijd overschreven. Het bestand wordt alleen in je browser gelezen. Dynamische collecties worden niet ondersteund. Het formaat is niet officieel gedocumenteerd, dus een Steam-update kan dit breken.
- **Exporteren/Importeren**: back-up als JSON. Bij importeren wint per game de meest recente wijziging.

Je backlog staat in `localStorage` van de browser, per Steam-ID. Op een ander apparaat of in een andere browser zie je hem pas na een import.
