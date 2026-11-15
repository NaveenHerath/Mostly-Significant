// Scores the chat box's two matchers on the questions in tests.json and writes results.csv.
// The on-device model is always scored. Gemini is scored too when GEMINI_API_KEY is set
// (PowerShell: $env:GEMINI_API_KEY = "..."; node evaluate.mjs).
// It uses the site's own phrases.js, matcher.js and api/route.js, so the scores are for the code the site runs.
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import { pipeline, env } from "@huggingface/transformers";

const docs = new URL("../docs/", import.meta.url);
const read = (name) => fs.readFileSync(new URL(name, docs), "utf8");

// The site's phrase list and decision rules, loaded from the same files the browser loads.
const site = vm.runInNewContext(`${read("phrases.js")}\n${read("matcher.js")}\n({ MATCH_PHRASES, DECOYS, MATCHER_MODEL, scoreAgainst, decide })`);
const tests = JSON.parse(fs.readFileSync(new URL("tests.json", import.meta.url), "utf8"));

// The same model file the site serves, read from docs/models.
env.localModelPath = new URL("models/", docs).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const embed = await pipeline("feature-extraction", site.MATCHER_MODEL, { dtype: "q8" });
const toVectors = async (texts) => (await embed(texts, { pooling: "mean", normalize: true })).tolist();

const refs = [];
for (const [m, list] of Object.entries(site.MATCH_PHRASES)) for (const p of list) refs.push({ id: m, phrase: p });
for (const [topic, d] of Object.entries(site.DECOYS)) for (const p of d.phrases) refs.push({ id: `none:${topic}`, phrase: p });
const refVectors = await toVectors(refs.map((r) => r.phrase));
const questionVectors = await toVectors(tests.map((t) => t.question));

// Gemini is called through the site's own server function, with a stand-in for Vercel's request and response.
const handler = createRequire(import.meta.url)("../docs/api/route.js");
async function askGemini(text) {
  let out = null;
  const res = { status() { return res; }, json(body) { out = body; return res; } };
  for (let attempt = 0; attempt < 3; attempt++) { // a busy or rate-limited moment gets two more tries, so the score is of Gemini's answers and not its uptime
    await handler({ method: "POST", body: { text } }, res);
    if (!out.error) break;
    await new Promise((r) => setTimeout(r, 15000));
  }
  return out.error ? `error: ${out.error}` : out.measure || "none";
}
const useGemini = !!process.env.GEMINI_API_KEY;

// One of four outcomes per answer. "wrong" is the costly one: a confident match to the wrong measure.
function grade(expected, got) {
  if (expected.includes(got)) return "right";
  if (got.startsWith("error")) return "error";
  if (expected[0] === "none") return "false_accept"; // untestable, but given a measure
  if (got === "none") return "missed"; // testable, but called untestable
  return "wrong";
}

const rows = [];
for (const [i, t] of tests.entries()) {
  const d = site.decide(site.scoreAgainst(questionVectors[i], refs, refVectors));
  const device = d.measure || "none";
  const gemini = useGemini ? await askGemini(t.question) : "";
  if (useGemini) await new Promise((r) => setTimeout(r, 4500)); // stays inside the free tier's requests-per-minute limit
  rows.push({ ...t, device, device_score: d.score.toFixed(2), device_grade: grade(t.expected, device), gemini, gemini_grade: useGemini ? grade(t.expected, gemini) : "" });
}

const csv = (v) => (/[",]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
const header = ["question", "kind", "expected", "device", "device_score", "device_grade", "gemini", "gemini_grade"];
const lines = rows.map((r) => [r.question, r.kind, r.expected.join("|"), r.device, r.device_score, r.device_grade, r.gemini, r.gemini_grade].map(csv).join(","));
fs.writeFileSync(new URL("results.csv", import.meta.url), [header.join(","), ...lines].join("\n") + "\n");

const tally = (key) => rows.reduce((c, r) => ({ ...c, [r[key]]: (c[r[key]] || 0) + 1 }), {});
console.log(`${tests.length} questions`);
console.log("on-device model:", tally("device_grade"));
if (useGemini) console.log("gemini:         ", tally("gemini_grade"));
else console.log("gemini: not scored (GEMINI_API_KEY is not set)");
for (const r of rows.filter((r) => r.device_grade !== "right")) console.log(`  device ${r.device_grade}: "${r.question}" -> ${r.device} (${r.device_score}), expected ${r.expected.join("|")}`);
