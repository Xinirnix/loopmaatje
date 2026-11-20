import { KINDS, WD, parseDate, iso, addDays, mondayOf, fmt, dayName, today, runId } from "/plans.js";
import { getSchema, change, rememberSchema, forgetSchema, schemaUrl } from "/api.js";

const MAX_PEOPLE = 2;
const EXTRA_KINDS = ["Wandelen", "Zwemmen", "Fitness", "Fietsen", "Yoga", "Extra loop", "Anders"];
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const params = new URLSearchParams(location.search);
const id = params.get("id");
let doc = null;
let editing = null; // draft {plan, people} while the editor is open
let pending = 0;
const openWeeks = new Set(), xopen = new Set(), drafts = {}, xdraft = {};
let lastWho = null;
try { lastWho = localStorage.getItem("loopmaatje.who"); } catch {}

function notice(msg, err = false) {
  const n = $("notice");
  n.textContent = msg || "";
  n.classList.toggle("err", err);
  n.hidden = !msg;
}

// ---------- dates ----------
const startOf = () => parseDate(doc.plan.start);
const weekStart = (i) => addDays(startOf(), i * 7);
const allRuns = () => doc.plan.weeks.flatMap((w) => w.runs);
const logKey = (run, who) => `${run}__${who}`;

// ---------- view ----------
function render() {
  if (!doc) return;
  document.title = `${doc.plan.title} · Loopmaatje`;
  $("share").hidden = $("edit").hidden = !!editing;
  const active = document.activeElement && document.activeElement.id;
  $("view").innerHTML = editing ? editorHtml() : viewHtml();
  if (active) {
    const el = document.getElementById(active);
    if (el) { el.focus(); if (el.setSelectionRange && el.type === "text") { const n = el.value.length; el.setSelectionRange(n, n); } }
  }
}

function viewHtml() {
  const t0 = today();
  const P = doc.people, W = doc.plan.weeks;
  const end = addDays(weekStart(W.length - 1), 6);
  const race = doc.plan.race ? parseDate(doc.plan.race) : null;
  let count = "", countLabel = "";
  if (race) {
    const left = Math.round((race - t0) / 864e5);
    count = left > 0 ? left : left === 0 ? "🏁" : "✓";
    countLabel = left > 1 ? "dagen tot de wedstrijd" : left === 1 ? "dag tot de wedstrijd" : left === 0 ? "wedstrijddag" : "afgelopen";
  } else {
    const wk = Math.floor((t0 - startOf()) / (7 * 864e5)) + 1;
    count = wk < 1 ? W.length : Math.min(wk, W.length);
    countLabel = wk < 1 ? "weken" : `van ${W.length} weken`;
  }
  const total = allRuns().length;
  const people = P.map((p) => {
    const n = allRuns().filter((r) => doc.logs[logKey(r.id, p.k)]).length;
    const pct = total ? Math.round((n / total) * 100) : 0;
    return `<span class="p"><b>${esc(p.n)}</b><span class="bar"><i style="width:${pct}%"></i></span><span style="font-variant-numeric:tabular-nums">${n}/${total}</span></span>`;
  }).join("");

  const weeks = W.map((w, i) => {
    const s = weekStart(i), e = addDays(s, 6);
    const cur = t0 >= s && t0 <= e, past = t0 > e;
    const open = past ? openWeeks.has(i) : true;
    const sum = P.map((p) => `${esc(p.n)} ${w.runs.filter((r) => doc.logs[logKey(r.id, p.k)]).length}/${w.runs.length}`).join(" · ");
    const head = `<span class="wt">Week ${i + 1}</span><span class="dates">${fmt(s)} – ${fmt(e)}</span>${cur ? '<span class="now">Deze week</span>' : ""}<span class="sum">${sum}${past ? (open ? " ▴" : " ▾") : ""}</span>`;
    const runs = [...w.runs].sort((a, b) => a.day - b.day).map((r) => runHtml(r, s)).join("");
    return `<section class="week ${cur ? "current" : ""} ${past ? "past" : ""} ${open ? "" : "closed"}" id="week${i}">
      ${past ? `<button class="whead" id="wh-${i}" data-wk="${i}" aria-expanded="${open}">${head}</button>` : `<div class="whead">${head}</div>`}
      ${open ? runs + extraHtml(i) : ""}
    </section>`;
  }).join("");

  const tips = doc.plan.tips ? `<details class="tips"><summary>Tips</summary><ul>${doc.plan.tips.split("\n").filter(Boolean).map((t) => `<li>${esc(t)}</li>`).join("")}</ul></details>` : "";

  return `<section class="bib">
      <div><h1>${esc(doc.plan.title)}</h1><div class="sub">${fmt(startOf())} – ${fmt(race || end)} ${(race || end).getFullYear()} · ${W.length} weken</div></div>
      <div class="count"><b>${count}</b><span>${countLabel}</span></div>
      <div class="people">${people}</div>
    </section>
    <div class="weeks">${weeks}</div>${tips}`;
}

