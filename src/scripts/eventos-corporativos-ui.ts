// ============================================================
// Interações da /eventos-corporativos
// ------------------------------------------------------------
// Dois componentes, ambos por melhoria progressiva: sem JS a página
// continua legível (carrossel vira faixa rolável, palco vira lista).
// Nenhum listener de scroll: tudo em IntersectionObserver e rolagem nativa,
// para não disputar a thread principal.
// ============================================================

const menosMovimento = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// ------------------------------------------------------------
// Carrossel: rolagem nativa com scroll-snap + setas que rolam o trilho
// (e não navegam por hash, que era o que puxava a página na vertical).
// ------------------------------------------------------------
export function initCarrosseis() {
  document.querySelectorAll<HTMLElement>('[data-carrossel]').forEach((raiz) => {
    const trilho = raiz.querySelector<HTMLElement>('.carrossel__trilho');
    const itens = [...raiz.querySelectorAll<HTMLElement>('.carrossel__item')];
    if (!trilho || itens.length < 2) return;

    const prev = raiz.querySelector<HTMLButtonElement>('.carrossel__seta--prev');
    const next = raiz.querySelector<HTMLButtonElement>('.carrossel__seta--next');
    const pontos = raiz.querySelector<HTMLElement>('.carrossel__pontos');
    const intervalo = Number(raiz.dataset.autoplay || 0);

    raiz.classList.add('carrossel--pronto');

    // —— indicadores ——
    // Até 6 fotos, bolinhas (alvo de 40px cada). Acima disso vira contador +
    // barra: nove bolinhas numa tela de 360px ficariam pequenas demais.
    const comBolinhas = itens.length <= 6;
    let botoesPonto: HTMLButtonElement[] = [];
    let contagem: HTMLElement | null = null;
    let barra: HTMLElement | null = null;

    if (comBolinhas) {
      botoesPonto = itens.map((_, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'carrossel__ponto';
        b.setAttribute('aria-label', `Ir para a foto ${i + 1} de ${itens.length}`);
        b.addEventListener('click', () => irPara(i, true));
        pontos?.appendChild(b);
        return b;
      });
    } else if (pontos) {
      const medidor = document.createElement('div');
      medidor.className = 'carrossel__medidor';
      contagem = document.createElement('span');
      contagem.className = 'carrossel__contagem';
      const trilhoBarra = document.createElement('span');
      trilhoBarra.className = 'carrossel__barra';
      barra = document.createElement('span');
      trilhoBarra.appendChild(barra);
      medidor.append(contagem, trilhoBarra);
      pontos.replaceWith(medidor);
    }

    let atual = 0;
    const doisDigitos = (n: number) => String(n).padStart(2, '0');
    const marcar = (i: number) => {
      atual = i;
      botoesPonto.forEach((b, n) => {
        b.classList.toggle('is-ativo', n === i);
        b.setAttribute('aria-current', n === i ? 'true' : 'false');
      });
      if (contagem) contagem.textContent = `${doisDigitos(i + 1)} / ${doisDigitos(itens.length)}`;
      if (barra) barra.style.transform = `scaleX(${(i + 1) / itens.length})`;
      itens.forEach((el, n) => el.classList.toggle('is-ativo', n === i));
    };

    // Alinha pelo INÍCIO, não pelo centro: quando cabem vários itens na tela
    // (desktop), a posição central do segundo item é negativa e o trilho
    // simplesmente não saía do lugar.
    const irPara = (i: number, manual: boolean) => {
      const alvo = itens[(i + itens.length) % itens.length];
      // scrollLeft direto: scrollIntoView mexeria também na rolagem vertical da página
      const esquerda = alvo.offsetLeft - itens[0].offsetLeft;
      trilho.scrollTo({ left: Math.max(0, esquerda), behavior: menosMovimento() ? 'auto' : 'smooth' });
      if (manual) pausar();
    };

    prev?.addEventListener('click', () => irPara(atual - 1, true));
    next?.addEventListener('click', () => irPara(atual + 1, true));

    // —— item visível: quem ocupa o centro do trilho ——
    const observer = new IntersectionObserver(
      (entradas) => {
        const visivel = entradas.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visivel) marcar(itens.indexOf(visivel.target as HTMLElement));
      },
      { root: trilho, threshold: [0.5, 0.75, 1] }
    );
    itens.forEach((el) => observer.observe(el));
    marcar(0);

    // —— teclado ——
    trilho.setAttribute('tabindex', '0');
    trilho.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowRight') { e.preventDefault(); irPara(atual + 1, true); }
      if (e.key === 'ArrowLeft')  { e.preventDefault(); irPara(atual - 1, true); }
    });

    // —— avanço automático: só enquanto visível, e morre ao primeiro toque ——
    let timer: number | undefined;
    let pausado = false;
    const pausar = () => { pausado = true; if (timer) { clearInterval(timer); timer = undefined; } };

    if (intervalo > 0 && !menosMovimento()) {
      const noAr = new IntersectionObserver((e) => {
        if (pausado) return;
        if (e[0].isIntersecting && !timer) timer = window.setInterval(() => irPara(atual + 1, false), intervalo);
        else if (!e[0].isIntersecting && timer) { clearInterval(timer); timer = undefined; }
      }, { threshold: 0.35 });
      noAr.observe(raiz);

      ['pointerdown', 'wheel', 'touchstart', 'focusin'].forEach((ev) =>
        raiz.addEventListener(ev, pausar, { once: true, passive: true })
      );
      raiz.addEventListener('pointerenter', () => { if (timer) { clearInterval(timer); timer = undefined; } });
      raiz.addEventListener('pointerleave', () => {
        if (!pausado && !timer) timer = window.setInterval(() => irPara(atual + 1, false), intervalo);
      });
    }

    // —— arrastar com o mouse (no toque a rolagem nativa já resolve) ——
    let arrastando = false, xInicial = 0, scrollInicial = 0, moveu = 0;
    trilho.addEventListener('pointerdown', (e) => {
      if (e.pointerType !== 'mouse') return;
      arrastando = true; moveu = 0;
      xInicial = e.clientX; scrollInicial = trilho.scrollLeft;
      trilho.classList.add('esta-arrastando');
    });
    trilho.addEventListener('pointermove', (e) => {
      if (!arrastando) return;
      const d = e.clientX - xInicial;
      moveu = Math.abs(d);
      trilho.scrollLeft = scrollInicial - d;
    });
    const soltar = (e: PointerEvent) => {
      if (!arrastando) return;
      arrastando = false;
      trilho.classList.remove('esta-arrastando');
      // arrastou de verdade? então não é clique (não abre o lightbox)
      if (moveu > 8) { e.preventDefault(); const bloqueia = (ev: Event) => ev.preventDefault(); trilho.addEventListener('click', bloqueia, { capture: true, once: true }); }
    };
    trilho.addEventListener('pointerup', soltar);
    trilho.addEventListener('pointercancel', soltar);
    trilho.addEventListener('pointerleave', soltar);
  });
}

