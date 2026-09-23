// QA por evidência da rota /eventos-corporativos.
//   node tools/qa-eventos-corporativos.mjs [baseUrl]
import { chromium } from 'playwright';
import { mkdir } from 'node:fs/promises';

const BASE = process.argv[2] || 'http://localhost:4331';
const URL  = `${BASE}/eventos-corporativos`;
const OUT  = '_work/qa';
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch();
const results = [];
const ok   = (t, d = '') => results.push(['✅', t, d]);
const fail = (t, d = '') => results.push(['❌', t, d]);
const warn = (t, d = '') => results.push(['⚠️ ', t, d]);

const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const consoleErrors = [];
const failedReqs = [];
// Esperados fora de produção: /cdn-cgi/trace só existe atrás do Cloudflare (o
// forms.ts cai no ipify) e o GTM só resolve quando o cliente informar o ID real.
const toleravel = (u) => u.includes('/cdn-cgi/trace') || u.includes('googletagmanager.com');
const avisos = [];
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  (m.location()?.url && toleravel(m.location().url) ? avisos : consoleErrors).push(m.text());
});
page.on('requestfailed', (r) => (toleravel(r.url()) ? avisos : failedReqs).push(`${r.url()} — ${r.failure()?.errorText}`));
page.on('response', (r) => { if (r.status() >= 400) (toleravel(r.url()) ? avisos : failedReqs).push(`${r.status()} ${r.url()}`); });

await page.goto(`${URL}?utm_source=google&utm_medium=cpc&utm_campaign=fdp_corp&gclid=TESTE123`, { waitUntil: 'networkidle' });

// ---------- 1. Recursos ----------
failedReqs.length ? fail('Requisições', failedReqs.join(' | ')) : ok('Nenhuma requisição falhou (4xx/5xx/erro)');
consoleErrors.length ? fail('Console', consoleErrors.join(' | ')) : ok('Console sem erros');
if (avisos.length) warn('Esperado fora de produção', [...new Set(avisos.map((a) => a.split(' ')[0]))].join(' | '));

// lazy dentro de container fechado (widget WhatsApp) não chega a ser buscada — não é quebra
const imgs = await page.$$eval('img', (els) =>
  els
    .map((e) => ({ src: e.currentSrc || e.src, w: e.naturalWidth, buscada: !!e.currentSrc }))
    .filter((i) => i.buscada && i.w === 0)
);
imgs.length ? fail('Imagens quebradas', imgs.map((i) => i.src).join(' | ')) : ok('Todas as <img> carregaram');

// ---------- 2. Fontes (computed style) ----------
const fontes = await page.evaluate(() => {
  const esperado = { titulo: 'Kalista Serif', corpo: 'Gotham' };
  const fora = [];
  const contagem = {};
  document.querySelectorAll('h1,h2,h3,h4,h5,h6,p,a,span,label,li,button,input,select,textarea,div').forEach((el) => {
    if (el.offsetParent === null && el.tagName !== 'BODY') return;           // invisível
    if (el.type === 'checkbox' || el.type === 'hidden') return;              // sem texto
    if (!el.textContent?.trim() && !['INPUT', 'SELECT', 'TEXTAREA'].includes(el.tagName)) return;
    const ff = getComputedStyle(el).fontFamily;
    contagem[ff] = (contagem[ff] || 0) + 1;
    if (!ff.includes(esperado.titulo) && !ff.includes(esperado.corpo)) {
      fora.push(`${el.tagName}.${el.className || '-'} → ${ff}`);
    }
  });
  const h1 = document.querySelector('h1');
  return { fora: fora.slice(0, 8), total: fora.length, contagem, h1: h1 ? getComputedStyle(h1).fontFamily : null };
});
fontes.total ? fail(`Elementos fora da fonte do design (${fontes.total})`, fontes.fora.join(' | ')) : ok('Todo o texto usa Kalista Serif ou Gotham');
fontes.h1?.includes('Kalista') ? ok('h1 em Kalista Serif', fontes.h1) : fail('h1 fora da fonte do design', String(fontes.h1));

const fontesCarregadas = await page.evaluate(() =>
  [...document.fonts].filter((f) => f.status === 'loaded').map((f) => `${f.family} ${f.weight} ${f.style}`)
);
ok(`Fontes carregadas (${fontesCarregadas.length})`, fontesCarregadas.join(', '));

