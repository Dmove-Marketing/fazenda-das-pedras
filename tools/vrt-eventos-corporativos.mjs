// VRT greenfield: compara a rota construída com o HTML do time de criação.
//   node tools/vrt-eventos-corporativos.mjs
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';

const DESIGN_DIR = '../eventos-corporativos/docs para desenvolvimento/ENTREGA';
const LOCAL = 'http://localhost:4331/eventos-corporativos';
const OUT = '_work/vrt';
fs.mkdirSync(OUT, { recursive: true });

const mime = { '.html': 'text/html', '.jpg': 'image/jpeg', '.JPG': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.svg': 'image/svg+xml', '.ttf': 'font/ttf', '.otf': 'font/otf' };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/fazenda-das-pedras-eventos-corporativos.html';
  const file = path.join(DESIGN_DIR, p);
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream' });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(4399, r));

const browser = await chromium.launch();
const shot = async (url, viewport, file, esconderWidget) => {
  const p = await browser.newPage({ viewport });
  await p.goto(url, { waitUntil: 'networkidle' });
  if (esconderWidget) await p.addStyleTag({ content: '.wa-widget,.wa-teaser,[class*="wa-"]{display:none!important}' });
  // rola a página inteira para disparar o lazy-load...
  await p.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 400) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 90)); }
    window.scrollTo(0, 0);
  });
  // ...e espera TODAS as imagens terminarem. Sem isso o fullPage sai com buracos
  // e a comparação vira ruído: o que se mede é o print, não a página.
  // as fotos dos lightbox ficam ocultas e só carregam ao abrir — não entram na espera
  const visiveis = '[...document.images].filter((i) => i.offsetParent !== null)';
  await p.waitForFunction(`${visiveis}.every((i) => i.complete && i.naturalWidth > 0)`, null, { timeout: 45000 })
    .catch(async () => {
      const faltando = await p.evaluate(() => [...document.images].filter((i) => i.offsetParent !== null && (!i.complete || !i.naturalWidth)).map((i) => i.currentSrc.split('/').pop() || i.src));
      console.warn(`  ⚠️  ${faltando.length} imagem(ns) não carregaram: ${faltando.slice(0, 4).join(', ')}`);
    });
  await p.waitForTimeout(600);
  await p.screenshot({ path: file, fullPage: true });
  const h = await p.evaluate(() => document.body.scrollHeight);
  await p.close();
  return h;
};

const resultados = [];
for (const [nome, viewport] of [['desktop', { width: 1440, height: 900 }], ['tablet', { width: 768, height: 1024 }], ['mobile', { width: 390, height: 844 }]]) {
  const a = `${OUT}/${nome}-design.png`;
  const b = `${OUT}/${nome}-astro.png`;
  const hDesign = await shot('http://localhost:4399/', viewport, a, false);
  const hAstro  = await shot(LOCAL, viewport, b, true);

  const imgA = PNG.sync.read(fs.readFileSync(a));
  const imgB = PNG.sync.read(fs.readFileSync(b));
  const w = Math.min(imgA.width, imgB.width);
  const h = Math.min(imgA.height, imgB.height);
  const crop = (img) => {
    const out = new PNG({ width: w, height: h });
    PNG.bitblt(img, out, 0, 0, w, h, 0, 0);
    return out;
  };
  const ca = crop(imgA), cb = crop(imgB);
  const diff = new PNG({ width: w, height: h });
  const n = pixelmatch(ca.data, cb.data, diff.data, w, h, { threshold: 0.25 });
  fs.writeFileSync(`${OUT}/${nome}-diff.png`, PNG.sync.write(diff));
  resultados.push({ nome, hDesign, hAstro, deltaAltura: hAstro - hDesign, pct: ((n / (w * h)) * 100).toFixed(2) });
}

await browser.close();
server.close();

console.log('\nVRT — design (HTML de criação) × Astro');
console.log('='.repeat(72));
for (const r of resultados) {
  console.log(`${r.nome.padEnd(8)} altura design ${String(r.hDesign).padStart(5)}px · astro ${String(r.hAstro).padStart(5)}px · Δ ${String(r.deltaAltura).padStart(5)}px · pixels diferentes ${r.pct}%`);
}
console.log('='.repeat(72));
console.log('Imagens em _work/vrt/ (design, astro, diff por viewport).');
