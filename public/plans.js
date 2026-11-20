// Ready-made training plans and date helpers. Plans are general beginner-friendly schedules
// with three runs per week: an easy run, a run with variation and a long run.

export const KINDS = {
  easy: "Rustig",
  var: "Variatie",
  long: "Lange loop",
  race: "Wedstrijd",
  other: "Anders",
};

export const MON = ["jan", "feb", "mrt", "apr", "mei", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];
export const WD = ["ma", "di", "wo", "do", "vr", "za", "zo"]; // index = day offset from Monday

export const parseDate = (s) => { const [y, m, d] = s.split("-").map(Number); return new Date(y, m - 1, d); };
export const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
export const mondayOf = (d) => addDays(d, -((d.getDay() + 6) % 7));
export const fmt = (d) => `${d.getDate()} ${MON[d.getMonth()]}`;
export const dayName = (d) => WD[(d.getDay() + 6) % 7];
export const today = () => { const t = new Date(); return new Date(t.getFullYear(), t.getMonth(), t.getDate()); };

const km = (x) => `${String(x).replace(".", ",")} km`;

export function runId() {
  const a = "abcdefghijkmnpqrstuvwxyz23456789";
  const b = new Uint8Array(8);
  crypto.getRandomValues(b);
  return Array.from(b, (x) => a[x % a.length]).join("");
}

const VARIATION = [
  (x) => `${km(x)} met 4–6 korte versnellingen`,
  (x) => `${km(x)} progressief (laatste stuk sneller)`,
  (x) => `${km(x)} met 6× 1 min sneller`,
  (x) => `${km(x)} met heuvels of trappen`,
];

// easy/long: distance per week for every week before race week
export const TEMPLATES = {
  "5k": {
    label: "5 km (8 weken)",
    race: 5,
    easy: [2.5, 3, 3, 3.5, 3.5, 4, 4],
    vari: [2.5, 3, 3, 3.5, 3.5, 4, 3.5],
    long: [3, 3.5, 4, 4.5, 5, 5.5, 6],
  },
  "10k": {
    label: "10 km (10 weken)",
    race: 10,
    easy: [4, 4, 5, 5, 5, 6, 6, 6, 5],
    vari: [4, 4.5, 5, 5, 5.5, 6, 6, 6, 5],
    long: [5, 6, 7, 7, 8, 9, 10, 11, 8],
  },
  "15k": {
    label: "12 à 15 km (11 weken)",
    race: null, // the race distance comes from the title, e.g. "12 km"
    easy: [5, 5, 5, 6, 6, 6, 6, 6, 6, 5],
    vari: [5, 5.5, 6, 6, 6.5, 7, 7, 7, 7, 5.5],
    long: [6, 7, 8, 9, 10, 11, 12, 13, 13, 9],
  },
  half: {
    label: "Halve marathon (12 weken)",
    race: 21.1,
    easy: [5, 5, 6, 6, 6, 7, 7, 7, 8, 7, 6],
    vari: [5, 6, 6, 6.5, 7, 7, 7.5, 8, 8, 7, 6],
    long: [8, 9, 10, 11, 12, 13, 14, 15, 17, 18, 14],
  },
  empty: {
    label: "Leeg schema, zelf invullen",
  },
};

export const DEFAULT_TIPS = [
  "Rustig = praattempo: je kunt nog gewoon een gesprek voeren.",
  "Variatie = een deel sneller lopen, met korte versnellingen, intervallen of heuvels.",
  "Lange loop = je langste loop van de week, rustig tempo.",
  "Krachttraining 1–2× per week helpt: squats, lunges, bruggetje, kuitheffen, plank.",
  "Luister naar je lichaam. Bij pijn of grote vermoeidheid: aanpassen of rust nemen.",
].join("\n");

// Build a plan from a template so that the last week contains the race date.
export function buildPlan({ template, title, race, weeks: emptyWeeks = 8, start }) {
  const t = TEMPLATES[template];
  if (!t) throw new Error("Onbekend schema");
  const raceDate = race ? parseDate(race) : null;

  if (template === "empty") {
    const n = Math.max(1, Math.min(52, Number(emptyWeeks) || 8));
    const first = start ? mondayOf(parseDate(start)) : raceDate ? addDays(mondayOf(raceDate), -(n - 1) * 7) : mondayOf(today());
    const weeks = Array.from({ length: n }, () => ({
      runs: [
        { id: runId(), k: "easy", d: "", day: 1 },
        { id: runId(), k: "var", d: "", day: 3 },
        { id: runId(), k: "long", d: "", day: 6 },
      ],
    }));
    if (raceDate) {
      const last = weeks[n - 1];
      const ro = Math.round((raceDate - mondayOf(raceDate)) / 864e5);
      last.runs = last.runs.filter((r) => r.day < ro).slice(0, 2);
      last.runs.push({ id: runId(), k: "race", d: title, day: ro });
    }
    return { title, start: iso(first), race: race || null, tips: DEFAULT_TIPS, weeks };
  }

  const n = t.easy.length + 1;
  const end = raceDate || addDays(mondayOf(today()), (n - 1) * 7 + 6);
  const first = addDays(mondayOf(end), -(n - 1) * 7);
  const weeks = t.easy.map((e, i) => ({
    runs: [
      { id: runId(), k: "easy", d: km(e), day: 1 },
      { id: runId(), k: "var", d: VARIATION[i % VARIATION.length](t.vari[i]), day: 3 },
      { id: runId(), k: "long", d: km(t.long[i]), day: 6 },
    ],
  }));
  // race week: a light run or two, then the race
  const ro = Math.round((end - mondayOf(end)) / 864e5);
  const lastEasy = t.easy[t.easy.length - 1];
  const runs = [
    { id: runId(), k: "easy", d: km(Math.max(2, Math.round(lastEasy * 0.7 * 2) / 2)), day: 1 },
    { id: runId(), k: "var", d: `${km(Math.max(2, Math.round(lastEasy * 0.5 * 2) / 2))} met 3 korte versnellingen (of rust)`, day: 3 },
  ].filter((r) => r.day < ro - 1 || (r.k === "easy" && r.day < ro));
  runs.push({ id: runId(), k: "race", d: t.race && !/km|marathon/i.test(title) ? `${title} (${km(t.race)})` : title, day: ro });
  weeks.push({ runs });
  return { title, start: iso(first), race: raceDate ? iso(raceDate) : null, tips: DEFAULT_TIPS, weeks };
}