// ---------- 3. Contrato de tracking ----------
const cookies = Object.fromEntries((await page.context().cookies()).map((c) => [c.name, c.value]));
const esperadosCookie = ['utm_source', 'utm_medium', 'utm_campaign', 'gclid', '_external_id'];
const faltando = esperadosCookie.filter((k) => !cookies[k]);
faltando.length ? fail('Cookies de tracking faltando', faltando.join(', ')) : ok('UTMs + gclid + _external_id gravados em cookie 1st-party');

const eventId = await page.evaluate(() => window.__page_event_id);
eventId ? ok('window.__page_event_id presente', eventId) : fail('window.__page_event_id ausente');

const gtm = await page.evaluate(() => !!document.querySelector('script[src*="googletagmanager"]'));
gtm ? ok('GTM presente') : warn('GTM ausente', 'config.json ainda está com gtm_id = GTM-XXXXXXX (pendente do cliente)');

// PII pelo DOM: os seletores que o container lê
const pii = await page.evaluate(() =>
  ['nome', 'telefone', 'email'].filter((n) => !document.querySelector(`#form-field-${n}`))
);
pii.length ? fail('Seletores de Enhanced Conversions ausentes', pii.join(', ')) : ok('#form-field-nome/telefone/email presentes (Enhanced Conversions)');

// ---------- 4. Formulário ----------
const form = await page.evaluate(() => {
  const f = document.querySelector('#lead-form');
  if (!f) return null;
  return {
    submitUrl: f.dataset.submitUrl,
    gridId: f.dataset.gridId,
    successId: f.dataset.successId,
    honeypot: !!f.querySelector('[name="website"]'),
    campos: [...f.querySelectorAll('input[name],select[name],textarea[name]')]
      .filter((e) => e.name !== 'website')
      .map((e) => ({ name: e.name, id: e.id, required: e.required, tag: e.tagName })),
    opcoesTipoEvento: [...(document.querySelector('#form-field-tipo_evento')?.options || [])].length,
    msg: !!document.querySelector('#form-grid [id$="FormMsg"]'),
    success: !!document.querySelector('#form-success'),
  };
});
if (!form) fail('Formulário não encontrado');
else {
  const esperados = ['empresa', 'nome', 'telefone', 'email', 'tipo_evento', 'data_evento', 'convidados', 'detalhes_adicionais'];
  const nomes = form.campos.map((c) => c.name);
  JSON.stringify(nomes) === JSON.stringify(esperados)
    ? ok('Campos canônicos na ordem do preset corporativo', nomes.join(', '))
    : fail('Campos divergentes do preset', `${nomes.join(', ')} (esperado ${esperados.join(', ')})`);

  const idsErrados = form.campos.filter((c) => c.id !== `form-field-${c.name}`);
  idsErrados.length ? fail('IDs fora do padrão form-field-*', idsErrados.map((c) => c.id).join(', ')) : ok('Todos os campos com id="form-field-<name>"');

  const opcionais = form.campos.filter((c) => !c.required).map((c) => c.name);
  JSON.stringify(opcionais) === JSON.stringify(['detalhes_adicionais'])
    ? ok('detalhes_adicionais é o único campo opcional')
    : fail('Obrigatoriedade divergente', `opcionais: ${opcionais.join(', ') || 'nenhum'}`);

  form.opcoesTipoEvento === 15
    ? ok('tipo_evento com a lista canônica completa (14 opções + placeholder)')
    : fail('tipo_evento com lista divergente', `${form.opcoesTipoEvento} opções`);

  form.submitUrl?.includes('server3n8n') ? ok('data-submit-url apontando pro webhook n8n', form.submitUrl) : fail('Webhook ausente', String(form.submitUrl));
  form.honeypot ? ok('Honeypot anti-spam presente') : fail('Honeypot ausente');
  form.msg && form.success ? ok('Blocos de erro e de sucesso presentes') : fail('Bloco de erro/sucesso ausente');
}

// máscara de telefone
await page.fill('#form-field-telefone', '11987654321');
await page.dispatchEvent('#form-field-telefone', 'input');
const tel = await page.inputValue('#form-field-telefone');
tel === '(11) 98765-4321' ? ok('Máscara de telefone aplicada', tel) : fail('Máscara de telefone', tel);

