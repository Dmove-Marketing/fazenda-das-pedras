// Testa as interações reconstruídas: carrosséis e palco de ambientes.
//   node tools/qa-interacoes.mjs [baseUrl]
import { chromium } from 'playwright';
const BASE = process.argv[2] || 'http://localhost:4331';
const URL = `${BASE}/eventos-corporativos`;
const r = [];
const ok = (t, d = '') => r.push(['✅', t, d]);
const fail = (t, d = '') => r.push(['❌', t, d]);

// O design usa `html { scroll-behavior: smooth }`: qualquer scrollIntoView fica
// animando por um tempo. Sem esperar assentar, mede-se a animação, não o efeito.
const assentar = (pg) => pg.evaluate(() => new Promise((resolve) => {
  let ultimo = -1, iguais = 0;
  const tick = () => {
    if (window.scrollY === ultimo) { if (++iguais >= 3) return resolve(window.scrollY); }
    else { iguais = 0; ultimo = window.scrollY; }
    requestAnimationFrame(tick);
  };
  tick();
}));

const b = await chromium.launch();

for (const [rotulo, vw, vh] of [['mobile', 390, 844], ['desktop', 1440, 900]]) {
  const p = await b.newPage({ viewport: { width: vw, height: vh } });
  const erros = [];
  p.on('pageerror', (e) => erros.push(e.message));
  await p.goto(URL, { waitUntil: 'networkidle' });
  await p.evaluate(async () => {
    for (let y = 0; y < document.body.scrollHeight; y += 500) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 50)); }
    window.scrollTo(0, 0);
  });
  await p.waitForFunction(() => [...document.images].filter((i) => i.offsetParent !== null).every((i) => i.complete), null, { timeout: 40000 }).catch(() => {});
  await assentar(p);
  await p.waitForTimeout(400);

  for (const id of ['infra', 'hospedagem', 'galeria']) {
    const sel = `[data-carrossel="${id}"]`;
    const existe = await p.$(sel);
    if (!existe) { fail(`${rotulo}: carrossel ${id} ausente`); continue; }
    const visivel = await p.evaluate((s) => {
      const el = document.querySelector(s);
      return el.getBoundingClientRect().width > 0 && getComputedStyle(el).display !== 'none';
    }, sel);
    if (!visivel) { ok(`${rotulo}: carrossel ${id} oculto neste viewport (esperado)`); continue; }

    await p.evaluate((s) => document.querySelector(s).scrollIntoView({ block: 'center' }), sel);
    await assentar(p);

    const pronto = await p.evaluate((s) => document.querySelector(s).classList.contains('carrossel--pronto'), sel);
    pronto ? ok(`${rotulo}/${id}: carrossel inicializado`) : fail(`${rotulo}/${id}: não inicializou`);

    // a seta move o trilho na horizontal e NÃO mexe na rolagem vertical
    const antes = await p.evaluate((s) => ({ y: window.scrollY, x: document.querySelector(s + ' .carrossel__trilho').scrollLeft }), sel);
    // click() do Playwright rola o elemento até a vista antes de clicar, o que
    // falsearia a medição de "a página pulou?". Dispara o clique direto no DOM.
    await p.evaluate((s) => document.querySelector(s + ' .carrossel__seta--next').click(), sel);
    await p.waitForTimeout(900);
    const depois = await p.evaluate((s) => ({ y: window.scrollY, x: document.querySelector(s + ' .carrossel__trilho').scrollLeft }), sel);

    depois.x > antes.x ? ok(`${rotulo}/${id}: seta avança as fotos`, `scrollLeft ${Math.round(antes.x)} → ${Math.round(depois.x)}`)
                       : fail(`${rotulo}/${id}: seta não moveu o trilho`, `scrollLeft ${antes.x} → ${depois.x}`);
    Math.abs(depois.y - antes.y) < 3 ? ok(`${rotulo}/${id}: a página NÃO pula na vertical`)
                                     : fail(`${rotulo}/${id}: a página rolou na vertical`, `scrollY ${Math.round(antes.y)} → ${Math.round(depois.y)}`);

    // arrastar o trilho (rolagem nativa) muda o item ativo
    const antesAtivo = await p.evaluate((s) => [...document.querySelectorAll(s + ' .carrossel__item')].findIndex((e) => e.classList.contains('is-ativo')), sel);
    await p.evaluate((s) => { const t = document.querySelector(s + ' .carrossel__trilho'); t.scrollLeft = t.scrollWidth; }, sel);
    await p.waitForTimeout(900);
    const ultimoAtivo = await p.evaluate((s) => [...document.querySelectorAll(s + ' .carrossel__item')].findIndex((e) => e.classList.contains('is-ativo')), sel);
    ultimoAtivo > antesAtivo ? ok(`${rotulo}/${id}: rolagem nativa acompanha o item ativo`, `${antesAtivo} → ${ultimoAtivo}`)
                             : fail(`${rotulo}/${id}: item ativo não acompanhou a rolagem`, `${antesAtivo} → ${ultimoAtivo}`);

    // o trilho é de fato rolável com o dedo
    const rolavel = await p.evaluate((s) => {
      const t = document.querySelector(s + ' .carrossel__trilho');
      const cs = getComputedStyle(t);
      return { overflow: cs.overflowX, snap: cs.scrollSnapType, largura: t.scrollWidth > t.clientWidth };
    }, sel);
    rolavel.overflow === 'auto' && rolavel.largura
      ? ok(`${rotulo}/${id}: trilho arrastável`, `overflow-x ${rolavel.overflow} · snap ${rolavel.snap}`)
      : fail(`${rotulo}/${id}: trilho não é arrastável`, JSON.stringify(rolavel));

    // nenhuma seta navega por hash (era a causa do pulo)
    const comHash = await p.evaluate((s) => document.querySelectorAll(s + ' a[href^="#infra-"], ' + s + ' a[href^="#hosp-"], ' + s + ' a[href^="#gal-"]').length, sel);
    comHash === 0 ? ok(`${rotulo}/${id}: sem navegação por hash`) : fail(`${rotulo}/${id}: ainda há ${comHash} link de hash`);
  }

  // —— ambientes: grade no desktop, palco no celular ——
  const ambientes = await p.evaluate(() => ({
    grade: getComputedStyle(document.querySelector('.ambientes__grade')).display,
    palco: getComputedStyle(document.querySelector('.palco')).display,
    pronto: document.querySelector('[data-ambientes]').classList.contains('palco--pronto'),
    cards: document.querySelectorAll('.ambiente-card').length,
    cenasBaixadas: [...document.querySelectorAll('.palco__cena img')].filter((i) => i.naturalWidth > 0).length,
  }));

  if (rotulo === 'desktop') {
    ambientes.grade !== 'none' && ambientes.palco === 'none'
      ? ok('desktop: ambientes na grade original do design', `${ambientes.cards} cards`)
      : fail('desktop: ambientes fora da grade', JSON.stringify(ambientes));
    !ambientes.pronto ? ok('desktop: palco não é montado') : fail('desktop: palco montado onde não devia');
    ambientes.cenasBaixadas === 0 ? ok('desktop: fotos do palco não são baixadas') : fail(`desktop: ${ambientes.cenasBaixadas} foto(s) do palco baixadas à toa`);
    erros.length ? fail(`${rotulo}: erros de JS`, erros.join(' | ')) : ok(`${rotulo}: sem erro de JS`);
    await p.close();
    continue;
  }

  ambientes.palco !== 'none' && ambientes.grade === 'none'
    ? ok('mobile: ambientes no palco (grade oculta)')
    : fail('mobile: ambientes fora do palco', JSON.stringify(ambientes));
  ambientes.pronto ? ok(`${rotulo}: palco de ambientes inicializado`) : fail(`${rotulo}: palco não inicializou`);

  // a foto precisa estar CENTRADA na tela quando a troca acontece
  const centragem = await p.evaluate(() => {
    const palco = document.querySelector('[data-ambientes]');
    const quadro = palco.querySelector('.palco__quadro');
    const P = palco.getBoundingClientRect().top + window.scrollY;
    document.documentElement.style.scrollBehavior = 'auto';
    window.scrollTo(0, P + 300);
    const r = quadro.getBoundingClientRect();
    return { centroQuadro: Math.round(r.top + r.height / 2), centroTela: Math.round(window.innerHeight / 2) };
  });
  Math.abs(centragem.centroQuadro - centragem.centroTela) <= 24
    ? ok('mobile: foto centralizada na tela durante a troca', `quadro ${centragem.centroQuadro} · tela ${centragem.centroTela}`)
    : fail('mobile: foto fora do centro', JSON.stringify(centragem));

  // e a tela fixa precisa engatar ANTES do topo da seção chegar ao topo
  const engate = await p.evaluate(() => {
    const palco = document.querySelector('[data-ambientes]');
    const fixo = palco.querySelector('.palco__fixo');
    const P = palco.getBoundingClientRect().top + window.scrollY;
    const alvo = Math.round(window.innerHeight * 0.14);
    for (let rel = -300; rel <= 0; rel += 5) {
      window.scrollTo(0, P + rel);
      if (Math.abs(fixo.getBoundingClientRect().top - alvo) < 3) return rel;
    }
    return 0;
  });
  engate < -40
    ? ok('mobile: a tela fixa engata antes do topo da seção', `${Math.abs(engate)}px antes`)
    : fail('mobile: engate tarde demais', `${engate}px`);

  // Rola o palco de ponta a ponta e registra a cena ativa a cada passo:
  // é assim que o visitante percorre, e não pulando de marco em marco.
  // assenta no topo do palco antes de começar a percorrer
  await p.evaluate(() => {
    const palco = document.querySelector('[data-ambientes]');
    window.scrollTo({ top: palco.getBoundingClientRect().top + window.scrollY, behavior: 'auto' });
  });
  await assentar(p);
  await p.waitForTimeout(400);

  const passos = await p.evaluate(async () => {
    const palco = document.querySelector('[data-ambientes]');
    const topo = palco.getBoundingClientRect().top + window.scrollY;
    const fim = topo + palco.offsetHeight - window.innerHeight;
    const vistos = [];
    for (let y = topo; y <= fim; y += (fim - topo) / 22) {
      window.scrollTo({ top: y, behavior: 'auto' });
      await new Promise((r) => setTimeout(r, 260));
      const i = [...palco.querySelectorAll('.palco__cena')].findIndex((c) => c.classList.contains('is-ativa'));
      if (vistos[vistos.length - 1] !== i) vistos.push(i);
    }
    return vistos;
  });
  const cobreTodas = [0, 1, 2, 3].every((n) => passos.includes(n));
  const semVolta = passos.every((v, i) => i === 0 || v >= passos[i - 1]);
  cobreTodas && semVolta
    ? ok(`${rotulo}: palco percorre os 4 ambientes na ordem`, passos.join(' → '))
    : fail(`${rotulo}: sequência do palco errada`, passos.join(' → '));

  const umPorVez = await p.evaluate(() => document.querySelectorAll('.palco__cena.is-ativa').length);
  umPorVez === 1 ? ok(`${rotulo}: uma cena ativa por vez`) : fail(`${rotulo}: ${umPorVez} cenas ativas`);

  erros.length ? fail(`${rotulo}: erros de JS`, erros.join(' | ')) : ok(`${rotulo}: sem erro de JS`);
  await p.close();
}

