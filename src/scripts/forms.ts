import { keyMap, trackingParamKeys, getPageSource } from './lead-payload';

// Captura o IP público do visitante uma única vez (memoizado). Em produção usa o
// endpoint same-origin do Cloudflare (/cdn-cgi/trace), sem terceiros; cai no ipify
// como fallback (ex.: dev local, VPS sem Cloudflare).
let clientIpPromise: Promise<string> | null = null;
export function getClientIp(): Promise<string> {
  if (clientIpPromise) return clientIpPromise;
  clientIpPromise = (async () => {
    try {
      const r = await fetch('/cdn-cgi/trace', { cache: 'no-store' });
      if (r.ok) {
        const m = (await r.text()).match(/^ip=(.+)$/m);
        if (m) return m[1].trim();
      }
    } catch {}
    try {
      const r = await fetch('https://api.ipify.org?format=json', { cache: 'no-store' });
      if (r.ok) {
        const j = await r.json();
        if (j && j.ip) return j.ip as string;
      }
    } catch {}
    return '';
  })();
  return clientIpPromise;
}

function applyPhoneMask(input: HTMLInputElement) {
  input.addEventListener('input', () => {
    let v = input.value.replace(/\D/g, '');
    if (v.startsWith('55') && v.length > 11) {
      v = v.slice(2);
    }
    if (v.length > 11) v = v.slice(0, 11);
    if (v.length > 7) {
      v = `(${v.slice(0, 2)}) ${v.slice(2, 7)}-${v.slice(7)}`;
    } else if (v.length > 2) {
      v = `(${v.slice(0, 2)}) ${v.slice(2)}`;
    } else if (v.length > 0) {
      v = `(${v}`;
    }
    input.value = v;
  });
}

