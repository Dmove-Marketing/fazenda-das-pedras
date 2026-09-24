// QA da /bio — link da bio do Instagram.
//   node tools/qa-bio.mjs [baseUrl]
import { chromium } from 'playwright';
const BASE = process.argv[2] || 'http://localhost:4331';
const URL = `${BASE}/bio`;
const r = [];
const ok = (t, d = '') => r.push(['✅', t, d]);
const fail = (t, d = '') => r.push(['❌', t, d]);

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 390, height: 844 } });
const erros = [];
p.on('pageerror', (e) => erros.push(e.message));
let payload = null;
// Responde 200 no lugar do n8n: o lead nunca sai da máquina, mas o motor
// percorre o caminho feliz inteiro e a confirmação chega a ser renderizada.
// (Abortar levaria ao caminho de erro e esconderia essa parte.)
await p.route('**/server3n8n.dmove.com.br/**', (route) => {
  try { payload = JSON.parse(route.request().postData() || '{}'); } catch {}
  route.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
});

await p.goto(`${URL}?utm_source=instagram&utm_medium=bio`, { waitUntil: 'networkidle' });
await p.waitForTimeout(900);

// ---------- as quatro portas ----------
const esperado = {
  whatsapp: 'wa.me/5511963701306',
  site: 'espacofazendadaspedras.com.br/',
  maps: 'maps.app.goo.gl/i77wFj8ofu5B11qi6',
  waze: 'waze.com/ul/h6gy7tpncz',
};
const portas = await p.evaluate(() =>
  [...document.querySelectorAll('[data-bio]')].map((a) => ({
    id: a.dataset.bio,
    href: a.href,
    alvo: a.target,
    rel: a.rel,
    altura: Math.round(a.getBoundingClientRect().height),
  })));
const faltando = Object.keys(esperado).filter((k) => !portas.find((x) => x.id === k && x.href.includes(esperado[k])));
!faltando.length
  ? ok('As quatro portas com o destino certo', portas.map((x) => x.id).join(' · '))
  : fail('Destino errado ou porta ausente', faltando.join(', '));
portas.every((x) => x.altura >= 44)
  ? ok('Portas com alvo de toque confortável', `${Math.min(...portas.map((x) => x.altura))}px a menor`)
  : fail('Porta pequena demais', portas.filter((x) => x.altura < 44).map((x) => x.id).join(', '));
portas.filter((x) => x.id !== 'whatsapp').every((x) => x.alvo === '_blank' && x.rel.includes('noopener'))
  ? ok('Links externos abrem em nova aba com rel=noopener')
  : fail('Link externo sem target/rel');

// ---------- o botão de WhatsApp abre o popup, não sai da página ----------
const antes = p.url();
await p.click('[data-bio="whatsapp"]');
await p.waitForTimeout(1500);
const depoisDoClique = await p.evaluate(() => ({
  url: location.href,
  popup: !!document.querySelector('.wa-chat')?.classList.contains('is-open')
    || getComputedStyle(document.querySelector('.wa-chat')).display !== 'none',
  eventos: (window.dataLayer || []).filter((e) => e && e.event === 'bio_click').map((e) => e.bio_destino),
}));
depoisDoClique.url === antes
  ? ok('WhatsApp abre o popup de qualificação sem sair da página')
  : fail('WhatsApp navegou para fora', depoisDoClique.url);
depoisDoClique.eventos.includes('whatsapp')
  ? ok('Clique nas portas vira evento no dataLayer', `bio_click → ${depoisDoClique.eventos.join(', ')}`)
  : fail('Sem evento bio_click no dataLayer', JSON.stringify(depoisDoClique.eventos));

// fecha o popup para seguir
await p.evaluate(() => document.querySelector('.wa-close, #wa-close, [aria-label*="Fechar"]')?.click());
await p.waitForTimeout(500);

// ---------- formulário ----------
const visiveis = () => p.evaluate(() =>
  [...document.querySelectorAll('#lead-form .campo')].filter((c) => c.offsetParent !== null)
    .map((c) => c.querySelector('input, select, textarea')?.name));

const etapa1 = await visiveis();
JSON.stringify(etapa1) === JSON.stringify(['nome', 'telefone', 'email'])
  ? ok('Etapa 1: contato, sem campo de empresa', etapa1.join(', '))
  : fail('Etapa 1 divergente', etapa1.join(', '));

