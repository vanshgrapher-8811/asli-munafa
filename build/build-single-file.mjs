// Build: no dependencies, just Node.
//   dist/index.html + app.js + styles + fonts + icons + sw.js + _headers   → deploy this folder
//   dist/asli-munafa.html                                                  → one self-contained offline file
import { readFile, writeFile, mkdir, rm, readdir, copyFile, stat } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist');
const MODULES = ['config', 'engine', 'presets', 'i18n', 'share', 'ui']; // dependency order
const LEGAL_PAGES = ['privacy.html', 'terms.html', '404.html'];

// Normalise line endings: the HTML parser turns CRLF into LF before hashing inline scripts.
const read = async (p) => (await readFile(join(ROOT, p), 'utf8')).replace(/\r\n?/g, '\n');
const sha = (s, enc = 'hex') => createHash('sha256').update(s).digest(enc);

// Turn each ES module into a scoped block so the whole app ships as one classic script.
function bundle(sources) {
  const parts = [];
  for (const name of MODULES) {
    let code = sources[name];
    const exported = [];
    code = code.replace(/^import\s*\{([^}]*)\}\s*from\s*'\.\/(\w+)\.js';\s*$/gm, (m, names, from) => {
      if (!MODULES.includes(from)) throw new Error(`Unknown import ${from} in ${name}`);
      const list = names.split(',').map((s) => s.trim()).filter(Boolean).map((s) => s.replace(/\s+as\s+/, ': '));
      return `const { ${list.join(', ')} } = __mod_${from};`;
    });
    code = code.replace(/^export\s+(async\s+function|function|const|let|class)\s+(\w+)/gm, (m, kind, id) => {
      exported.push(id);
      return `${kind} ${id}`;
    });
    if (/^\s*(import|export)\s/m.test(code)) throw new Error(`Unhandled import/export in ${name}.js`);
    parts.push(`// ---- ${name}.js\nconst __mod_${name} = (() => {\n${code}\nreturn { ${exported.join(', ')} };\n})();`);
  }
  return `/* Asli Munafa · bundled from src/*.js · no network, no tracking */\n(() => {\n'use strict';\n${parts.join('\n\n')}\n})();\n`;
}

// Safe CSS minify: drop comments and collapse whitespace (no renaming, no reordering).
function minifyCss(css) {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .replace(/\s*([{};,>])\s*/g, '$1')
    .replace(/;}/g, '}')
    .trim();
}

async function listFiles(dir) {
  return (await readdir(join(ROOT, dir))).filter((f) => !f.startsWith('.'));
}

