export function initCorporativo() {
  // Hero Slider
  const heroSlider = document.getElementById('corp-hero-slider');
  if (heroSlider) {
    const slides = heroSlider.querySelectorAll<HTMLElement>('.corp-hero-slide');
    let current = 0;
    if (slides.length > 1) {
      setInterval(() => {
        slides[current].classList.remove('active');
        current = (current + 1) % slides.length;
        slides[current].classList.add('active');
      }, 5000);
    }
    // Preload images
    slides.forEach((slide) => {
      const bg = slide.style.backgroundImage;
      if (bg) {
        const url = bg.replace(/url\(['"]?(.+?)['"]?\)/i, '$1');
        const img = new Image();
        img.src = url;
      }
    });
  }

  // Mobile menu
  const mobileBtn = document.getElementById('corp-mobile-btn');
  const mainNav   = document.getElementById('corp-main-nav');
  if (mobileBtn && mainNav) {
    mobileBtn.addEventListener('click', () => {
      mobileBtn.classList.toggle('active');
      mainNav.classList.toggle('active');
      document.body.style.overflow = mainNav.classList.contains('active') ? 'hidden' : '';
    });
    mainNav.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => {
        mobileBtn.classList.remove('active');
        mainNav.classList.remove('active');
        document.body.style.overflow = '';
      });
    });
  }

  // Header scroll
  const header = document.getElementById('corp-header');
  if (header) {
    const onScroll = () => header.classList.toggle('scrolled', window.scrollY > 100);
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }

  // Smooth scroll (offset pelo header fixo)
  document.querySelectorAll<HTMLAnchorElement>('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener('click', (e) => {
      const href = anchor.getAttribute('href');
      if (!href || href === '#') return;
      const target = document.querySelector<HTMLElement>(href);
      if (!target) return;
      e.preventDefault();
      const offset = header ? header.offsetHeight : 0;
      window.scrollTo({ top: target.getBoundingClientRect().top + window.scrollY - offset, behavior: 'smooth' });
    });
  });

  // FAQ accordion
  const faqItems = document.querySelectorAll<HTMLElement>('.corp-faq-item');

  function openFaq(item: HTMLElement) {
    const btn    = item.querySelector<HTMLButtonElement>('.corp-faq-question')!;
    const answer = item.querySelector<HTMLElement>('.corp-faq-answer')!;
    item.classList.add('open');
    btn.setAttribute('aria-expanded', 'true');
    answer.style.maxHeight = answer.scrollHeight + 'px';
  }

  function closeFaq(item: HTMLElement) {
    const btn    = item.querySelector<HTMLButtonElement>('.corp-faq-question')!;
    const answer = item.querySelector<HTMLElement>('.corp-faq-answer')!;
    item.classList.remove('open');
    btn.setAttribute('aria-expanded', 'false');
    answer.style.maxHeight = '0';
  }

  faqItems.forEach((item) => {
    const btn = item.querySelector<HTMLButtonElement>('.corp-faq-question')!;
    btn.addEventListener('click', () => {
      const isOpen = item.classList.contains('open');
      faqItems.forEach(closeFaq);
      if (!isOpen) openFaq(item);
    });
  });

  // Abre o primeiro item por padrão
  if (faqItems.length > 0) openFaq(faqItems[0]);

  // Scroll animations
  const animTargets = document.querySelectorAll<HTMLElement>(
    '.corp-section-header, .corp-event-card, .corp-space-card, .corp-benefit-item, ' +
    '.corp-process-step, .corp-case-card, .corp-faq-item',
  );
  if ('IntersectionObserver' in window) {
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((entry, i) => {
        if (entry.isIntersecting) {
          setTimeout(() => entry.target.classList.add('corp-animate-in'), i * 80);
          obs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.1, rootMargin: '0px 0px -50px 0px' });
    animTargets.forEach((el) => { el.classList.add('corp-animate-prepare'); obs.observe(el); });
  }
}
