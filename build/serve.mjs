// Tiny local server for dist/, sending the same security headers as Cloudflare Pages (_headers).
// Usage: node build/serve.mjs [port]   → http://localhost:4173
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { join, extname, normalize, dirname } from 'node:path';
import { brotliCompressSync, gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';

const DIST = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const PORT = Number(process.argv[2] || process.env.PORT || 4173);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.json': 'application/json', '.txt': 'text/plain',
};

// Minimal _headers parser: "/path" or "/prefix/*" rules, "! Name" detaches, later rules add.
async function loadHeaderRules() {
  const text = await readFile(join(DIST, '_headers'), 'utf8').catch(() => '');
  const rules = [];
  let cur = null;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    if (!/^\s/.test(line)) { cur = { pattern: line.trim(), set: [], unset: [] }; rules.push(cur); continue; }
    const l = line.trim();
    if (l.startsWith('!')) cur.unset.push(l.slice(1).trim().toLowerCase());
    else { const i = l.indexOf(':'); cur.set.push([l.slice(0, i).trim(), l.slice(i + 1).trim()]); }
  }
  return rules;
}

function headersFor(rules, path) {
  const out = new Map();
  for (const r of rules) {
    const p = r.pattern;
    const match = p.endsWith('*') ? path.startsWith(p.slice(0, -1)) : path === p;
    if (!match) continue;
    for (const u of r.unset) out.delete(u);
    for (const [k, v] of r.set) out.set(k.toLowerCase(), [k, v]);
  }
  return [...out.values()];
}

const rules = await loadHeaderRules();
createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path.endsWith('/')) path += 'index.html';
    const file = normalize(join(DIST, path));
    if (!file.startsWith(DIST)) { res.writeHead(403).end(); return; }
    const s = await stat(file);
    if (!s.isFile()) throw new Error('not a file');
    const body = await readFile(file);
    for (const [k, v] of headersFor(rules, path)) res.setHeader(k, v);
    res.setHeader('Content-Type', TYPES[extname(file)] || 'application/octet-stream');
    // Compress text like Cloudflare does in production.
    const enc = String(req.headers['accept-encoding'] || '');
    if (/\.(html|js|css|svg|txt|json)$/.test(file) && enc.includes('br')) {
      res.setHeader('Content-Encoding', 'br');
      res.setHeader('Vary', 'Accept-Encoding');
      res.writeHead(200).end(brotliCompressSync(body));
    } else if (/\.(html|js|css|svg|txt|json)$/.test(file) && enc.includes('gzip')) {
      res.setHeader('Content-Encoding', 'gzip');
      res.setHeader('Vary', 'Accept-Encoding');
      res.writeHead(200).end(gzipSync(body));
    } else {
      res.writeHead(200).end(body);
    }
    console.log(`200 ${req.method} ${path}`);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('Not found');
    console.log(`404 ${req.method} ${req.url}`);
  }
}).listen(PORT, () => console.log(`Asli Munafa → http://localhost:${PORT}  (serving dist/)`));
