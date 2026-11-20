import test from "node:test";
import assert from "node:assert/strict";
import { newDoc, applyOp, BadRequest, createHandler, getHandler, patchHandler } from "../lib/store.js";
import { buildPlan, TEMPLATES, parseDate, mondayOf } from "../public/plans.js";

const people = [{ n: "Sam" }, { n: "Robin" }];

test("every template builds a valid plan with the race in the last week", () => {
  for (const template of Object.keys(TEMPLATES)) {
    const plan = buildPlan({ template, title: "Stadsloop 10 km", race: "2027-03-14" });
    const doc = newDoc({ plan, people });
    const last = doc.plan.weeks.at(-1).runs;
    assert.equal(last.at(-1).k, "race", template);
    const raceDay = new Date(parseDate(doc.plan.start).getTime() + ((doc.plan.weeks.length - 1) * 7 + last.at(-1).day) * 864e5);
    assert.equal(raceDay.toDateString(), parseDate("2027-03-14").toDateString(), template);
    assert.equal(parseDate(doc.plan.start).toDateString(), mondayOf(parseDate(doc.plan.start)).toDateString());
  }
});

test("check, note and extras round trip; unknown runners are refused", () => {
  const doc = newDoc({ plan: buildPlan({ template: "5k", title: "5 km", race: "2027-01-10" }), people });
  const run = doc.plan.weeks[0].runs[0].id;
  applyOp(doc, { op: "check", run, who: "p2", done: true });
  applyOp(doc, { op: "note", run, who: "p2", note: "  ging goed " });
  assert.equal(doc.logs[`${run}__p2`].note, "ging goed");
  applyOp(doc, { op: "check", run, who: "p2", done: false });
  assert.equal(doc.logs[`${run}__p2`], undefined);
  assert.throws(() => applyOp(doc, { op: "check", run, who: "p9", done: true }), BadRequest);
  assert.throws(() => applyOp(doc, { op: "check", run: "nope", who: "p1", done: true }), BadRequest);
  applyOp(doc, { op: "extra.add", extra: { who: "p1", date: "2026-12-01", kind: "Zwemmen", note: "" } });
  const [xid] = Object.keys(doc.extras);
  applyOp(doc, { op: "extra.del", id: xid });
  assert.deepEqual(doc.extras, {});
});

test("at most two runners, and renaming keeps the checkmarks", () => {
  assert.throws(() => newDoc({ plan: buildPlan({ template: "5k", title: "x", race: null }), people: [...people, { n: "Kim" }] }), BadRequest);
  const doc = newDoc({ plan: buildPlan({ template: "5k", title: "x", race: null }), people: [{ n: "Sam" }] });
  applyOp(doc, { op: "plan", plan: doc.plan, people: [{ n: "Samira" }, { n: "Robin" }] });
  assert.deepEqual(doc.people, [{ k: "p1", n: "Samira" }, { k: "p2", n: "Robin" }]);
});

test("HTTP handlers", async () => {
  const mem = new Map();
  const kv = { get: async (k) => mem.get(k) ?? null, put: async (k, v) => void mem.set(k, v) };
  const plan = buildPlan({ template: "10k", title: "10 km", race: "2027-04-04" });
  let res = await createHandler(new Request("http://x/api/schema", { method: "POST", body: JSON.stringify({ plan, people }) }), kv);
  assert.equal(res.status, 201);
  const { id } = await res.json();
  assert.match(id, /^[a-z0-9]{12}$/);
  res = await getHandler(id, kv);
  assert.equal(res.status, 200);
  res = await patchHandler(new Request("http://x", { method: "PATCH", body: JSON.stringify({ op: "bogus" }) }), id, kv);
  assert.equal(res.status, 400);
  assert.equal((await getHandler("doesnotexist", kv)).status, 404);
  assert.equal((await createHandler(new Request("http://x", { method: "POST", body: "{" }), kv)).status, 400);
});
