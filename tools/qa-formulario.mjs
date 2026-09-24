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
  JSON.stringify(etapa1) === JSON.stringify(['empresa', 'nome', 'telefone', 'email', 'tipo_evento'])
    ? ok('celular: etapa 1 com os 5 primeiros campos', etapa1.join(', '))
    : fail('celular: etapa 1 divergente', etapa1.join(', '));

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
  await p.selectOption('#form-field-tipo_evento', { index: 1 });
  await p.click('.formulario__avancar');
  await p.waitForTimeout(600);
  const etapa2 = await visiveis(p);
  JSON.stringify(etapa2) === JSON.stringify(['data_evento', 'convidados', 'detalhes_adicionais'])
    ? ok('celular: etapa 2 com os campos do evento', etapa2.join(', '))
    : fail('celular: etapa 2 divergente', etapa2.join(', '));

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
  await p.fill('#form-field-data_evento', '20/12/2026');
  await p.evaluate(() => document.querySelector('#form-field-data_evento')?._flatpickr?.close());
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

await b.close();
console.log(`\nQA DO FORMULÁRIO — ${URL}\n${'='.repeat(78)}`);
for (const [s, t, d] of r) console.log(`${s} ${t}${d ? `\n     ${d}` : ''}`);
const f = r.filter((x) => x[0] === '❌').length;
console.log('='.repeat(78));
console.log(f ? `${f} FALHA(S)` : 'TUDO VERDE');
process.exit(f ? 1 : 0);
