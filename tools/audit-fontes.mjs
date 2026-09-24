// Auditoria de tipografia: compara, elemento a elemento, o HTML do design com a
// página publicada. Casa os elementos por assinatura de caminho no DOM.
//   node tools/audit-fontes.mjs [urlAstro]
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { chromium } from 'playwright';

const DESIGN_DIR = '../eventos-corporativos/docs para desenvolvimento/ENTREGA';
const ASTRO = process.argv[2] || 'https://espacofazendadaspedras.com.br/eventos-corporativos/';
const mime = { '.html':'text/html','.jpg':'image/jpeg','.JPG':'image/jpeg','.png':'image/png','.svg':'image/svg+xml','.ttf':'font/ttf','.otf':'font/otf' };
const server = http.createServer((q, r) => {
  let p = decodeURIComponent(q.url.split('?')[0]);
  if (p === '/') p = '/fazenda-das-pedras-eventos-corporativos.html';
  const f = path.join(DESIGN_DIR, p);
  if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { 'Content-Type': mime[path.extname(f)] || '' });
  fs.createReadStream(f).pipe(r);
});
await new Promise((r) => server.listen(4399, r));

const PROPS = ['fontFamily','fontWeight','fontStyle','fontSize','lineHeight','letterSpacing','textTransform'];

const coletar = async (browser, url) => {
  const p = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto(url, { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts.ready);
  await p.waitForTimeout(700);
  const dados = await p.evaluate((PROPS) => {
    const chave = (el) => {
      const partes = [];
      let n = el;
      while (n && n !== document.body && partes.length < 6) {
        const irmaos = [...(n.parentElement?.children || [])].filter((c) => c.tagName === n.tagName);
        partes.unshift(`${n.tagName}${n.className && typeof n.className === 'string' ? '.' + n.className.trim().split(/\s+/)[0] : ''}[${irmaos.indexOf(n)}]`);
        n = n.parentElement;
      }
      return partes.join('>');
    };
    const out = {};
    document.querySelectorAll('body *').forEach((el) => {
      if (el.closest('.flatpickr-calendar')) return;
      const txt = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(' ').trim();
      if (!txt) return;
      const cs = getComputedStyle(el);
      out[chave(el)] = { texto: txt.slice(0, 40), ...Object.fromEntries(PROPS.map((k) => [k, cs[k]])) };
    });
    // quais arquivos de fonte o browser realmente usou
    const usados = [...document.fonts].filter((f) => f.status === 'loaded').map((f) => `${f.family}|${f.weight}|${f.style}`).sort();
    return { out, usados };
  }, PROPS);
  await p.close();
  return dados;
};

const browser = await chromium.launch();
const D = await coletar(browser, 'http://localhost:4399/');
const A = await coletar(browser, ASTRO);
await browser.close();
server.close();

const norm = (v) => String(v).replace(/"/g, "'").replace(/,\s+/g, ',');
const chaves = Object.keys(D.out);
const soNoDesign = chaves.filter((k) => !A.out[k]);
const divergentes = [];
for (const k of chaves) {
  const a = D.out[k], b = A.out[k];
  if (!b) continue;
  const difs = PROPS.filter((p) => norm(a[p]) !== norm(b[p]));
  if (difs.length) divergentes.push({ k, texto: a.texto, difs: difs.map((p) => `${p}: ${a[p]} → ${b[p]}`) });
}

console.log('\nFACES CARREGADAS');
console.log('='.repeat(90));
console.log('design :', D.usados.join('  ') || '(nenhuma)');
console.log('astro  :', A.usados.join('  ') || '(nenhuma)');
const faltando = D.usados.filter((f) => !A.usados.includes(f));
const sobrando = A.usados.filter((f) => !D.usados.includes(f));
if (faltando.length) console.log('❌ faces que o design usa e o Astro não:', faltando.join(', '));
if (sobrando.length) console.log('⚠️  faces que só o Astro usa:', sobrando.join(', '));
if (!faltando.length && !sobrando.length) console.log('✅ mesmas faces nos dois');

console.log(`\nELEMENTOS COM TEXTO: ${chaves.length} no design · ${divergentes.length} divergentes · ${soNoDesign.length} sem par (form/estrutura)`);
console.log('='.repeat(90));
for (const d of divergentes) {
  console.log(`\n"${d.texto}"\n  ${d.k}`);
  d.difs.forEach((x) => console.log(`  ↳ ${x}`));
}
if (!divergentes.length) console.log('✅ nenhuma divergência de tipografia');
if (soNoDesign.length) console.log(`\nSem par (esperado no bloco do formulário):\n  ${soNoDesign.slice(0, 14).join('\n  ')}`);
