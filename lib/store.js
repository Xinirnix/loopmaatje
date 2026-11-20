// Shared server logic for Loopmaatje: validation and storage of one schedule ("schema").
// A schema is stored as one JSON document in Cloudflare KV under the key "s:<id>".
// Anyone with the link can read and change it; the id is long and random so it can't be guessed.

export const MAX_PEOPLE = 2; // first version: one or two runners per schema
export const MAX_WEEKS = 52;
export const MAX_RUNS_PER_WEEK = 7;
const MAX_DOC_BYTES = 256 * 1024;

const ID_RE = /^[a-z0-9]{12}$/;
const RUN_ID_RE = /^[a-z0-9]{1,16}$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const KINDS = ["easy", "var", "long", "race", "other"];

export class BadRequest extends Error {}
const bad = (msg) => { throw new BadRequest(msg); };

export function newId(len = 12) {
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
  const bytes = new Uint8Array(len);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

export const isId = (id) => typeof id === "string" && ID_RE.test(id);

function str(v, max, name, { required = false } = {}) {
  if (v === undefined || v === null) v = "";
  if (typeof v !== "string") bad(`${name} moet tekst zijn`);
  v = v.trim();
  if (required && !v) bad(`${name} is verplicht`);
  if (v.length > max) bad(`${name} is te lang`);
  return v;
}

function date(v, name, { required = false } = {}) {
  if (!v && !required) return null;
  if (typeof v !== "string" || !DATE_RE.test(v) || isNaN(new Date(v + "T12:00:00Z"))) bad(`${name} is geen geldige datum`);
  return v;
}

export function cleanPlan(plan) {
  if (!plan || typeof plan !== "object") bad("Schema ontbreekt");
  const weeks = plan.weeks;
  if (!Array.isArray(weeks) || weeks.length < 1 || weeks.length > MAX_WEEKS) bad(`Een schema heeft 1 tot ${MAX_WEEKS} weken`);
  const seen = new Set();
  return {
    title: str(plan.title, 80, "Titel", { required: true }),
    start: date(plan.start, "Startdatum", { required: true }),
    race: date(plan.race, "Wedstrijddatum"),
    tips: str(plan.tips, 3000, "Tips"),
    weeks: weeks.map((w) => {
      const runs = (w && w.runs) || [];
      if (!Array.isArray(runs) || runs.length > MAX_RUNS_PER_WEEK) bad(`Maximaal ${MAX_RUNS_PER_WEEK} trainingen per week`);
      return {
        runs: runs.map((r) => {
          if (!r || !RUN_ID_RE.test(r.id) || seen.has(r.id)) bad("Ongeldige training");
          seen.add(r.id);
          if (!KINDS.includes(r.k)) bad("Ongeldig soort training");
          const day = Number(r.day);
          if (!Number.isInteger(day) || day < 0 || day > 6) bad("Ongeldige dag");
          return { id: r.id, k: r.k, d: str(r.d, 80, "Omschrijving"), day };
        }),
      };
    }),
  };
}

export function cleanPeople(people, previous) {
  if (!Array.isArray(people) || people.length < 1 || people.length > MAX_PEOPLE) bad(`Een schema is voor 1 tot ${MAX_PEOPLE} lopers`);
  return people.map((p, i) => ({
    // keys stay stable so checkmarks survive a rename
    k: (previous && previous[i] && previous[i].k) || `p${i + 1}`,
    n: str(p && p.n, 30, "Naam", { required: true }),
  }));
}

export function newDoc(body) {
  const now = new Date().toISOString();
  return {
    id: newId(),
    created: now,
    updated: now,
    plan: cleanPlan(body && body.plan),
    people: cleanPeople(body && body.people),
    logs: {},
    extras: {},
  };
}

// Apply one change to a schema document. Returns the changed document (mutated in place).
export function applyOp(doc, op) {
  if (!op || typeof op !== "object") bad("Ongeldige wijziging");
  const who = (k) => { if (!doc.people.some((p) => p.k === k)) bad("Onbekende loper"); return k; };
  const runExists = (id) => { if (!doc.plan.weeks.some((w) => w.runs.some((r) => r.id === id))) bad("Onbekende training"); return id; };
  const now = new Date().toISOString();

  switch (op.op) {
    case "check": {
      const key = `${runExists(op.run)}__${who(op.who)}`;
      if (op.done) doc.logs[key] = doc.logs[key] || { note: "", at: now };
      else delete doc.logs[key];
      break;
    }
    case "note": {
      const key = `${runExists(op.run)}__${who(op.who)}`;
      const note = str(op.note, 500, "Notitie");
      doc.logs[key] = { ...(doc.logs[key] || {}), note, at: now };
      break;
    }
    case "extra.add": {
      const x = op.extra || {};
      if (Object.keys(doc.extras).length >= 500) bad("Te veel activiteiten");
      const id = newId(8);
      doc.extras[id] = {
        who: who(x.who),
        date: date(x.date, "Datum", { required: true }),
        kind: str(x.kind, 40, "Activiteit", { required: true }),
        note: str(x.note, 300, "Notitie"),
        at: now,
      };
      break;
    }
    case "extra.del": {
      if (typeof op.id !== "string") bad("Ongeldige activiteit");
      delete doc.extras[op.id];
      break;
    }
    case "plan": {
      doc.plan = cleanPlan(op.plan);
      doc.people = cleanPeople(op.people, doc.people);
      break;
    }
    default:
      bad("Onbekende wijziging");
  }
  doc.updated = now;
  if (JSON.stringify(doc).length > MAX_DOC_BYTES) bad("Dit schema is te groot geworden");
  return doc;
}

// ---- storage + HTTP helpers, shared by the Pages Functions and the local dev server ----

const key = (id) => `s:${id}`;

export async function load(kv, id) {
  if (!isId(id)) return null;
  const raw = await kv.get(key(id));
  return raw ? JSON.parse(raw) : null;
}

export const save = (kv, doc) => kv.put(key(doc.id), JSON.stringify(doc));

export function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

export async function readJson(request) {
  const text = await request.text();
  if (text.length > MAX_DOC_BYTES) bad("Te veel gegevens");
  try { return JSON.parse(text); } catch { bad("Ongeldige gegevens"); }
}

export function handleError(err) {
  if (err instanceof BadRequest) return json({ error: err.message }, 400);
  console.error(err);
  return json({ error: "Er ging iets mis op de server" }, 500);
}

// Route handlers (used by functions/api/... and dev/server.mjs)
export async function createHandler(request, kv) {
  try {
    const doc = newDoc(await readJson(request));
    await save(kv, doc);
    return json(doc, 201);
  } catch (err) { return handleError(err); }
}

export async function getHandler(id, kv) {
  try {
    const doc = await load(kv, id);
    return doc ? json(doc) : json({ error: "Dit schema bestaat niet (meer)" }, 404);
  } catch (err) { return handleError(err); }
}

export async function patchHandler(request, id, kv) {
  try {
    const doc = await load(kv, id);
    if (!doc) return json({ error: "Dit schema bestaat niet (meer)" }, 404);
    applyOp(doc, await readJson(request));
    await save(kv, doc);
    return json(doc);
  } catch (err) { return handleError(err); }
}