function runHtml(r, ws) {
  const P = doc.people;
  const all = P.every((p) => doc.logs[logKey(r.id, p.k)]);
  const btns = P.map((p) => {
    const key = logKey(r.id, p.k), l = doc.logs[key];
    return `<button class="ck ${l ? "on" : ""}" id="c-${key}" data-tog="${key}" aria-pressed="${!!l}" title="${l ? "Tik om ongedaan te maken" : `Tik als ${esc(p.n)} deze training gedaan heeft`}"><span class="ring" aria-hidden="true"><svg viewBox="0 0 24 24" width="12" height="12"><path d="M5 12.5l4.5 4.5L19 7.5" fill="none" stroke="currentColor" stroke-width="3.5" stroke-linecap="round" stroke-linejoin="round"/></svg></span><span class="pn">${esc(p.n)}</span><span class="sr">${l ? " gedaan" : " nog niet gedaan"}</span></button>`;
  }).join("");
  const notes = P.map((p) => {
    const key = logKey(r.id, p.k), l = doc.logs[key];
    if (!l) return "";
    const val = drafts[key] ?? (l.note || "");
    return `<div class="nrow"><label for="n-${key}">${esc(p.n)}</label><input type="text" id="n-${key}" data-run="${key}" placeholder="Notitie (hoe ging het?)" value="${esc(val)}" maxlength="500"><button data-save="${key}" ${val === (l.note || "") ? "disabled" : ""}>Opslaan</button></div>`;
  }).join("");
  const d = addDays(ws, r.day);
  return `<article class="run ${all ? "all-done" : ""}">
    <span class="chip c-${r.k}">${KINDS[r.k]}</span>
    <span class="main"><span class="dist">${esc(r.d) || "&nbsp;"}</span><span class="when">${dayName(d)} ${fmt(d)}</span></span>
    <span class="cks">${btns}</span>
    ${notes ? `<div class="notes">${notes}</div>` : ""}
  </article>`;
}

function extraHtml(i) {
  const s = weekStart(i);
  const days = Array.from({ length: 7 }, (_, n) => addDays(s, n));
  const keys = new Set(days.map(iso));
  const name = (k) => (doc.people.find((p) => p.k === k) || {}).n || "Iemand";
  const list = Object.entries(doc.extras).map(([xid, x]) => ({ ...x, id: xid })).filter((x) => keys.has(x.date))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.at < b.at ? -1 : 1));
  const rows = list.map((x) => {
    const d = parseDate(x.date);
    return `<div class="x"><span class="day">${dayName(d)} ${fmt(d)}</span><span class="chip c-x">${esc(x.kind)}</span><span class="who">${esc(name(x.who))}</span>${x.note ? `<span class="pnote">· ${esc(x.note)}</span>` : ""}<button class="link" data-xdel="${esc(x.id)}">Verwijderen</button></div>`;
  }).join("");
  let form = "";
  if (xopen.has(i)) {
    const dr = xdraft[i] || {};
    const t0 = today();
    const defDay = dr.day || (keys.has(iso(t0)) ? iso(t0) : iso(s));
    const who = dr.who || (doc.people.some((p) => p.k === lastWho) ? lastWho : doc.people[0].k);
    form = `<div class="xform">
      ${doc.people.length > 1 ? `<select id="xw-${i}" data-xw="${i}" data-f="who" aria-label="Wie">${doc.people.map((p) => `<option value="${p.k}" ${p.k === who ? "selected" : ""}>${esc(p.n)}</option>`).join("")}</select>` : ""}
      <select id="xd-${i}" data-xw="${i}" data-f="day" aria-label="Dag">${days.map((d) => `<option value="${iso(d)}" ${iso(d) === defDay ? "selected" : ""}>${dayName(d)} ${fmt(d)}</option>`).join("")}</select>
      <select id="xk-${i}" data-xw="${i}" data-f="kind" aria-label="Activiteit">${EXTRA_KINDS.map((k) => `<option ${k === (dr.kind || "Fitness") ? "selected" : ""}>${k}</option>`).join("")}</select>
      <input type="text" id="xn-${i}" data-xw="${i}" data-f="note" placeholder="Wat deed je? (bv. benen + core, 40 min)" value="${esc(dr.note || "")}" maxlength="300">
      <button data-xadd="${i}">Toevoegen</button></div>`;
  }
  const tog = `<button id="xt-${i}" data-xtog="${i}" aria-expanded="${xopen.has(i)}">${xopen.has(i) ? "Sluiten" : "+ Activiteit"}</button>`;
  return `<div class="extra"><div class="xhead"><h3>Andere activiteiten</h3>${rows ? "" : '<span class="hint muted">wandelen, zwemmen, fitness…</span>'}${tog}</div>${rows}${form}</div>`;
}

