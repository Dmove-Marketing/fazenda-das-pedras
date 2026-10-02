// ============================================================
// Interações da /casamentos
// ------------------------------------------------------------
// Carrossel nativo (viewport + scroll-snap), palco de painéis
// que expandem, lightbox desktop-only, e reveal por scroll.
// Sem dependências externas — puro DOM + IntersectionObserver.
// ============================================================

// ---------- Carrosséis ----------
export function initCarrosseis() {
  const seta = (dir: number) =>
    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${dir < 0 ? 'm15 18-6-6 6-6' : 'm9 18 6-6-6-6'}"/></svg>`;

  document.querySelectorAll<HTMLElement>('[data-carrossel]').forEach((car) => {
    const vp = car.querySelector<HTMLElement>('.carrossel__viewport');
    if (!vp) return;
    const slides = Array.from(vp.children);
    const total = slides.length;
    if (total < 2) return;

    const prev = document.createElement('button');
    prev.className = 'carrossel__seta carrossel__seta--prev';
    prev.type = 'button';
    prev.setAttribute('aria-label', 'Foto anterior');
    prev.innerHTML = seta(-1);

    const next = document.createElement('button');
    next.className = 'carrossel__seta carrossel__seta--next';
    next.type = 'button';
    next.setAttribute('aria-label', 'Próxima foto');
    next.innerHTML = seta(1);

    const pontos = document.createElement('div');
    pontos.className = 'carrossel__pontos';
    for (let i = 0; i < total; i++) {
      const p = document.createElement('span');
      p.className = 'carrossel__ponto';
      pontos.appendChild(p);
    }
    car.appendChild(prev);
    car.appendChild(next);
    car.appendChild(pontos);

    const atual = () => Math.round(vp.scrollLeft / vp.clientWidth);
    const ir = (i: number) => {
      vp.scrollTo({ left: ((i + total) % total) * vp.clientWidth, behavior: 'smooth' });
    };
    const marcar = () => {
      const a = atual();
      Array.from(pontos.children).forEach((p, i) => p.classList.toggle('ativo', i === a));
    };

    prev.addEventListener('click', () => ir(atual() - 1));
    next.addEventListener('click', () => ir(atual() + 1));
    vp.addEventListener('scroll', () => requestAnimationFrame(marcar), { passive: true });
    marcar();
  });
}

// ---------- Palco (painéis que expandem) ----------
export function initPalco() {
  document.querySelectorAll<HTMLElement>('[data-palco]').forEach((palco) => {
    const paineis = Array.from(palco.querySelectorAll<HTMLElement>('.palco__painel'));

    const ativar = (i: number) => {
      paineis.forEach((p, j) => {
        p.classList.toggle('ativo', j === i);
        p.setAttribute('aria-pressed', j === i ? 'true' : 'false');
      });
    };

    paineis.forEach((p, i) => {
      p.addEventListener('click', () => ativar(i));
      const prog = p.querySelector<HTMLElement>('.palco__progresso');
      prog?.addEventListener('animationend', () => ativar((i + 1) % paineis.length));
    });

    if ('IntersectionObserver' in window) {
      new IntersectionObserver(
        (en) => palco.classList.toggle('visivel-palco', en[0].isIntersecting),
        { threshold: 0.4 }
      ).observe(palco);
    }
  });
}

// ---------- Lightbox (desktop only) ----------
export function initLightbox() {
  const lb = document.getElementById('lightbox');
  if (!lb) return;
  const lbImg = lb.querySelector<HTMLImageElement>('.lightbox__img');
  if (!lbImg) return;

  let grupo: HTMLAnchorElement[] = [];
  let indice = 0;

  const mostrar = () => {
    const a = grupo[indice];
    lbImg.src = a.getAttribute('href') || '';
    const img = a.querySelector('img');
    lbImg.alt = img ? img.alt : '';
  };

  const fechar = () => {
    lb.classList.remove('aberto');
    document.body.style.overflow = '';
  };

  document.querySelectorAll<HTMLAnchorElement>('[data-lightbox]').forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      if (window.innerWidth < 900) return;
      const chave = a.dataset.lightbox as string;
      grupo = Array.from(document.querySelectorAll<HTMLAnchorElement>(`[data-lightbox="${chave}"]`));
      indice = grupo.indexOf(a);
      mostrar();
      lb.classList.add('aberto');
      document.body.style.overflow = 'hidden';
    });
  });

  lb.querySelector('.lightbox__fechar')?.addEventListener('click', fechar);
  lb.querySelector('.lightbox__prev')?.addEventListener('click', () => {
    indice = (indice - 1 + grupo.length) % grupo.length;
    mostrar();
  });
  lb.querySelector('.lightbox__next')?.addEventListener('click', () => {
    indice = (indice + 1) % grupo.length;
    mostrar();
  });
  lb.addEventListener('click', (e) => { if (e.target === lb) fechar(); });

  document.addEventListener('keydown', (e) => {
    if (!lb.classList.contains('aberto')) return;
    if (e.key === 'Escape') fechar();
    if (e.key === 'ArrowLeft') lb.querySelector<HTMLButtonElement>('.lightbox__prev')?.click();
    if (e.key === 'ArrowRight') lb.querySelector<HTMLButtonElement>('.lightbox__next')?.click();
  });
}

// ---------- Menu mobile: fecha ao escolher link ----------
export function initMenu() {
  const menu = document.getElementById('alterna-menu') as HTMLInputElement | null;
  if (!menu) return;
  document.querySelectorAll('.cabecalho__nav a').forEach((a) => {
    a.addEventListener('click', () => { menu.checked = false; });
  });
}

// ---------- Animação de entrada ----------
export function initReveal() {
  const itens = document.querySelectorAll<HTMLElement>('.revelar');
  if (!('IntersectionObserver' in window)) {
    itens.forEach((el) => el.classList.add('visivel'));
    return;
  }
  const io = new IntersectionObserver(
    (entradas) => {
      entradas.forEach((en) => {
        if (en.isIntersecting) {
          en.target.classList.add('visivel');
          io.unobserve(en.target);
        }
      });
    },
    { threshold: 0.12, rootMargin: '0px 0px -40px 0px' }
  );
  itens.forEach((el) => io.observe(el));
}
