// Fluxo do formulário: duas etapas no celular, bloco único no desktop.
//   node tools/qa-formulario.mjs [baseUrl]
import { chromium } from 'playwright';
const BASE = process.argv[2] || 'http://localhost:4331';
const URL = `${BASE}/eventos-corporativos`;
const r = [];
const ok = (t, d = '') => r.push(['✅', t, d]);
const fail = (t, d = '') => r.push(['❌', t, d]);

const b = await chromium.launch();
const visiveis = (p) => p.evaluate(() =>
  [...document.querySelectorAll('#lead-form .campo')].filter((c) => c.offsetParent !== null)
    .map((c) => c.querySelector('input, select, textarea')?.name));

// ———————————————————— celular ————————————————————
{
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  const erros = [];
  p.on('pageerror', (e) => erros.push(e.message));
  let disparou = false;
  await p.route('**/server3n8n.dmove.com.br/**', (route) => { disparou = true; route.abort(); });
  await p.goto(URL, { waitUntil: 'networkidle' });
  await p.evaluate(() => document.querySelector('#contato').scrollIntoView({ block: 'center' }));
  await p.waitForTimeout(700);

  const etapa1 = await visiveis(p);
  JSON.stringify(etapa1) === JSON.stringify(['empresa', 'nome', 'telefone', 'email'])
    ? ok('celular: etapa 1 traz quem está falando', etapa1.join(', '))
    : fail('celular: etapa 1 divergente', etapa1.join(', '));

  // empresa+nome numa linha, telefone+email na seguinte
  const pares = await p.evaluate(() => {
    const c = [...document.querySelectorAll('#lead-form .campo')].filter((x) => x.offsetParent !== null);
    const linhas = {};
    c.forEach((x) => {
      const t = Math.round(x.getBoundingClientRect().top);
      (linhas[t] = linhas[t] || []).push(x.querySelector('input, select, textarea').name);
    });
    return Object.values(linhas);
  });
  JSON.stringify(pares) === JSON.stringify([['empresa'], ['nome'], ['telefone'], ['email']])
    ? ok('celular: etapa 1 com um campo por linha', pares.map((l) => l.join('+')).join(' / '))
    : fail('celular: etapa 1 fora de linha', JSON.stringify(pares));

  const alinhamento = await p.evaluate(() =>
    [...document.querySelectorAll('#lead-form .campo label')].map((l) => getComputedStyle(l).textAlign));
  alinhamento.every((a) => a === 'left')
    ? ok('celular: rótulos alinhados à esquerda')
    : fail('celular: rótulo centralizado', alinhamento.join(', '));

  const placeholders = await p.evaluate(() =>
    [...document.querySelectorAll('#lead-form .campo input')].filter((i) => i.offsetParent !== null).map((i) => {
      const ctx = document.createElement('canvas').getContext('2d');
      const cs = getComputedStyle(i);
      ctx.font = `${cs.fontSize} ${cs.fontFamily}`;
      const cabe = ctx.measureText(i.placeholder).width <= i.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
      return { n: i.name, cabe };
    }));
  placeholders.every((x) => x.cabe)
    ? ok('celular: nenhum placeholder cortado em meia largura')
    : fail('celular: placeholder cortado', placeholders.filter((x) => !x.cabe).map((x) => x.n).join(', '));

  const alturas = await p.evaluate(() => ({
    form: Math.round(document.querySelector('#lead-form').getBoundingClientRect().height),
    vh: window.innerHeight,
  }));
  alturas.form < alturas.vh * 0.62
    ? ok('celular: formulário cabe com folga na tela', `${alturas.form}px de ${alturas.vh}px`)
    : fail('celular: formulário ainda alto', `${alturas.form}px`);

  // Continuar com campos vazios não avança e explica o porquê
  await p.click('.formulario__avancar');
  await p.waitForTimeout(400);
  const bloqueou = await p.evaluate(() => ({
    etapa: document.querySelector('.formulario__passo b').textContent,
    erros: document.querySelectorAll('#lead-form .campo.tem-erro').length,
    msg: document.querySelector('.campo__erro')?.textContent || '',
  }));
  bloqueou.etapa === '1' && bloqueou.erros > 0
    ? ok('celular: "Continuar" barra a etapa incompleta', `${bloqueou.erros} campos marcados · "${bloqueou.msg}"`)
    : fail('celular: avançou com campos vazios', JSON.stringify(bloqueou));

  // erro ao sair do campo, e some ao corrigir
  await p.fill('#form-field-email', 'nao-e-email');
  await p.evaluate(() => document.querySelector('#form-field-email').blur());
  await p.waitForTimeout(250);
  const erroEmail = await p.evaluate(() => document.querySelector('#form-field-email').closest('.campo').querySelector('.campo__erro')?.textContent || '');
  erroEmail.includes('e-mail') ? ok('celular: valida ao sair do campo', `"${erroEmail}"`) : fail('celular: sem validação no blur', erroEmail);
  await p.fill('#form-field-email', 'contato@empresa.com.br');
  await p.waitForTimeout(250);
  const sumiu = await p.evaluate(() => !document.querySelector('#form-field-email').closest('.campo').querySelector('.campo__erro'));
  sumiu ? ok('celular: o aviso some ao corrigir') : fail('celular: aviso não sumiu');

  // preenche a etapa 1 e avança
  await p.fill('#form-field-empresa', 'Empresa Teste');
  await p.fill('#form-field-nome', 'Michel Teste');
  await p.fill('#form-field-telefone', '11987654321');
  await p.click('.formulario__avancar');
  await p.waitForTimeout(600);
  const etapa2 = await visiveis(p);
  JSON.stringify(etapa2) === JSON.stringify(['tipo_evento', 'data_evento', 'convidados', 'detalhes_adicionais'])
    ? ok('celular: etapa 2 com os campos do evento', etapa2.join(', '))
    : fail('celular: etapa 2 divergente', etapa2.join(', '));

  // a data tem que ser o Flatpickr pt-BR, nunca o seletor nativo do iOS
  const data = await p.evaluate(() => {
    const el = document.querySelector('#form-field-data_evento');
    el._flatpickr.setDate('22/10/2026', true);
    const v = el.value;
    el._flatpickr.close();
    return { tipo: el.type, nativo: !!document.querySelector('.flatpickr-mobile'), formato: el._flatpickr.config.dateFormat, valor: v };
  });
  data.tipo === 'text' && !data.nativo && data.formato === 'd/m/Y' && data.valor === '22/10/2026'
    ? ok('celular: data no padrão Dmove (dd/mm/aaaa, Flatpickr)', data.valor)
    : fail('celular: data fora do padrão', JSON.stringify(data));

  const fab = await p.evaluate(() => getComputedStyle(document.querySelector('.wa-fab')).opacity);
  fab === '0' ? ok('celular: WhatsApp sai da frente do botão de enviar') : fail('celular: WhatsApp cobre o CTA', fab);

  // etapa 2 mantém data+convidados no par (campos curtos)
  const linhas2 = await p.evaluate(() => {
    const c = [...document.querySelectorAll('#lead-form .campo')].filter((x) => x.offsetParent !== null);
    const l = {};
    c.forEach((x) => {
      const t = Math.round(x.getBoundingClientRect().top);
      (l[t] = l[t] || []).push(x.querySelector('input, select, textarea').name);
    });
    return Object.values(l);
  });
  JSON.stringify(linhas2) === JSON.stringify([['tipo_evento'], ['data_evento', 'convidados'], ['detalhes_adicionais']])
    ? ok('celular: etapa 2 mantém data+convidados no par', linhas2.map((l) => l.join('+')).join(' / '))
    : fail('celular: etapa 2 mudou de layout', JSON.stringify(linhas2));

  const botoes = await p.evaluate(() => ({
    voltar: !document.querySelector('.formulario__voltar').hidden,
    avancar: !document.querySelector('.formulario__avancar').hidden,
    enviar: !document.querySelector('.form-submit').hidden,
    passo: document.querySelector('.formulario__passo b').textContent,
  }));
  botoes.voltar && !botoes.avancar && botoes.enviar && botoes.passo === '2'
    ? ok('celular: etapa 2 mostra Voltar + Enviar')
    : fail('celular: botões errados na etapa 2', JSON.stringify(botoes));

  // volta e confere que nada se perdeu
  await p.click('.formulario__voltar');
  await p.waitForTimeout(500);
  const mantido = await p.evaluate(() => ({
    empresa: document.querySelector('#form-field-empresa').value,
    telefone: document.querySelector('#form-field-telefone').value,
  }));
  mantido.empresa === 'Empresa Teste' && mantido.telefone === '(11) 98765-4321'
    ? ok('celular: "Voltar" preserva o que já foi digitado', `${mantido.empresa} · ${mantido.telefone}`)
    : fail('celular: perdeu dados ao voltar', JSON.stringify(mantido));

  // na etapa 2 incompleta, o envio é barrado pelo motor padrão
  await p.click('.formulario__avancar');
  await p.waitForTimeout(500);
  await p.click('.form-submit');
  await p.waitForTimeout(700);
  !disparou ? ok('celular: envio incompleto não dispara lead') : fail('celular: disparou lead incompleto');

  // —— envio completo: o payload tem que sair igual ao de antes das etapas ——
  let payload = null;
  await p.unroute('**/server3n8n.dmove.com.br/**');
  await p.route('**/server3n8n.dmove.com.br/**', (route) => {
    try { payload = JSON.parse(route.request().postData() || '{}'); } catch {}
    route.abort();   // nunca chega no n8n: nada de lead de teste
  });
  await p.selectOption('#form-field-tipo_evento', { index: 1 });
  await p.fill('#form-field-convidados', '120');
  await p.fill('#form-field-detalhes_adicionais', 'Confraternização de fim de ano');
  await p.click('.form-submit');
  await p.waitForTimeout(1200);

  const esperado = ['Empresa', 'Nome', 'WhatsApp', 'E-mail', 'Tipo de evento', 'Data do evento', 'Convidados', 'Mensagem'];
  const faltando = payload ? esperado.filter((k) => !(k in payload)) : esperado;
  payload && !faltando.length
    ? ok('celular: envio completo monta o payload canônico', esperado.map((k) => `${k}=${payload[k]}`).join(' · ').slice(0, 150))
    : fail('celular: payload incompleto', faltando.join(', ') || 'nenhuma requisição');
  payload?.Fonte?.includes('Landing page/eventos-corporativos')
    ? ok('celular: Fonte preservada', payload.Fonte.split('?')[0])
    : fail('celular: Fonte errada', String(payload?.Fonte));

  erros.length ? fail('celular: erros de JS', erros.join(' | ')) : ok('celular: sem erro de JS');
  await p.close();
}

