# Loopmaatje

Samen een loopschema volgen: kies of maak je trainingsschema, vink trainingen af en deel het met je loopmaatje.

## Wat het doet

- **Schema maken** zonder account: kies een kant-en-klaar schema (5 km, 10 km, 12 à 15 km, halve marathon) of een leeg schema, en de datum van je wedstrijd. Het schema wordt zo gepland dat de laatste week op die datum uitkomt.
- **Delen met een link**: elk schema krijgt een lange, willekeurige link. Wie de link heeft, kan meekijken en afvinken.
- **Afvinken en notities** per loper (1 of 2 lopers in deze eerste versie), plus andere activiteiten zoals wandelen, zwemmen of fitness.
- **Aanpassen**: titel, data, namen, tips en elke training kun je achteraf wijzigen.
- **Werkt als app**: op je telefoon via "Zet op beginscherm" (PWA).

## Hoe het in elkaar zit

- `public/`: de website zelf, gewone HTML, CSS en JavaScript zonder build-stap.
- `src/worker.js`: een Cloudflare Worker die `/api/schema` afhandelt en de rest uit `public/` serveert.
- `lib/store.js`: validatie en opslag. Elk schema is één JSON-document in Cloudflare KV (`s:<id>`).
- `wrangler.jsonc`: de instellingen voor Cloudflare, met de koppeling naar de KV-namespace.
- `dev/server.mjs`: lokale server met opslag in het geheugen, zonder extra pakketten.

Het maximale aantal lopers staat in `MAX_PEOPLE` in `lib/store.js` en `public/schema.js`.

## Lokaal draaien

```sh
npm run dev   # http://localhost:8788, zonder dependencies
npm test
```

Of met de echte Cloudflare-omgeving: `npx wrangler dev`.

## Online zetten (Cloudflare Workers)

1. Maak een KV-namespace in het Cloudflare-dashboard: **Storage & Databases → KV → Create**, naam `loopmaatje`.
2. Zet het ID van die namespace in `wrangler.jsonc` bij `kv_namespaces`.
3. Maak een Worker die aan deze repository gekoppeld is: **Workers & Pages → Create → Import a repository**. Laat het deploy command op `npx wrangler deploy` staan.
4. Elke push naar `main` zet de site online op `loopmaatje.<jouw-subdomein>.workers.dev`. Een eigen domein kan via **Settings → Domains & Routes**.

## Bekende beperkingen van deze eerste versie

- Geen accounts: de link is de sleutel. Wie hem heeft, kan het schema aanpassen.
- Als twee mensen op exact hetzelfde moment iets wijzigen, kan één van de twee wijzigingen verloren gaan (KV kent geen transacties). Bij twee lopers is dat zeldzaam.
- Wijzigingen van je loopmaatje verschijnen binnen ongeveer 20 seconden, of meteen als je de app opnieuw opent.
