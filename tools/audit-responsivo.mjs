// Varredura de responsividade: overflow horizontal, alvos de toque, texto miúdo
// e desperdício de bytes de imagem, em vários viewports.
//   node tools/audit-responsivo.mjs [url]
import { chromium, devices } from 'playwright';

const URL = process.argv[2] || 'http://localhost:4331/eventos-corporativos';
const VIEWPORTS = [
  ['320 (iPhone SE 1)', 320, 568], ['360 (Android comum)', 360, 800],
  ['390 (iPhone 14)', 390, 844], ['414 (iPhone Plus)', 414, 896],
  ['480 (phablet)', 480, 900], ['600 (dobrável)', 600, 900],
  ['768 (iPad retrato)', 768, 1024], ['834 (iPad Air)', 834, 1112],
  ['1024 (iPad paisagem)', 1024, 768], ['1180 (notebook)', 1180, 820],
  ['1280', 1280, 800], ['1440', 1440, 900], ['1920', 1920, 1080], ['2560', 2560, 1440],
];

const browser = await chromium.launch();
const linhas = [];
const detalhes = [];

for (const [nome, w, h] of VIEWPORTS) {
  const p = await browser.newPage({ viewport: { width: w, height: h }, deviceScaleFactor: 2 });
  await p.goto(URL, { waitUntil: 'networkidle' });
  await p.evaluate(() => document.fonts.ready);
  await p.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 700) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 40)); }
    window.scrollTo(0, 0);
  });
  await p.waitForTimeout(500);

  const r = await p.evaluate((vw) => {
    const doc = document.documentElement;
    const overflow = Math.round(doc.scrollWidth - doc.clientWidth);
    // quem estoura a largura
    const culpados = [];
    if (overflow > 0) {
      document.querySelectorAll('body *').forEach((el) => {
        const b = el.getBoundingClientRect();
        if (b.width === 0) return;
        const dir = b.right - doc.clientWidth;
        if (dir > 1 && getComputedStyle(el).position !== 'fixed') {
          const pai = el.parentElement;
          const paiEstoura = pai && pai.getBoundingClientRect().right - doc.clientWidth > 1;
          if (!paiEstoura) culpados.push(`${el.tagName}.${(el.className || '').toString().split(' ')[0]} +${Math.round(dir)}px`);
        }
      });
    }
    // alvos de toque pequenos (links e botões visíveis)
    const alvos = [];
    document.querySelectorAll('a, button, select, input, textarea').forEach((el) => {
      if (el.offsetParent === null) return;
      if (el.classList.contains('honeypot')) return;   // escondido de propósito
      const b = el.getBoundingClientRect();
      if (b.width === 0 || b.height === 0) return;
      if (b.height < 40 || b.width < 40) {
        const txt = (el.getAttribute('aria-label') || el.textContent || el.name || '').trim().slice(0, 22);
        alvos.push(`${el.tagName}.${(el.className || '').toString().split(' ')[0]}"${txt}" ${Math.round(b.width)}×${Math.round(b.height)}`);
      }
    });
    // texto pequeno demais
    const miudo = new Set();
    document.querySelectorAll('body *').forEach((el) => {
      const t = [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join('');
      if (!t || el.offsetParent === null) return;
      const fs = parseFloat(getComputedStyle(el).fontSize);
      if (fs < 12) miudo.add(`${(el.className || el.tagName).toString().split(' ')[0]} ${fs}px`);
    });
    // desperdício de imagem: quantos bytes de pixel a mais do que o exibido
    let desperdicio = 0, maiorImg = null;
    document.querySelectorAll('img').forEach((img) => {
      const b = img.getBoundingClientRect();
      if (!img.naturalWidth || b.width === 0) return;
      const exibidoCSS = b.width * (window.devicePixelRatio || 1);
      const razao = img.naturalWidth / exibidoCSS;
      if (razao > 1.5) {
        desperdicio++;
        if (!maiorImg || razao > maiorImg.razao) maiorImg = { src: img.currentSrc.split('/').pop(), nat: img.naturalWidth, exib: Math.round(exibidoCSS), razao: +razao.toFixed(1) };
      }
    });
    return {
      overflow, culpados: [...new Set(culpados)].slice(0, 4),
      alvos: [...new Set(alvos)].slice(0, 6), miudo: [...miudo].slice(0, 4),
      altura: document.body.scrollHeight, desperdicio, maiorImg,
      colunasGaleria: getComputedStyle(document.querySelector('.galeria__mosaico') || document.body).gridTemplateColumns?.split(' ').length || 0,
    };
  }, w);

  linhas.push([nome, r.overflow, r.alvos.length, r.miudo.length, r.desperdicio, r.altura]);
  if (r.culpados.length || r.alvos.length || r.miudo.length || r.maiorImg) detalhes.push([nome, r]);
  await p.close();
}
await browser.close();

console.log('\nVARREDURA DE RESPONSIVIDADE — ' + URL);
console.log('='.repeat(96));
console.log('viewport'.padEnd(24) + 'overflow'.padStart(9) + 'alvos<40px'.padStart(12) + 'texto<12px'.padStart(12) + 'img grande'.padStart(12) + 'altura'.padStart(9));
console.log('-'.repeat(96));
for (const [n, o, a, m, d, h] of linhas) {
  console.log(n.padEnd(24) + (o > 0 ? `❌ ${o}px` : '✅ 0').padStart(9) + String(a || '✅ 0').padStart(12) + String(m || '✅ 0').padStart(12) + String(d || '✅ 0').padStart(12) + `${h}px`.padStart(9));
}
console.log('='.repeat(96));
for (const [n, r] of detalhes) {
  console.log(`\n▸ ${n}`);
  if (r.culpados.length) console.log('  estouram a largura: ' + r.culpados.join(' | '));
  if (r.alvos.length) console.log('  alvos pequenos: ' + r.alvos.join(' | '));
  if (r.miudo.length) console.log('  texto miúdo: ' + r.miudo.join(' | '));
  if (r.maiorImg) console.log(`  pior imagem: ${r.maiorImg.src} — ${r.maiorImg.nat}px servidos p/ ${r.maiorImg.exib}px exibidos (${r.maiorImg.razao}×)`);
}