// ---------- editor ----------
function editorHtml() {
  const { plan, people } = editing;
  const kindOpts = (k) => Object.entries(KINDS).map(([v, l]) => `<option value="${v}" ${v === k ? "selected" : ""}>${l}</option>`).join("");
  const dayOpts = (d) => WD.map((l, n) => `<option value="${n}" ${n === d ? "selected" : ""}>${l}</option>`).join("");
  const start = parseDate(plan.start);
  const names = people.map((p, n) => `<div class="field"><label for="ep-${n}">${n === 0 ? "Loper 1" : "Loper 2"}</label><div style="display:flex;gap:6px"><input type="text" id="ep-${n}" data-person="${n}" value="${esc(p.n)}" maxlength="30" style="flex:1">${n > 0 ? `<button type="button" class="quiet" data-rmperson="${n}">Verwijderen</button>` : ""}</div></div>`).join("");
  const weeks = plan.weeks.map((w, i) => {
    const s = addDays(start, i * 7);
    const runs = w.runs.map((r, j) => `<div class="ed-run">
        <select id="ek-${r.id}" data-wi="${i}" data-ri="${j}" data-f="k" aria-label="Soort">${kindOpts(r.k)}</select>
        <select id="ey-${r.id}" data-wi="${i}" data-ri="${j}" data-f="day" aria-label="Dag">${dayOpts(r.day)}</select>
        <input class="ed-d" type="text" id="ed-${r.id}" data-wi="${i}" data-ri="${j}" data-f="d" value="${esc(r.d)}" maxlength="80" placeholder="bv. 6 km rustig" aria-label="Omschrijving">
        <button type="button" class="link" data-rmrun="${i}:${j}" aria-label="Training verwijderen">Verwijderen</button>
      </div>`).join("");
    return `<section class="ed-week"><header><span class="wt">Week ${i + 1}</span><span class="dates">${fmt(s)} – ${fmt(addDays(s, 6))}</span></header>
      ${runs || '<span class="muted" style="font-size:.85rem">Geen trainingen</span>'}
      <div class="ed-actions">${w.runs.length < 7 ? `<button type="button" class="quiet" data-addrun="${i}">+ Training</button>` : ""}${plan.weeks.length > 1 ? `<button type="button" class="link" data-rmweek="${i}">Week verwijderen</button>` : ""}</div>
    </section>`;
  }).join("");
  return `<section class="card form">
      <h2>Schema aanpassen</h2>
      <div class="field"><label for="e-title">Naam van je doel</label><input type="text" id="e-title" data-plan="title" value="${esc(plan.title)}" maxlength="80"></div>
      <div class="row2">
        <div class="field"><label for="e-start">Eerste week begint op</label><input type="date" id="e-start" data-plan="start" value="${plan.start}"><small>Wordt de maandag van die week.</small></div>
        <div class="field"><label for="e-race">Datum wedstrijd</label><input type="date" id="e-race" data-plan="race" value="${plan.race || ""}"></div>
      </div>
      ${names}
      ${people.length < MAX_PEOPLE ? `<div><button type="button" class="quiet" data-addperson>+ Loopmaatje toevoegen</button></div>` : ""}
      <div class="field"><label for="e-tips">Tips (één per regel)</label><textarea id="e-tips" data-plan="tips" rows="4" maxlength="3000">${esc(plan.tips)}</textarea></div>
    </section>
    <div class="weeks">${weeks}</div>
    <div><button type="button" class="quiet" data-addweek>+ Week toevoegen</button></div>
    <div class="sticky"><button type="button" class="primary" data-saveplan>Opslaan</button><button type="button" class="quiet" data-cancel>Annuleren</button></div>`;
}

