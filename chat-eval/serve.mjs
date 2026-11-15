// A small local server for testing the chat box: it serves docs/ and runs docs/api/route.js the way Vercel does.
// The Gemini key is read from .env.local at the top of the repo (git ignores that file).
// Run: node chat-eval/serve.mjs   then open http://localhost:8765
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const docs = path.join(root, "docs");
const envFile = path.join(root, ".env.local");
if (fs.existsSync(envFile)) for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)$/); // NAME=value lines; comments are skipped
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
}
const handler = createRequire(import.meta.url)(path.join(docs, "api", "route.js"));
const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".webp": "image/webp", ".mp4": "video/mp4", ".onnx": "application/octet-stream" };

http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname === "/api/route") { // the same request and response helpers Vercel gives the function
    let raw = "";
    for await (const chunk of req) raw += chunk;
    try { req.body = raw ? JSON.parse(raw) : {}; } catch { req.body = {}; }
    res.status = (code) => { res.statusCode = code; return res; };
    res.json = (body) => { res.setHeader("content-type", "application/json"); res.end(JSON.stringify(body)); return res; };
    return handler(req, res);
  }
  const file = path.join(docs, url.pathname === "/" ? "index.html" : decodeURIComponent(url.pathname));
  if (!file.startsWith(docs) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.statusCode = 404; return res.end("not found"); }
  res.setHeader("content-type", TYPES[path.extname(file)] || "application/octet-stream");
  fs.createReadStream(file).pipe(res);
}).listen(8765, () => console.log(`http://localhost:8765  (Gemini key ${process.env.GEMINI_API_KEY ? "found" : "missing, so only the on-device model will answer"})`));
