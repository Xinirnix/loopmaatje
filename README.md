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
- `functions/api/schema/`: de API als Cloudflare Pages Functions.
- `lib/store.js`: validatie en opslag. Elk schema is één JSON-document in Cloudflare KV (`s:<id>`).
- `dev/server.mjs`: lokale server met opslag in het geheugen, zonder extra pakketten.

Het maximale aantal lopers staat in `MAX_PEOPLE` in `lib/store.js` en `public/schema.js`.

## Lokaal draaien

```sh
npm run dev   # http://localhost:8788
npm test
```

Node 20 of nieuwer is genoeg; er zijn geen dependencies.

## Online zetten (Cloudflare Pages)

1. Maak een gratis account op [cloudflare.com](https://dash.cloudflare.com/sign-up).
2. Ga naar **Workers & Pages → Create → Pages → Connect to Git** en kies deze repository.
   - Build command: leeg laten
   - Build output directory: `public`
3. Maak een KV-namespace: **Storage & Databases → KV → Create**, naam `loopmaatje`.
4. Koppel die aan het project: **Pages-project → Settings → Bindings → Add → KV namespace**, variabele `LOOPMAATJE`, namespace `loopmaatje`. Doe opnieuw een deploy.
5. Optioneel: een eigen domein via **Custom domains**.

Wie liever met de command line werkt: vul het namespace-id in `wrangler.toml` in en gebruik `npx wrangler pages deploy`.

## Bekende beperkingen van deze eerste versie

- Geen accounts: de link is de sleutel. Wie hem heeft, kan het schema aanpassen.
- Als twee mensen op exact hetzelfde moment iets wijzigen, kan één van de twee wijzigingen verloren gaan (KV kent geen transacties). Bij twee lopers is dat zeldzaam.
- Wijzigingen van je loopmaatje verschijnen binnen ongeveer 20 seconden, of meteen als je de app opnieuw opent.