// —— hero no celular: foto inteira ——
{
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  await p.goto(URL, { waitUntil: 'networkidle' });
  await p.waitForTimeout(400);
  const hero = await p.evaluate(() => {
    const img = document.querySelector('.hero__foto');
    const sec = document.querySelector('.hero');
    const cs = getComputedStyle(sec);
    const b = img?.getBoundingClientRect();
    return {
      imgVisivel: !!b && b.width > 0,
      proporcaoOk: img ? Math.abs(b.width / b.height - img.naturalWidth / img.naturalHeight) < 0.02 : false,
      fundoCss: cs.backgroundImage,
      larguraCheia: b ? Math.round(b.width) : 0,
    };
  });
  hero.imgVisivel && hero.larguraCheia === 390 ? ok('hero mobile: foto ocupa a largura toda', `${hero.larguraCheia}px`) : fail('hero mobile: foto ausente', JSON.stringify(hero));
  hero.proporcaoOk ? ok('hero mobile: foto inteira, sem corte') : fail('hero mobile: proporção alterada');
  hero.fundoCss === 'none' ? ok('hero mobile: zoom de 420% removido') : fail('hero mobile: fundo em CSS ainda ativo', hero.fundoCss.slice(0, 60));
  await p.close();
}

// —— depoimento ——
{
  const p = await b.newPage({ viewport: { width: 390, height: 844 } });
  await p.goto(URL, { waitUntil: 'networkidle' });
  const dep = await p.evaluate(() => {
    const el = document.querySelector('.depoimento__texto');
    const cs = getComputedStyle(el);
    return { peso: cs.fontWeight, sombra: cs.textShadow !== 'none' };
  });
  dep.peso === '400' ? ok('depoimento: peso 400 (era 300)') : fail('depoimento: peso', dep.peso);
  await p.close();
}

await b.close();
console.log(`\nQA DE INTERAÇÕES — ${URL}\n${'='.repeat(80)}`);
for (const [s, t, d] of r) console.log(`${s} ${t}${d ? `\n     ${d}` : ''}`);
const f = r.filter((x) => x[0] === '❌').length;
console.log('='.repeat(80));
console.log(f ? `${f} FALHA(S)` : 'TUDO VERDE');
process.exit(f ? 1 : 0);
