import { TEMPLATES, buildPlan, iso, addDays, today, fmt, parseDate } from "/plans.js";
import { createSchema, mySchemas } from "/api.js";

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

$("template").innerHTML = Object.entries(TEMPLATES).map(([k, t]) => `<option value="${k}" ${k === "10k" ? "selected" : ""}>${esc(t.label)}</option>`).join("");

function weeksOf(k) { const t = TEMPLATES[k]; return t.easy ? t.easy.length + 1 : Number($("weeks").value) || 8; }
function updateHelp() {
  const k = $("template").value;
  $("weeksField").hidden = k !== "empty";
  const n = weeksOf(k);
  const help = k === "empty"
    ? "Je krijgt lege weken met drie trainingen die je zelf invult."
    : `${n} weken, 3 trainingen per week: rustig, variatie en een lange loop.`;
  const race = $("race").value;
  const start = race ? addDays(parseDate(race), -(n - 1) * 7 - ((parseDate(race).getDay() + 6) % 7)) : null;
  $("templateHelp").textContent = help + (start ? ` Start in de week van ${fmt(start)}.` : "");
}
$("template").addEventListener("change", updateHelp);
$("race").addEventListener("input", updateHelp);
$("weeks").addEventListener("input", updateHelp);
$("race").value = iso(addDays(today(), 70));
updateHelp();

const mine = mySchemas();
if (mine.length) {
  $("mineCard").hidden = false;
  $("mine").innerHTML = mine.map((s) => `<li><a href="/schema?id=${encodeURIComponent(s.id)}"><b>${esc(s.title || "Schema")}</b><span class="muted">Openen →</span></a></li>`).join("");
}

$("create").addEventListener("submit", async (e) => {
  e.preventDefault();
  const btn = $("go");
  btn.disabled = true;
  $("err").hidden = true;
  try {
    const title = $("title").value.trim();
    const plan = buildPlan({ template: $("template").value, title, race: $("race").value || null, weeks: $("weeks").value });
    const people = [$("p1").value, $("p2").value].map((n) => n.trim()).filter(Boolean).map((n) => ({ n }));
    const doc = await createSchema(plan, people);
    location.href = `/schema?id=${doc.id}&nieuw=1`;
  } catch (err) {
    $("err").textContent = err.message;
    $("err").hidden = false;
    btn.disabled = false;
  }
});

if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