const semEmpresa = await p.evaluate(() => !document.querySelector('#form-field-empresa'));
semEmpresa
  ? ok('Preset social: a bio atende todos os segmentos')
  : fail('Campo empresa presente num formulário social');

const opcoes = await p.evaluate(() => document.querySelectorAll('#form-field-tipo_evento option').length);
opcoes === 15
  ? ok('Tipo de evento com a lista canônica completa (14 + placeholder)')
  : fail('Lista de tipo de evento divergente', `${opcoes} opções`);

await p.fill('#form-field-nome', 'Michel Teste');
await p.fill('#form-field-telefone', '11987654321');
await p.fill('#form-field-email', 'contato@teste.com.br');
await p.click('.formulario__avancar');
await p.waitForTimeout(700);

const etapa2 = await visiveis();
JSON.stringify(etapa2) === JSON.stringify(['tipo_evento', 'data_evento', 'convidados', 'detalhes_adicionais'])
  ? ok('Etapa 2: os campos do evento', etapa2.join(', '))
  : fail('Etapa 2 divergente', etapa2.join(', '));

const data = await p.evaluate(() => {
  const el = document.querySelector('#form-field-data_evento');
  el._flatpickr.setDate('20/12/2026', true);
  const v = el.value;
  el._flatpickr.close();
  return { tipo: el.type, nativo: !!document.querySelector('.flatpickr-mobile'), valor: v };
});
data.tipo === 'text' && !data.nativo && data.valor === '20/12/2026'
  ? ok('Data no padrão Dmove (dd/mm/aaaa, Flatpickr)', data.valor)
  : fail('Data fora do padrão', JSON.stringify(data));

await p.selectOption('#form-field-tipo_evento', { label: 'Casamento' });
await p.fill('#form-field-convidados', '180');
await p.click('.form-submit');
await p.waitForTimeout(1500);

const chaves = ['Nome', 'WhatsApp', 'E-mail', 'Tipo de evento', 'Data do evento', 'Convidados'];
const semChave = payload ? chaves.filter((k) => !(k in payload)) : chaves;
payload && !semChave.length
  ? ok('Envio monta o payload canônico', chaves.map((k) => `${k}=${payload[k]}`).join(' · ').slice(0, 130))
  : fail('Payload incompleto', semChave.join(', ') || 'nenhuma requisição');
payload?.Fonte?.startsWith('Landing page/bio')
  ? ok('Fonte identifica a bio', payload.Fonte.split('?')[0])
  : fail('Fonte errada', String(payload?.Fonte));
payload?.Fonte?.includes('utm_source=instagram')
  ? ok('UTMs do Instagram chegam no lead', 'utm_source=instagram')
  : fail('UTMs não propagadas', String(payload?.Fonte));

const sucesso = await p.evaluate(() => document.querySelector('#form-success')?.classList.contains('active'));
sucesso ? ok('Confirmação aparece no lugar do formulário') : fail('Sem confirmação após o envio');

// ---------- página ----------
const meta = await p.evaluate(() => ({
  robots: document.querySelector('meta[name="robots"]')?.content || '',
  gtm: (document.documentElement.outerHTML.match(/GTM-[A-Z0-9]+/) || [])[0] || '',
  canonical: document.querySelector('link[rel="canonical"]')?.href || '',
  eventId: !!window.__page_event_id,
}));
meta.robots.includes('noindex')
  ? ok('Página fora do índice do Google', meta.robots)
  : fail('A bio está indexável', meta.robots || 'sem meta robots');
meta.gtm ? ok('GTM presente', meta.gtm) : fail('GTM ausente');
meta.eventId ? ok('Contrato de tracking ativo (event_id por pageview)') : fail('Sem window.__page_event_id');

const cookies = Object.fromEntries((await p.context().cookies()).map((c) => [c.name, c.value]));
['utm_source', 'utm_medium', '_external_id'].every((k) => cookies[k])
  ? ok('UTMs e _external_id em cookie 1st-party')
  : fail('Cookies de tracking faltando');

erros.length ? fail('Erros de JS', erros.join(' | ')) : ok('Sem erro de JS');
await p.close();
await b.close();

console.log(`\nQA DA /bio — ${URL}\n${'='.repeat(78)}`);
for (const [s, t, d] of r) console.log(`${s} ${t}${d ? `\n     ${d}` : ''}`);
const f = r.filter((x) => x[0] === '❌').length;
console.log('='.repeat(78));
console.log(f ? `${f} FALHA(S)` : 'TUDO VERDE');
process.exit(f ? 1 : 0);