// ------------------------------------------------------------
// Palco de ambientes: cada ambiente ocupa a tela inteira e troca conforme
// a rolagem avança. Marcos invisíveis dão o compasso; as cenas só trocam
// de opacidade/escala, então a animação roda no compositor.
// ------------------------------------------------------------
export function initAmbientes() {
  const palco = document.querySelector<HTMLElement>('[data-ambientes]');
  if (!palco) return;

  // O palco é do celular. No desktop vale a grade de 4 colunas do design; se a
  // janela encolher para a faixa do celular, monta na hora.
  const celular = window.matchMedia('(max-width: 899px)');
  if (!celular.matches) {
    celular.addEventListener('change', () => initAmbientes(), { once: true });
    return;
  }
  if (palco.dataset.montado) return;
  palco.dataset.montado = 'sim';

  const cenas = [...palco.querySelectorAll<HTMLElement>('.palco__cena')];
  const marcos = [...palco.querySelectorAll<HTMLElement>('.palco__marco')];
  const atalhos = [...palco.querySelectorAll<HTMLButtonElement>('.palco__atalho')];
  const barra = palco.querySelector<HTMLElement>('.palco__barra span');
  if (cenas.length < 2 || marcos.length !== cenas.length) return;

  // As cenas 2..4 vêm com data-src para não baixarem junto com a página.
  const acordarCena = (i: number) => {
    const img = cenas[i]?.querySelector<HTMLImageElement>('img[data-src]');
    if (!img) return;
    if (img.dataset.srcset) img.srcset = img.dataset.srcset;
    if (img.dataset.sizes) img.sizes = img.dataset.sizes;
    img.src = img.dataset.src!;
    delete img.dataset.src;
  };

  if (menosMovimento()) {
    palco.classList.add('palco--simples');
    cenas.forEach((_, i) => acordarCena(i));
    return;
  }
  palco.classList.add('palco--pronto');

  // Adiantar a próxima cena é bom quando o visitante já está no palco, mas
  // no carregamento da página isso baixaria uma foto que está telas abaixo.
  let perto = false;
  new IntersectionObserver((e) => { if (e[0].isIntersecting) { perto = true; acordarCena(atual + 1); } },
    { rootMargin: '300px 0px' }).observe(palco);

  let atual = -1;
  const ativar = (i: number) => {
    if (i === atual) return;
    atual = i;
    acordarCena(i);
    if (perto) acordarCena(i + 1);   // adianta a próxima, para a troca não esperar download
    cenas.forEach((c, n) => {
      c.classList.toggle('is-ativa', n === i);
      c.classList.toggle('is-passada', n < i);
      c.setAttribute('aria-hidden', n === i ? 'false' : 'true');
    });
    atalhos.forEach((a, n) => {
      a.classList.toggle('is-ativo', n === i);
      a.setAttribute('aria-current', n === i ? 'true' : 'false');
    });
    if (barra) barra.style.transform = `scaleX(${(i + 1) / cenas.length})`;
    palco.classList.toggle('palco--iniciado', i > 0);
  };

  // o marco que cruza a metade da tela manda na cena
  const obs = new IntersectionObserver(
    (entradas) => entradas.forEach((e) => { if (e.isIntersecting) ativar(marcos.indexOf(e.target as HTMLElement)); }),
    { rootMargin: '-50% 0px -50% 0px', threshold: 0 }
  );
  marcos.forEach((m) => obs.observe(m));
  ativar(0);

  atalhos.forEach((a, i) => a.addEventListener('click', () => {
    marcos[i].scrollIntoView({ block: 'center', behavior: 'smooth' });
  }));

  // arrastar na horizontal também troca de ambiente
  let x0 = 0, y0 = 0, seguindo = false;
  const quadro = palco.querySelector<HTMLElement>('.palco__quadro');
  quadro?.addEventListener('pointerdown', (e) => { seguindo = true; x0 = e.clientX; y0 = e.clientY; }, { passive: true });
  quadro?.addEventListener('pointerup', (e) => {
    if (!seguindo) return;
    seguindo = false;
    const dx = e.clientX - x0, dy = e.clientY - y0;
    if (Math.abs(dx) < 45 || Math.abs(dx) < Math.abs(dy)) return;
    const destino = Math.min(cenas.length - 1, Math.max(0, atual + (dx < 0 ? 1 : -1)));
    marcos[destino].scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, { passive: true });
}