function openEditor() {
  editing = structuredClone({ plan: doc.plan, people: doc.people });
  editing.plan.tips = editing.plan.tips || "";
  render();
  scrollTo(0, 0);
}

async function savePlan(btn) {
  const { plan, people } = editing;
  if (!plan.title.trim()) return notice("Geef je schema een naam.", true);
  if (people.some((p) => !p.n.trim())) return notice("Vul de naam van elke loper in.", true);
  plan.start = iso(mondayOf(parseDate(plan.start)));
  btn.disabled = true;
  try {
    doc = await change(id, { op: "plan", plan, people: people.map((p) => ({ n: p.n })) });
    editing = null;
    rememberSchema(id, doc.plan.title);
    notice("");
    render();
  } catch (err) { notice(err.message, true); btn.disabled = false; }
}

// ---------- changes ----------
async function send(op, optimistic) {
  const before = structuredClone(doc);
  if (optimistic) { optimistic(); render(); }
  pending++;
  try {
    const next = await change(id, op);
    if (pending === 1) doc = next; // keep optimistic state if more changes are on their way
    notice("");
  } catch (err) {
    doc = before;
    notice(err.status === 404 ? "Dit schema bestaat niet meer." : `Opslaan lukte niet: ${err.message}`, true);
  } finally {
    pending--;
    render();
  }
}

function toggle(key) {
  const [run, who] = key.split("__");
  const done = !doc.logs[key];
  send({ op: "check", run, who, done }, () => {
    if (done) doc.logs[key] = { note: "", at: new Date().toISOString() };
    else { delete doc.logs[key]; delete drafts[key]; }
  });
}

function saveNote(key) {
  if (!doc.logs[key]) return;
  const [run, who] = key.split("__");
  const note = (drafts[key] ?? doc.logs[key].note ?? "").trim().slice(0, 500);
  send({ op: "note", run, who, note }, () => { doc.logs[key] = { ...doc.logs[key], note }; delete drafts[key]; });
}

function addExtra(i) {
  const s = weekStart(i), dr = xdraft[i] || {}, t0 = today();
  const date = dr.day || (t0 >= s && t0 <= addDays(s, 6) ? iso(t0) : iso(s));
  const who = dr.who || (doc.people.some((p) => p.k === lastWho) ? lastWho : doc.people[0].k);
  const extra = { who, date, kind: dr.kind || "Fitness", note: (dr.note || "").trim() };
  xdraft[i] = { day: dr.day, kind: dr.kind, who: dr.who };
  xopen.delete(i);
  send({ op: "extra.add", extra }, () => { doc.extras["tmp" + Date.now()] = { ...extra, at: new Date().toISOString() }; });
}

async function share() {
  const url = schemaUrl(id);
  if (navigator.share) {
    try { await navigator.share({ title: doc.plan.title, text: `Loop je mee? Ons schema voor ${doc.plan.title}:`, url }); return; } catch (e) { if (e.name === "AbortError") return; }
  }
  try { await navigator.clipboard.writeText(url); notice("Link gekopieerd. Stuur hem naar je loopmaatje."); }
  catch { notice(`Kopieer deze link: ${url}`); }
}