// flatpickr
await page.click('#form-field-data_evento');
await page.waitForTimeout(400);
const fp = await page.evaluate(() => {
  const el = document.querySelector('#form-field-data_evento');
  const fpi = el?._flatpickr;
  return {
    aberto: !!fpi?.isOpen,
    ptBr: document.querySelector('.flatpickr-weekday')?.textContent?.trim(),
    minHoje: fpi?.config?.minDate ? new Date(fpi.config.minDate).toDateString() === new Date().toDateString() : false,
  };
});
fp.aberto ? ok('Flatpickr abre no campo de data', `pt-BR: "${fp.ptBr}" · minDate = hoje: ${fp.minHoje}`) : fail('Flatpickr não abriu');

// validação bloqueia envio vazio (não dispara lead real)
await page.evaluate(() => document.querySelector('#form-field-data_evento')?._flatpickr?.close());
await page.waitForTimeout(300);
let enviouRequest = false;
await page.route('**/server3n8n.dmove.com.br/**', (route) => { enviouRequest = true; route.abort(); });
await page.click('#lead-form .form-submit');
await page.waitForTimeout(600);
!enviouRequest ? ok('Validação bloqueia envio com campos vazios (nenhum lead disparado)') : fail('Formulário enviou mesmo inválido');

// ---------- 5. Âncoras ----------
const ancoras = await page.evaluate(() =>
  [...document.querySelectorAll('.cabecalho__nav a[href^="#"]')]
    .map((a) => a.getAttribute('href').slice(1))
    .filter((id) => !document.getElementById(id))
);
ancoras.length ? fail('Âncoras do menu sem destino', ancoras.join(', ')) : ok('Todas as âncoras do menu têm destino');

// ---------- 6. Menu mobile (CSS-only + fechamento por JS) ----------
{
  const m = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await m.goto(URL, { waitUntil: 'networkidle' });
  const vis = () => m.evaluate(() => getComputedStyle(document.querySelector('.cabecalho__nav')).visibility);
  const fechadoAntes = await vis();
  await m.click('.cabecalho__botao-menu');
  await m.waitForTimeout(400);
  const aberto = await vis();
  const virouX = await m.evaluate(() => {
    const s1 = document.querySelector('.cabecalho__botao-menu span');
    return getComputedStyle(s1).transform !== 'none';
  });
  await m.click('.cabecalho__nav a[href="#contato"]');
  await m.waitForTimeout(500);
  const fechadoDepois = await vis();
  fechadoAntes === 'hidden' && aberto === 'visible' && fechadoDepois === 'hidden'
    ? ok('Menu mobile abre e fecha ao navegar')
    : fail('Menu mobile', `antes=${fechadoAntes} aberto=${aberto} depois=${fechadoDepois}`);
  virouX ? ok('Hamburger vira "X" com o menu aberto') : fail('Hamburger não anima');
  const tab = await m.evaluate(() => [...document.querySelectorAll('[tabindex]')].map((e) => +e.getAttribute('tabindex')).filter((t) => t > 0).length);
  tab === 0 ? ok('Nenhum tabindex > 0') : fail('tabindex > 0 encontrado', String(tab));
  await m.close();
}

// ---------- 7. Screenshots ----------
for (const [nome, vw, vh] of [['desktop', 1440, 900], ['mobile', 390, 844]]) {
  const p = await browser.newPage({ viewport: { width: vw, height: vh }, deviceScaleFactor: 1 });
  await p.goto(URL, { waitUntil: 'networkidle' });
  const alturaTotal = await p.evaluate(() => document.body.scrollHeight);
  let y = 0, i = 1;
  while (y < alturaTotal && i <= 14) {
    await p.evaluate((v) => window.scrollTo(0, v), y);
    await p.waitForTimeout(450);
    await p.screenshot({ path: `${OUT}/${nome}-${String(i).padStart(2, '0')}.png` });
    y += vh; i++;
  }
  ok(`Screenshots ${nome}`, `${i - 1} frames · altura ${alturaTotal}px`);
  await p.close();
}

await browser.close();

console.log(`\nQA — ${URL}\n${'='.repeat(78)}`);
for (const [s, t, d] of results) console.log(`${s} ${t}${d ? `\n     ${d}` : ''}`);
const falhas = results.filter((r) => r[0] === '❌').length;
console.log(`${'='.repeat(78)}\n${falhas ? `${falhas} FALHA(S)` : 'TUDO VERDE'} · ${results.filter((r) => r[0] === '⚠️ ').length} aviso(s)`);
process.exit(falhas ? 1 : 0);