async function main() {
  await rm(DIST, { recursive: true, force: true });
  await mkdir(join(DIST, 'styles'), { recursive: true });
  await mkdir(join(DIST, 'fonts'), { recursive: true });
  await mkdir(join(DIST, 'icons'), { recursive: true });

  const sources = {};
  for (const m of MODULES) sources[m] = await read(`src/${m}.js`);
  const js = bundle(sources);
  if (/<\/script/i.test(js) || /<!--/.test(js)) throw new Error('Bundle contains </script or <!--');
  const css = await read('styles/main.css');
  const html = await read('index.html');
  const fonts = (await listFiles('fonts')).filter((f) => f.endsWith('.woff2'));
  const favicon = await read('icons/favicon.svg');
  const version = sha(js + css + html).slice(0, 10);

  // ---- multi-file site
  const jsName = `app.${sha(js).slice(0, 8)}.js`;
  const cssMin = minifyCss(css);
  const cssName = `styles/main.${sha(cssMin).slice(0, 8)}.css`;
  await writeFile(join(DIST, jsName), js);
  await writeFile(join(DIST, cssName), cssMin);
  await writeFile(join(DIST, 'robots.txt'), 'User-agent: *\nAllow: /\n');
  // Static legal pages and the 404 page (no scripts).
  for (const page of LEGAL_PAGES) await writeFile(join(DIST, page), await read(page));
  await writeFile(join(DIST, 'styles/legal.css'), minifyCss(await read('styles/legal.css')));
  for (const f of fonts) await copyFile(join(ROOT, 'fonts', f), join(DIST, 'fonts', f));
  await writeFile(join(DIST, 'icons/favicon.svg'), favicon);
  const siteHtml = html
    .replace('<script type="module" src="src/ui.js"></script>', `<script src="${jsName}" defer></script>`)
    .replace('<link rel="stylesheet" href="styles/main.css">', `<link rel="stylesheet" href="${cssName}">`);
  if (siteHtml === html) throw new Error('Could not find the module script tag in index.html');
  await writeFile(join(DIST, 'index.html'), siteHtml);

  const shell = ['./', './index.html', './privacy.html', './terms.html', './styles/legal.css', `./${jsName}`, `./${cssName}`, './icons/favicon.svg', ...fonts.map((f) => `./fonts/${f}`)];
  const sw = (await read('src/sw.js')).replace("'__VERSION__'", `'${version}'`).replace('= __FILES__;', `= ${JSON.stringify(shell, null, 2)};`);
  if (sw.includes("'__VERSION__'") || sw.includes('= __FILES__')) throw new Error('sw.js placeholders not filled');
  await writeFile(join(DIST, 'sw.js'), sw);

  // The page itself may not connect anywhere. The service worker gets its own policy:
  // it may fetch this site's own files (to cache them) and nothing else.
  const csp = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none'; worker-src 'self'; manifest-src 'none'; frame-ancestors 'none'";
  await writeFile(join(DIST, '_headers'), [
    '/*',
    `  Content-Security-Policy: ${csp}`,
    '  Referrer-Policy: no-referrer',
    '  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
    '  X-Content-Type-Options: nosniff',
    '  X-Frame-Options: DENY',
    '  Cross-Origin-Opener-Policy: same-origin',
    '/sw.js',
    '  ! Content-Security-Policy',
    "  Content-Security-Policy: default-src 'none'; connect-src 'self'",
    '  Cache-Control: no-cache',
    '/index.html',
    '  Cache-Control: no-cache',
    '/fonts/*',
    '  Cache-Control: public, max-age=31536000, immutable',
    '/app.*',
    '  Cache-Control: public, max-age=31536000, immutable',
    '/styles/*',
    '  Cache-Control: public, max-age=31536000, immutable',
    // Cloudflare serves /asli-munafa.html at /asli-munafa ("pretty URLs"): always download it, never render it here.
    '/asli-munafa.html',
    '  Content-Disposition: attachment; filename="asli-munafa.html"',
    '/asli-munafa',
    '  Content-Disposition: attachment; filename="asli-munafa.html"',
    '',
  ].join('\n'));

  // ---- single self-contained file
  let inlineCss = cssMin;
  for (const f of fonts) {
    const b64 = (await readFile(join(ROOT, 'fonts', f))).toString('base64');
    inlineCss = inlineCss.split(`url(../fonts/${f})`).join(`url(data:font/woff2;base64,${b64})`);
  }
  if (/url\(\.\.\/fonts/.test(inlineCss)) throw new Error('A font reference was not inlined');
  const scriptHash = sha(js, 'base64');
  const singleCsp = `default-src 'none'; script-src 'sha256-${scriptHash}'; style-src 'unsafe-inline'; img-src data: blob:; font-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none'`;
  // The offline file has no neighbouring pages, so its legal links point at the live site.
  const site = `https://${sources.config.match(/SITE_URL:\s*'([^']+)'/)[1]}`;
  let single = html
    .replace(/href="(privacy|terms)\.html"/g, (m, page) => `href="${site}/${page}" rel="noopener noreferrer"`)
    .replace('<html lang="en">', '<html lang="en" data-single="1">')
    .replace(/<meta http-equiv="Content-Security-Policy" content="[^"]*">/, `<meta http-equiv="Content-Security-Policy" content="${singleCsp}">`)
    .replace(/<link rel="preload"[^>]*>\n/g, '')
    .replace('<link rel="icon" href="icons/favicon.svg" type="image/svg+xml">', `<link rel="icon" href="data:image/svg+xml;base64,${Buffer.from(favicon).toString('base64')}" type="image/svg+xml">`)
    .replace('<link rel="stylesheet" href="styles/main.css">', () => `<style>\n${inlineCss}\n</style>`)
    .replace('<script type="module" src="src/ui.js"></script>\n', '')
    .replace('</body>', () => `<script>${js}</script>\n</body>`);
  if (/src="src\/|href="styles\//.test(single)) throw new Error('Single file still references external files');
  await writeFile(join(DIST, 'asli-munafa.html'), single);

  // ---- report
  const size = async (p) => (await stat(join(DIST, p))).size;
  const kb = (n) => `${(n / 1024).toFixed(1)} KB`;
  const pageWeight = (await size('index.html')) + (await size(jsName)) + (await size(cssName)) + (await size('icons/favicon.svg'));
  let fontWeight = 0;
  for (const f of fonts) fontWeight += await size(`fonts/${f}`);
  console.log(`version     ${version}`);
  console.log(`index.html  ${kb(await size('index.html'))}`);
  console.log(`${jsName.padEnd(11)} ${kb(await size(jsName))}`);
  console.log(`main.css    ${kb(await size(cssName))}`);
  console.log(`page total  ${kb(pageWeight)} (budget 250 KB, fonts excluded)`);
  console.log(`fonts       ${kb(fontWeight)} in ${fonts.length} files`);
  console.log(`single file ${kb(await size('asli-munafa.html'))}`);
  if (pageWeight > 250 * 1024) { console.error('Over the 250 KB budget'); process.exitCode = 1; }
}

main().catch((e) => { console.error(e); process.exit(1); });