// ---------- events ----------
const onField = (e) => {
  const t = e.target;
  if (t.dataset.run) {
    drafts[t.dataset.run] = t.value;
    const b = document.querySelector(`[data-save="${t.dataset.run}"]`);
    if (b) b.disabled = t.value === (doc.logs[t.dataset.run]?.note || "");
  }
  if (t.dataset.xw !== undefined) {
    (xdraft[t.dataset.xw] ||= {})[t.dataset.f] = t.value;
    if (t.dataset.f === "who") { lastWho = t.value; try { localStorage.setItem("loopmaatje.who", t.value); } catch {} }
  }
  if (editing) {
    if (t.dataset.plan) editing.plan[t.dataset.plan] = t.dataset.plan === "race" ? t.value || null : t.value;
    if (t.dataset.person !== undefined) editing.people[t.dataset.person].n = t.value;
    if (t.dataset.wi !== undefined) {
      const r = editing.plan.weeks[t.dataset.wi].runs[t.dataset.ri];
      r[t.dataset.f] = t.dataset.f === "day" ? Number(t.value) : t.value;
    }
    if (e.type === "change" && t.dataset.plan === "start" && t.value) render(); // week dates shift
  }
};
document.addEventListener("input", onField);
document.addEventListener("change", onField);
document.addEventListener("keydown", (e) => {
  const t = e.target;
  if (e.key !== "Enter" || t.tagName !== "INPUT") return;
  if (t.dataset.run) { e.preventDefault(); saveNote(t.dataset.run); }
  if (t.dataset.xw !== undefined) { e.preventDefault(); addExtra(Number(t.dataset.xw)); }
});
document.addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b || b.disabled) return;
  const d = b.dataset;
  if (b.id === "share") return share();
  if (b.id === "edit") return openEditor();
  if (d.tog) return toggle(d.tog);
  if (d.save) return saveNote(d.save);
  if (d.wk !== undefined) { const i = Number(d.wk); openWeeks.has(i) ? openWeeks.delete(i) : openWeeks.add(i); return render(); }
  if (d.xtog !== undefined) { const i = Number(d.xtog); xopen.has(i) ? xopen.delete(i) : xopen.add(i); render(); const n = $("xn-" + i); if (n) n.focus(); return; }
  if (d.xadd !== undefined) return addExtra(Number(d.xadd));
  if (d.xdel) return send({ op: "extra.del", id: d.xdel }, () => { delete doc.extras[d.xdel]; });
  if (!editing) return;
  const P = editing.plan;
  if (d.addrun !== undefined) { P.weeks[d.addrun].runs.push({ id: runId(), k: "easy", d: "", day: 5 }); render(); $("ed-" + P.weeks[d.addrun].runs.at(-1).id).focus(); }
  if (d.rmrun) { const [i, j] = d.rmrun.split(":").map(Number); P.weeks[i].runs.splice(j, 1); render(); }
  if (d.rmweek !== undefined) { if (confirmDelete(`week ${Number(d.rmweek) + 1}`)) { P.weeks.splice(Number(d.rmweek), 1); render(); } }
  if (d.addweek !== undefined) { const last = P.weeks.at(-1); P.weeks.push({ runs: last.runs.filter((r) => r.k !== "race").map((r) => ({ ...r, id: runId() })) }); render(); }
  if (d.addperson !== undefined) { editing.people.push({ n: "" }); render(); $("ep-" + (editing.people.length - 1)).focus(); }
  if (d.rmperson !== undefined) { editing.people.splice(Number(d.rmperson), 1); render(); }
  if (d.saveplan !== undefined) savePlan(b);
  if (d.cancel !== undefined) { editing = null; notice(""); render(); }
});
// Removing a week also removes its checkmarks, so make sure that was intended when something was checked.
function confirmDelete(what) {
  const i = Number(what.split(" ")[1]) - 1;
  const ids = (editing.plan.weeks[i]?.runs || []).map((r) => r.id);
  const hasChecks = Object.keys(doc.logs).some((k) => ids.includes(k.split("__")[0]));
  return !hasChecks || window.confirm(`In ${what} zijn al trainingen afgevinkt. Toch verwijderen?`);
}

// ---------- loading + keeping in sync ----------
async function refresh() {
  if (pending || editing || document.visibilityState !== "visible") return;
  try {
    const next = await getSchema(id);
    if (pending || editing) return;
    if (next.updated !== doc.updated) { doc = next; render(); }
  } catch {}
}

async function init() {
  if (!id) { $("view").innerHTML = '<div class="notice err">Er ontbreekt een schema in de link. <a href="/">Maak een nieuw schema</a>.</div>'; return; }
  try {
    doc = await getSchema(id);
  } catch (err) {
    if (err.status === 404) forgetSchema(id);
    $("view").innerHTML = `<div class="notice err">${esc(err.message)} <a href="/">Naar de startpagina</a>.</div>`;
    return;
  }
  rememberSchema(id, doc.plan.title);
  $("share").hidden = $("edit").hidden = false;
  if (params.has("nieuw")) {
    history.replaceState(null, "", `/schema?id=${id}`);
    const w = $("welcome");
    w.innerHTML = `<b>Je schema staat klaar.</b> Bewaar deze link en stuur hem naar je loopmaatje: <br><a href="${schemaUrl(id)}">${esc(schemaUrl(id))}</a><br><button class="quiet" id="share2" style="margin-top:6px">Link delen</button>`;
    w.hidden = false;
    $("share2").addEventListener("click", share);
  }
  render();
  const cur = document.querySelector(".week.current");
  if (cur && !params.has("nieuw")) cur.scrollIntoView({ block: "start" });
  setInterval(refresh, 20000);
  document.addEventListener("visibilitychange", refresh);
}

init();
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
