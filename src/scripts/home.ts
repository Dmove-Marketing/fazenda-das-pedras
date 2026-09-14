export function initHome(): void {
  initHeader();
  initMobileMenu();
  initHeroSlider();
  initGallerySlider();
  initTabs();
  initWaContactBtn();
}

function initWaContactBtn(): void {
  document.getElementById('orig-wa-open')?.addEventListener('click', (e) => {
    e.stopPropagation();
    document.getElementById('wa-toggle')?.click();
  });
}

function initHeader(): void {
  const header = document.getElementById('orig-header');
  if (!header) return;
  const update = () => header.classList.toggle('scrolled', window.scrollY > 10);
  window.addEventListener('scroll', update, { passive: true });
  update();
}

function initMobileMenu(): void {
  const btn = document.getElementById('orig-mobile-btn') as HTMLButtonElement | null;
  const nav = document.getElementById('orig-mobile-nav');
  if (!btn || !nav) return;
  btn.addEventListener('click', () => {
    const open = btn.classList.toggle('active');
    nav.classList.toggle('active', open);
    btn.setAttribute('aria-expanded', String(open));
    document.body.style.overflow = open ? 'hidden' : '';
  });
  nav.querySelectorAll('a').forEach(a =>
    a.addEventListener('click', () => {
      btn.classList.remove('active');
      nav.classList.remove('active');
      btn.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
    })
  );
}

function initHeroSlider(): void {
  const isMobile = window.innerWidth < 768;
  const activeClass = isMobile ? 'mobile-only' : 'desktop-only';
  const slides = Array.from(
    document.querySelectorAll<HTMLElement>(`.orig-hero-slide.${activeClass}`)
  );
  const dots = document.querySelectorAll<HTMLButtonElement>('#orig-hero-dots .orig-hero-dot');
  if (slides.length < 2) return;

  // Remove stale active from opposite set
  document.querySelectorAll<HTMLElement>(`.orig-hero-slide:not(.${activeClass})`).forEach(s => s.classList.remove('active'));

  let cur = 0;
  slides[0].classList.add('active');
  dots[0]?.classList.add('active');

  let timer: ReturnType<typeof setInterval>;

  const go = (n: number) => {
    slides[cur].classList.remove('active');
    dots[cur]?.classList.remove('active');
    cur = (n + slides.length) % slides.length;
    slides[cur].classList.add('active');
    dots[cur]?.classList.add('active');
  };

  const start = () => { timer = setInterval(() => go(cur + 1), 5000); };
  const stop  = () => clearInterval(timer);

  dots.forEach((d, i) => d.addEventListener('click', () => { stop(); go(i); start(); }));
  document.addEventListener('visibilitychange', () => document.hidden ? stop() : start());
  start();
}

function initGallerySlider(): void {
  const track = document.querySelector<HTMLElement>('.orig-gallery-track');
  const slides = document.querySelectorAll<HTMLElement>('.orig-gallery-slide');
  const dots   = document.querySelectorAll<HTMLButtonElement>('.orig-gallery-dot');
  const prev   = document.querySelector<HTMLButtonElement>('.orig-gallery-prev');
  const next   = document.querySelector<HTMLButtonElement>('.orig-gallery-next');
  if (!track || !slides.length) return;

  let cur = 0;
  let timer: ReturnType<typeof setInterval>;

  const go = (n: number) => {
    dots[cur]?.classList.remove('active');
    cur = (n + slides.length) % slides.length;
    track.style.transform = `translateX(-${cur * 100}%)`;
    dots[cur]?.classList.add('active');
  };

  const start = () => { timer = setInterval(() => go(cur + 1), 4000); };
  const stop  = () => clearInterval(timer);

  prev?.addEventListener('click', () => { stop(); go(cur - 1); start(); });
  next?.addEventListener('click', () => { stop(); go(cur + 1); start(); });
  dots.forEach((d, i) => d.addEventListener('click', () => { stop(); go(i); start(); }));

  document.addEventListener('visibilitychange', () => document.hidden ? stop() : start());
  start();
}

function initTabs(): void {
  document.querySelectorAll<HTMLElement>('.orig-tabs-group').forEach(group => {
    const navLinks = group.querySelectorAll<HTMLAnchorElement>('.orig-tabs-nav a');
    const panels   = group.querySelectorAll<HTMLElement>('.orig-tab-panel');

    navLinks.forEach((link, i) => {
      link.addEventListener('click', e => {
        e.preventDefault();
        navLinks.forEach(l => l.classList.remove('active'));
        panels.forEach(p => p.classList.remove('active'));
        link.classList.add('active');
        panels[i]?.classList.add('active');
      });
    });

    // activate first tab
    navLinks[0]?.classList.add('active');
    panels[0]?.classList.add('active');
  });
}