// ———————————————————— desktop ————————————————————
{
  const p = await b.newPage({ viewport: { width: 1440, height: 900 } });
  await p.goto(URL, { waitUntil: 'networkidle' });
  await p.evaluate(() => document.querySelector('#contato').scrollIntoView({ block: 'center' }));
  await p.waitForTimeout(600);
  const todos = await visiveis(p);
  const ui = await p.evaluate(() => ({
    classe: document.querySelector('#lead-form').classList.contains('formulario--etapas'),
    passo: getComputedStyle(document.querySelector('.formulario__passo')).display,
    avancar: getComputedStyle(document.querySelector('.formulario__avancar')).display,
    etapaDisplay: getComputedStyle(document.querySelector('.form-etapa')).display,
  }));
  todos.length === 8
    ? ok('desktop: os 8 campos continuam visíveis de uma vez', todos.join(', '))
    : fail('desktop: campos escondidos', todos.join(', '));
  !ui.classe && ui.passo === 'none' && ui.avancar === 'none' && ui.etapaDisplay === 'contents'
    ? ok('desktop: sem etapas, sem botões extras')
    : fail('desktop: interface de etapas vazou', JSON.stringify(ui));
  await p.close();
}

// ———————————————————— tracking e destino do lead ————————————————————
{
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  await p.goto(URL, { waitUntil: 'domcontentloaded' });
  const t = await p.evaluate(() => {
    const doc = document.documentElement.outerHTML;
    const head = doc.slice(0, doc.indexOf('</head>'));
    const script = [...document.querySelectorAll('head script')].find((s) => s.textContent.includes('gtm.start'));
    const ns = document.querySelector('noscript');
    return {
      id: (doc.match(/GTM-[A-Z0-9]+/g) || [])[0] || '',
      ids: [...new Set(doc.match(/GTM-[A-Z0-9]+/g) || [])],
      scriptNoHead: !!script,
      altoNoHead: script ? head.indexOf('gtm.start') < head.indexOf('<style') : false,
      noscriptPrimeiro: !!ns && ns.innerHTML.includes('ns.html'),
      posNoscript: doc.indexOf('ns.html') - doc.indexOf('<body'),
      webhooks: [...new Set((doc.match(/server3n8n\.dmove\.com\.br\/webhook\/[a-z-]+/g) || []))],
      formWebhook: document.querySelector('#lead-form')?.dataset.submitUrl || '',
      carregou: !!document.querySelector('script[src*="googletagmanager.com/gtm.js"]'),
    };
  });
  await p.waitForTimeout(2500);
  const rodando = await p.evaluate(() => ({ dataLayer: Array.isArray(window.dataLayer), eventos: (window.dataLayer || []).map((e) => e && e.event).filter(Boolean) }));

  t.ids.length === 1 && t.id.length > 7
    ? ok('GTM: um único container na página', t.id)
    : fail('GTM: container ausente ou duplicado', t.ids.join(', ') || 'nenhum');
  t.scriptNoHead && t.altoNoHead
    ? ok('GTM: script no topo do <head>, antes do CSS')
    : fail('GTM: script fora do topo do head');
  t.noscriptPrimeiro && t.posNoscript < 300
    ? ok('GTM: noscript logo após a abertura do <body>', `${t.posNoscript} bytes`)
    : fail('GTM: noscript fora de posição', String(t.posNoscript));
  rodando.dataLayer ? ok('GTM: dataLayer inicializado', rodando.eventos.slice(0, 4).join(', ')) : fail('GTM: sem dataLayer');
  t.webhooks.length === 1 && t.webhooks[0].endsWith('/fazenda-das-pedras')
    ? ok('Webhook único no formulário e no WhatsApp', t.webhooks[0])
    : fail('Webhooks divergentes', t.webhooks.join(' | '));
  await p.close();
}

await b.close();
console.log(`\nQA DO FORMULÁRIO — ${URL}\n${'='.repeat(78)}`);
for (const [s, t, d] of r) console.log(`${s} ${t}${d ? `\n     ${d}` : ''}`);
const f = r.filter((x) => x[0] === '❌').length;
console.log('='.repeat(78));
console.log(f ? `${f} FALHA(S)` : 'TUDO VERDE');
process.exit(f ? 1 : 0);
