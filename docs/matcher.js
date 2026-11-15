// the on-device matcher: a small neural network (all-MiniLM-L12-v2) that runs in the browser with transformers.js
// it turns a sentence into 384 numbers that stand for its meaning, so "nights are unbearable" lands near "nights are too warm to sleep"
// no api key and no server, which makes it the backup when gemini can't be reached

const MATCHER_LIB = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.2"; // transformers.js, pinned so it can't change under us
const MATCHER_MODEL = "Xenova/all-MiniLM-L12-v2"; // 32 MB, served from our own models/ folder
const MATCHER_BAR = 0.4; // a best score under this means nothing is close enough, so "can't test that"
const MATCHER_CLOSE = 0.08; // other hunches within this of the best are offered as "did you mean"

let matcherReady = null; // the promise for the loaded model and phrase vectors, so it only loads once

function loadMatcher() { // downloads the model and turns every example phrase into its vector
  if (matcherReady) return matcherReady; // already loading or loaded
  matcherReady = (async () => {
    const { pipeline, env } = await import(MATCHER_LIB); // the library, fetched only when the chat box is used
    env.remoteHost = new URL("models/", location.href).href; // the model files come from our own docs/models/ folder
    env.remotePathTemplate = "{model}/"; // so nothing is fetched from hugging face, and the backup doesn't depend on a third site
    const embed = await pipeline("feature-extraction", MATCHER_MODEL, { dtype: "q8" }); // the small 8-bit version of the model
    const toVectors = async (texts) => (await embed(texts, { pooling: "mean", normalize: true })).tolist(); // sentences in, unit-length vectors out

    const refs = []; // every example phrase with the id it stands for
    for (const [m, list] of Object.entries(MATCH_PHRASES)) for (const p of list) refs.push({ id: m, phrase: p }); // the 17 hunches
    for (const [topic, d] of Object.entries(DECOYS)) for (const p of d.phrases) refs.push({ id: `none:${topic}`, phrase: p }); // the untestable topics
    const vectors = await toVectors(refs.map((r) => r.phrase)); // one vector per phrase
    return { toVectors, refs, vectors }; // everything a match needs
  })();
  matcherReady.catch(() => { matcherReady = null; }); // a failed load can be tried again
  return matcherReady;
}

function scoreAgainst(q, refs, vectors) { // the best score for each id, highest first
  const best = {}; // id -> its closest phrase's score
  refs.forEach((r, i) => {
    const s = q.reduce((sum, v, k) => sum + v * vectors[i][k], 0); // cosine similarity (the vectors are unit length)
    if (!(r.id in best) || s > best[r.id]) best[r.id] = s; // keep each id's best phrase
  });
  return Object.entries(best).map(([id, score]) => ({ id, score })).sort((a, b) => b.score - a.score);
}

function decide(ranked) { // turns the ranked scores into an answer: a measure, or the reason it can't be tested
  const top = ranked[0];
  if (top.score < MATCHER_BAR) return { measure: null, topic: null, score: top.score, alternatives: [] }; // nothing close: off topic
  if (top.id.startsWith("none:")) return { measure: null, topic: top.id.slice(5), score: top.score, alternatives: [] }; // closest to an untestable topic
  const alternatives = ranked.slice(1) // the near misses, offered as "did you mean"
    .filter((r) => !r.id.startsWith("none:") && r.score >= MATCHER_BAR && top.score - r.score <= MATCHER_CLOSE)
    .slice(0, 2).map((r) => r.id);
  return { measure: top.id, topic: null, score: top.score, alternatives };
}

async function matchHunch(text) { // the one function the chat box calls
  const { toVectors, refs, vectors } = await loadMatcher();
  const [q] = await toVectors([text]); // the question's vector
  return decide(scoreAgainst(q, refs, vectors));
}
