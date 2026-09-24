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

// ------------------------------------------------------------
// Formulário em duas etapas — só no celular
// ------------------------------------------------------------
// Os 8 campos do padrão Dmove empilhados davam 690px numa tela de 844.
// Aqui viram duas etapas, com validação ao sair de cada campo em vez de só no
// envio. Nada muda no contrato: mesmos campos, mesmos `name`, mesmo motor de
// envio (forms.ts) e o mesmo disparo único de `form_submit` no fim.
// ------------------------------------------------------------
export function initFormularioEtapas() {
  const form = document.querySelector<HTMLFormElement>('#lead-form');
  if (!form) return;
  if (!window.matchMedia('(max-width: 899px)').matches) return;

  const etapas = [...form.querySelectorAll<HTMLElement>('.form-etapa')];
  const passo = form.querySelector<HTMLElement>('.formulario__passo');
  const passoNum = form.querySelector<HTMLElement>('.formulario__passo b');
  const barra = form.querySelector<HTMLElement>('.formulario__passo-barra span');
  const voltar = form.querySelector<HTMLButtonElement>('.formulario__voltar');
  const avancar = form.querySelector<HTMLButtonElement>('.formulario__avancar');
  const enviar = form.querySelector<HTMLButtonElement>('.form-submit');
  if (etapas.length !== 2 || !avancar || !voltar || !enviar) return;

  form.classList.add('formulario--etapas');
  if (passo) passo.hidden = false;

  // —— validação de um campo, espelhando as regras do forms.ts ——
  const controle = (campo: HTMLElement) =>
    campo.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>('input, select, textarea');

  const erroDe = (el: HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement): string | null => {
    const v = el.value.trim();
    if ((el as HTMLInputElement).required && !v) return 'Preencha este campo para continuar.';
    if (!v) return null;
    if (el.getAttribute('type') === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v))
      return 'Confira o e-mail: parece faltar algo.';
    if (el.name === 'telefone') {
      const digitos = v.replace(/\D/g, '');
      if (digitos.startsWith('55')) return 'Não inclua o DDI 55 — só DDD e número.';
      if (digitos.length < 10) return 'Informe o DDD e o número completo.';
    }
    if (el.name === 'convidados' && Number(v) < 1) return 'Informe quantas pessoas são esperadas.';
    return null;
  };

  const mostrarErro = (campo: HTMLElement, msg: string | null) => {
    let aviso = campo.querySelector<HTMLElement>('.campo__erro');
    campo.classList.toggle('tem-erro', !!msg);
    campo.classList.toggle('esta-ok', !msg && !!controle(campo)?.value.trim());
    const el = controle(campo);
    if (el) el.setAttribute('aria-invalid', msg ? 'true' : 'false');
    if (!msg) { aviso?.remove(); return; }
    if (!aviso) {
      aviso = document.createElement('span');
      aviso.className = 'campo__erro';
      campo.appendChild(aviso);
    }
    aviso.textContent = msg;
  };

  const campos = [...form.querySelectorAll<HTMLElement>('.campo')];
  campos.forEach((campo) => {
    const el = controle(campo);
    if (!el || el.classList.contains('honeypot')) return;
    // valida ao sair do campo; ao corrigir, o aviso some na hora
    el.addEventListener('blur', () => mostrarErro(campo, erroDe(el)));
    el.addEventListener('input', () => { if (campo.classList.contains('tem-erro')) mostrarErro(campo, erroDe(el)); });
    el.addEventListener('change', () => { if (campo.classList.contains('tem-erro')) mostrarErro(campo, erroDe(el)); });
    // teclado do celular avança em vez de mandar
    if (el.tagName !== 'TEXTAREA') el.setAttribute('enterkeyhint', 'next');
  });

  const camposDa = (i: number) => campos.filter((c) => etapas[i].contains(c));

  const validarEtapa = (i: number) => {
    let primeiroErro: HTMLElement | null = null;
    camposDa(i).forEach((campo) => {
      const el = controle(campo);
      if (!el) return;
      const msg = erroDe(el);
      mostrarErro(campo, msg);
      if (msg && !primeiroErro) primeiroErro = campo;
    });
    if (primeiroErro) {
      (primeiroErro as HTMLElement).scrollIntoView({ block: 'center', behavior: 'smooth' });
      controle(primeiroErro as HTMLElement)?.focus({ preventScroll: true });
      return false;
    }
    return true;
  };

  let atual = 0;
  const irParaEtapa = (i: number, focar = false) => {
    atual = i;
    etapas.forEach((e, n) => e.classList.toggle('is-ativa', n === i));
    if (passoNum) passoNum.textContent = String(i + 1);
    if (barra) barra.style.transform = `scaleX(${(i + 1) / etapas.length})`;
    voltar.hidden = i === 0;
    avancar.hidden = i !== 0;
    enviar.hidden = i === 0;
    if (focar) {
      const alvo = camposDa(i)[0];
      alvo?.scrollIntoView({ block: 'center', behavior: 'smooth' });
      const el = alvo && controle(alvo);
      // não dá foco automático no campo de data: abriria o calendário por cima
      // da tela sem o visitante ter pedido
      if (el && el.dataset.datepicker !== 'true') setTimeout(() => el.focus({ preventScroll: true }), 220);
    }
  };

  avancar.addEventListener('click', () => { if (validarEtapa(0)) irParaEtapa(1, true); });
  voltar.addEventListener('click', () => irParaEtapa(0, true));

  // O forms.ts envia no Enter. Na etapa 1 o Enter tem que avançar, não enviar.
  form.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' || atual !== 0) return;
    const alvo = e.target as HTMLElement;
    if (alvo.tagName === 'TEXTAREA') return;
    e.preventDefault();
    e.stopPropagation();
    if (validarEtapa(0)) irParaEtapa(1, true);
  }, true);

  irParaEtapa(0);
}