export function initForms() {
  getClientIp(); // aquece a captura de IP no load, para não atrasar o envio
  const forms = document.querySelectorAll<HTMLFormElement>('form[data-form-id]');
  forms.forEach((form) => {
    if ((form as any).__formsInitialized) return;
    (form as any).__formsInitialized = true;

    let started = false;
    const formId  = form.dataset.formId!;
    const project = form.dataset.project || window.location.hostname;

    const isPhoneField = (el: HTMLInputElement) => {
      const n = (el.name || '').toLowerCase();
      return n === 'telefone' || n === 'whatsapp' || el.type === 'tel';
    };

    form.querySelectorAll<HTMLInputElement>('input').forEach((input) => {
      if (isPhoneField(input)) applyPhoneMask(input);
    });

    const submitUrl   = form.dataset.submitUrl;
    const redirectUrl = form.dataset.redirect;
    const gridId      = form.dataset.gridId;
    const successId   = form.dataset.successId;

    if (!submitUrl) {
      console.warn(`[Forms] Formulário ${formId} sem URL de webhook (data-submit-url).`);
      return;
    }

    form.addEventListener('focusin', () => {
      if (!started) {
        started = true;
        (window as any).dataLayer?.push({ event: 'form_start', form_source: 'form', form_id: formId, project });
      }
    });

    const submitBtn = form.querySelector<HTMLButtonElement>('.form-submit, [type="button"], [type="submit"]');

    const handleSubmit = async () => {
      const hp = form.querySelector<HTMLInputElement>('[name="website"]');
      if (hp && hp.value) return;

      // Validação de campos obrigatórios
      let firstInvalid: HTMLElement | null = null;
      let isValid = true;

      form.querySelectorAll<HTMLElement>('[required]').forEach((field) => {
        const el = field as HTMLInputElement;
        const isEmpty =
          el.type === 'checkbox'
            ? !el.checked
            : !el.value || (field.tagName === 'SELECT' && (field as HTMLSelectElement).value === '');

        if (isEmpty) {
          isValid = false;
          (field as HTMLElement).style.borderColor = '#ef4444';
          (field as HTMLElement).style.outline = '2px solid #ef4444';
          if (!firstInvalid) firstInvalid = field;
          const clearError = () => {
            (field as HTMLElement).style.removeProperty('border-color');
            (field as HTMLElement).style.removeProperty('outline');
            field.removeEventListener('input', clearError);
            field.removeEventListener('change', clearError);
          };
          field.addEventListener('input', clearError);
          field.addEventListener('change', clearError);
        }
      });

      // Validação de formato: email
      form.querySelectorAll<HTMLInputElement>('input[type="email"]').forEach((field) => {
        if (!field.value) return; // campo vazio já capturado pelo required acima
        const ok = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(field.value);
        if (!ok) {
          isValid = false;
          (field as HTMLElement).style.borderColor = '#ef4444';
          (field as HTMLElement).style.outline = '2px solid #ef4444';
          if (!firstInvalid) firstInvalid = field;
          const clear = () => {
            (field as HTMLElement).style.removeProperty('border-color');
            (field as HTMLElement).style.removeProperty('outline');
            field.removeEventListener('input', clear);
          };
          field.addEventListener('input', clear);
        }
      });

      // Validação de formato: telefone (mínimo 10 dígitos — DDD + número, sem DDI 55)
      form.querySelectorAll<HTMLInputElement>('input').forEach((field) => {
        if (!isPhoneField(field) || !field.value) return;
        const digits = field.value.replace(/\D/g, '');
        const startsWith55 = digits.startsWith('55');
        if (digits.length < 10 || startsWith55) {
          isValid = false;
          (field as HTMLElement).style.borderColor = '#ef4444';
          (field as HTMLElement).style.outline = '2px solid #ef4444';
          if (!firstInvalid) firstInvalid = field;

          let errorEl = field.parentElement?.querySelector('.field-error, .lead-form-field-error') as HTMLElement | null;
          if (!errorEl && field.parentElement) {
            errorEl = document.createElement('span');
            errorEl.className = 'field-error';
            errorEl.style.color = '#ef4444';
            errorEl.style.fontSize = '0.78rem';
            errorEl.style.marginTop = '4px';
            field.parentElement.appendChild(errorEl);
          }

          if (errorEl) {
            errorEl.textContent = startsWith55
              ? 'Não inclua o DDI 55. Digite apenas DDD + telefone (ex: 11 99999-9999).'
              : 'Por favor, informe um telefone válido com DDD (mínimo 10 dígitos).';
            errorEl.style.display = 'block';
            errorEl.classList.add('visible');
          }

          const clear = () => {
            (field as HTMLElement).style.removeProperty('border-color');
            (field as HTMLElement).style.removeProperty('outline');
            if (errorEl) {
              errorEl.style.display = 'none';
              errorEl.classList.remove('visible');
            }
            field.removeEventListener('input', clear);
          };
          field.addEventListener('input', clear);
        }
      });

      if (!isValid) {
        firstInvalid!.scrollIntoView({ behavior: 'smooth', block: 'center' });
        (firstInvalid as HTMLElement).focus();
        return;
      }

      const btnText    = submitBtn?.querySelector<HTMLElement>('.btn-text');
      const btnLoading = submitBtn?.querySelector<HTMLElement>('.btn-loading');

      const msgEl = gridId
        ? document.getElementById(gridId)?.querySelector('[id$="FormMsg"]') as HTMLElement | null
        : form.querySelector('.form-error') as HTMLElement | null;

      if (submitBtn) submitBtn.disabled = true;

      if (btnText && btnLoading) {
        btnText.style.display = 'none';
        btnLoading.style.display = 'inline-flex';
      } else if (submitBtn && !submitBtn.querySelector('.btn-loading')) {
        const originalText = submitBtn.innerHTML;
        submitBtn.dataset.originalText = originalText;
        submitBtn.innerHTML = 'Enviando...';
      }

      if (msgEl) msgEl.style.display = 'none';

      const formData = new FormData(form);
      const rawData: Record<string, string> = {};
      // serializa campos; nomes repetidos (ex.: checkboxes) viram lista separada por vírgula
      formData.forEach((v, k) => {
        if (k === 'website') return;
        const val = v.toString();
        rawData[k] = rawData[k] ? `${rawData[k]}, ${val}` : val;
      });

      const trackingRaw = sessionStorage.getItem('dmove_tracking');
      const tracking: Record<string, string> = trackingRaw ? JSON.parse(trackingRaw) : {};

      const now = new Date();
      const dateStr = now.toLocaleDateString('pt-BR');
      const timeStr = now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

      const capitalizedFields: Record<string, string> = {};
      let fonteBase = rawData['fonte'] || form.dataset.fonte || getPageSource(window.location.pathname);
      Object.entries(rawData).forEach(([key, val]) => {
        if (key === 'fonte') return;
        const normalizedKey = key.trim().toLowerCase();
        const mappedKey = keyMap[normalizedKey] || (key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' '));
        capitalizedFields[mappedKey] = val;
      });

      const qs = new URLSearchParams();
      trackingParamKeys.forEach(k => { if (tracking[k]) qs.set(k, tracking[k]); });
      const fonte = qs.toString() ? `${fonteBase}?${qs.toString()}` : fonteBase;

      // Campos de tracking flat pro n8n: Meta CAPI (fbc/fbp/external_id/event_id)
      // + Google Ads OCI (gclid/gbraid/wbraid) para atribuir a conversão ao clique.
      const metaCapi: Record<string, string> = {};
      if (tracking['fbc'])         metaCapi['fbc']         = tracking['fbc'];
      if (tracking['fbp'])         metaCapi['fbp']         = tracking['fbp'];
      if (tracking['external_id']) metaCapi['external_id'] = tracking['external_id'];
      if (tracking['event_id'])    metaCapi['event_id']    = tracking['event_id'];
      if (tracking['gclid'])       metaCapi['gclid']       = tracking['gclid'];
      if (tracking['gbraid'])      metaCapi['gbraid']      = tracking['gbraid'];
      if (tracking['wbraid'])      metaCapi['wbraid']      = tracking['wbraid'];

      // IP do visitante (já aquecido no load); timeout curto para nunca travar o envio
      const clientIp = await Promise.race([
        getClientIp(),
        new Promise<string>((resolve) => setTimeout(() => resolve(''), 1500)),
      ]);

      const payload: Record<string, string> = {
        ...capitalizedFields,
        Fonte: fonte,
        Data: dateStr,
        'Horário': timeStr,
        'URL da página': window.location.href,
        'IP do usuário': clientIp,
        'Agente de usuário': navigator.userAgent,
        'Desenvolvido por': 'Dmove',
        form_id: formId,
        form_name: formId,
        ...metaCapi,
      };

      try {
        const res = await fetch(submitUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!res.ok) throw new Error('http_' + res.status);

        let json: any = {};
        try { json = await res.json(); } catch {}

        // dataLayer limpo, SEM PII (o GTM lê e-mail/telefone/nome do DOM via Enhanced Conversions)
        (window as any).dataLayer?.push({
          event: 'form_submit',
          form_source: 'form',
          form_id: formId,
          project,
          tipo_evento: rawData['tipo_evento'] || '',
          event_id: tracking['event_id'] || (window as any).__page_event_id || '',
        });

        const redir = redirectUrl || json.redirect;
        if (redir) {
          window.location.href = redir;
          return;
        }

        const gridEl    = gridId    ? document.getElementById(gridId)    : null;
        const successEl = successId ? document.getElementById(successId) : null;

        if (gridEl && successEl) {
          gridEl.style.display = 'none';
          successEl.classList.add('active');
        } else {
          form.innerHTML = `
            <div style="text-align:center;padding:2rem;">
              <div style="width:56px;height:56px;display:flex;align-items:center;justify-content:center;margin:0 auto 1rem;background:var(--color-primary,#2563eb);border-radius:50%;color:white;">✓</div>
              <h3 style="font-size:1.15rem;font-weight:600;margin-bottom:4px;">Enviado com sucesso!</h3>
              <p style="color:#666;font-size:0.9rem;">Em breve entraremos em contato.</p>
            </div>`;
        }
      } catch (err: any) {
        (window as any).dataLayer?.push({ event: 'form_error', form_source: 'form', form_id: formId, error: err.message });

        if (msgEl) {
          msgEl.innerHTML = 'Erro ao enviar. Tente novamente mais tarde.';
          msgEl.style.display = 'block';
        } else {
          alert('Erro ao enviar o formulário. Tente novamente mais tarde.');
        }

        if (submitBtn) {
          submitBtn.disabled = false;
          if (btnText && btnLoading) {
            btnText.style.display = 'inline';
            btnLoading.style.display = 'none';
          } else if (submitBtn.dataset.originalText) {
            submitBtn.innerHTML = submitBtn.dataset.originalText;
          }
        }
      }
    };

    if (submitBtn) {
      submitBtn.addEventListener('click', (e) => {
        e.preventDefault();
        handleSubmit();
      });
    }

    form.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target instanceof HTMLElement) {
        const tag = e.target.tagName.toLowerCase();
        if (tag !== 'textarea' && tag !== 'button') {
          e.preventDefault();
          handleSubmit();
        }
      }
    });
  });
}
