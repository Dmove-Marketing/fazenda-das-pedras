// ============================================================
// /eventos-corporativos — conversão do HTML do time de criação
// ------------------------------------------------------------
// Gera src/styles/eventos-corporativos.css e src/pages/eventos-corporativos.astro
// a partir do HTML entregue em "docs para desenvolvimento/ENTREGA/".
// Reexecutável: design revisado → roda de novo.
//
//   node tools/build-eventos-corporativos.mjs
// ============================================================
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const SRC  = '../eventos-corporativos/docs para desenvolvimento/ENTREGA/fazenda-das-pedras-eventos-corporativos.html';
const CDN  = 'https://media.dmove.com.br/clients/fazenda-das-pedras/photos';
const HERO = `${CDN}/fazendadaspedras-corporativo-hero.webp`;

const html = await readFile(SRC, 'utf8');

// ------------------------------------------------------------
// 1. CSS
// ------------------------------------------------------------
let css = html.match(/<style>([\s\S]*?)<\/style>/)[1];

// fontes do design → woff2 self-hospedado em public/fonts
css = css.replace(
  /url\('fontes\/([^']+)\.(ttf|otf)'\) format\('(truetype|opentype)'\)/g,
  (_m, name) => `url('/fonts/${name}.woff2') format('woff2')`
);

// imagens de background → CDN (webp)
css = css.replace(/url\('imagens\/([^']+)\.(jpe?g|png)'\)/gi, (_m, name) => `url('${CDN}/${name}.webp')`);

// Fase 5 do playbook: o global.css aplica --font-display/--font-body em h1..h6.
// Sem sobrescrever os tokens, os títulos caem na fonte de sistema.
css = css.replace(
  /(--fonte-corpo: [^;]+;)/,
  `$1\n\n    /* Sobrescreve os tokens do global.css (Fase 5 do playbook) */\n    --font-display: 'Kalista Serif', Georgia, 'Times New Roman', serif;\n    --font-body: 'Gotham', 'Segoe UI', Arial, sans-serif;`
);

// Correção no CSS do design: o seletor aponta para ".cabecalho__barra", que é
// ancestral (e não irmão) do checkbox — as barras nunca viravam um "X".
css = css.replace(/#alterna-menu:checked ~ \.cabecalho__barra \.cabecalho__botao-menu/g,
  '#alterna-menu:checked ~ .cabecalho__botao-menu');

const CSS_EXTRA = `
/* ============================================================
   Integrações Dmove (não vêm do design)
   Blindagem contra o global.css, estados do formulário padrão,
   âncoras sob o header fixo e tema do Flatpickr na paleta da marca.
   ============================================================ */

/* O global.css impõe font-family e line-height no body; o design assume o
   line-height "normal" herdado e define o seu onde importa. Sem isto, todo
   elemento que herda (rótulos, cards) cresce ~6px e a página inteira desalinha. */
body { font-family: var(--fonte-corpo); line-height: normal; }
p { color: inherit; line-height: normal; }
h1, h2, h3, h4, h5, h6 { font-family: var(--fonte-titulo); line-height: normal; letter-spacing: normal; }

/* Âncoras do menu não podem parar embaixo do header fixo */
section[id], header[id] { scroll-margin-top: 84px; }

/* Honeypot anti-spam */
.formulario .honeypot {
  position: absolute; left: -9999px; width: 1px; height: 1px;
  opacity: 0; pointer-events: none; font-family: inherit;
}

/* Linha de campo único mantém o mesmo respiro dos pares */
@media (min-width: 640px) {
  .campo-linha .campo { margin-bottom: 18px; }
}

/* Mensagem de erro de envio */
.formulario__msg {
  display: none;
  margin-bottom: 12px;
  padding: 10px 14px;
  border-radius: 10px;
  background: #FDECEC;
  border: 1px solid #F3C4C4;
  color: #9B2C2C;
  font-size: 13px;
}

/* Erro por campo (criado em runtime pelo forms.ts) */
.campo .field-error { display: block; margin-top: 4px; font-size: 12px; color: #9B2C2C; }

/* Botão em estado de envio */
.botao[disabled] { opacity: .7; cursor: progress; }
.botao .btn-loading { display: none; }

/* Confirmação de envio — ocupa o lugar do formulário */
.formulario--sucesso { display: none; text-align: center; padding: 40px 26px; }
.formulario--sucesso.active { display: block; }
.formulario--sucesso svg {
  width: 46px; height: 46px; margin-bottom: 14px;
  color: var(--cor-primaria); stroke-width: 1.6;
}
.formulario--sucesso h3 {
  font-family: var(--fonte-titulo); font-weight: 400;
  font-size: 26px; line-height: 1.2; color: var(--cor-primaria-escura);
  margin: 0 0 10px;
}
.formulario--sucesso p { font-size: 15px; color: var(--cor-texto); margin: 0; }

/* Flatpickr na paleta da marca */
.flatpickr-calendar { font-family: var(--fonte-corpo); border-radius: 12px; box-shadow: 0 12px 40px rgba(58,62,31,.18); }
.flatpickr-months, .flatpickr-weekdays, .flatpickr-weekdaycontainer { background: var(--cor-primaria); }
.flatpickr-months .flatpickr-month, .flatpickr-current-month, .flatpickr-weekday { color: var(--cor-texto-claro); fill: var(--cor-texto-claro); }
.flatpickr-months .flatpickr-prev-month svg, .flatpickr-months .flatpickr-next-month svg { fill: var(--cor-texto-claro); }
.flatpickr-day.selected, .flatpickr-day.selected:hover { background: var(--cor-destaque-escura); border-color: var(--cor-destaque-escura); color: #fff; }
.flatpickr-day:hover { background: var(--cor-fundo-creme); border-color: var(--cor-fundo-creme); }
.flatpickr-day.today { border-color: var(--cor-destaque); }
`;

await writeFile(
  'src/styles/eventos-corporativos.css',
  `/* ============================================================
   /eventos-corporativos — CSS do design (Claude Design)
   GERADO por tools/build-eventos-corporativos.mjs — não edite à mão.
   Edite o HTML em "docs para desenvolvimento/ENTREGA/" e rode o script.
   ============================================================ */
${css}
${CSS_EXTRA}`
);

// ------------------------------------------------------------
// 2. Corpo da página
// ------------------------------------------------------------
let body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/)[1].trim();

body = body
  .replace(/src="imagens\/(logo-[^"]+\.svg)"/g, (_m, f) => `src="/images/eventos-corporativos/${f}"`)
  .replace(/src="imagens\/([^"]+)\.(jpe?g|png)"/gi, (_m, name) => `src="${CDN}/${name}.webp"`);

// a11y: aria-label é proibido em <label>. O nome acessível vai no checkbox,
// que é o elemento de fato controlado pelo usuário.
body = body
  .replace('<input type="checkbox" id="alterna-menu" class="somente-leitor">',
           '<input type="checkbox" id="alterna-menu" class="somente-leitor" aria-label="Abrir menu">')
  .replace('<label for="alterna-menu" class="cabecalho__botao-menu" aria-label="Abrir menu">',
           '<label for="alterna-menu" class="cabecalho__botao-menu">');

const restantes = [...body.matchAll(/(?:src|url\()["']?imagens\/[^"')]+/g)].map((m) => m[0]);
if (restantes.length) throw new Error(`Referências não convertidas: ${restantes.join(', ')}`);

// O formulário do design é substituído pelo motor padrão Dmove (campos vêm do preset).
const formStart = body.indexOf('        <!-- Formulário padrão Dmove');
const formEnd   = body.indexOf('</form>') + '</form>'.length;
if (formStart < 0 || formEnd < 7) throw new Error('Bloco do formulário não localizado no HTML de origem.');

const FORM = `        <!-- Formulário padrão Dmove — campos em src/scripts/form-presets.ts,
             envio/validação/tracking em src/scripts/forms.ts. Estética do design. -->
        <div id="form-grid">
          <form
            class="formulario"
            id="lead-form"
            data-form-id="lead-form"
            data-submit-url={webhookUrl}
            data-grid-id="form-grid"
            data-success-id="form-success"
            novalidate
          >
            <input type="text" name="website" class="honeypot" tabindex="-1" autocomplete="off" aria-hidden="true" />

            {formRows.map((linha) => (
              <div class={linha.length > 1 ? 'campos-duplos' : 'campo-linha'}>
                {linha.map((field) => (
                  <div class={\`campo\${field.required ? '' : ' campo--opcional'}\`}>
                    <label for={\`form-field-\${field.name}\`}>
                      {field.label}
                      {field.hint && <span> ({field.hint})</span>}
                    </label>

                    {field.type === 'select' ? (
                      <select id={\`form-field-\${field.name}\`} name={field.name} required={field.required}>
                        {field.options?.map((opt) => (
                          <option value={opt.value} disabled={opt.disabled} selected={opt.selected}>{opt.label}</option>
                        ))}
                      </select>
                    ) : field.type === 'textarea' ? (
                      <textarea
                        id={\`form-field-\${field.name}\`}
                        name={field.name}
                        placeholder={field.placeholder}
                        required={field.required}
                        rows={3}
                      />
                    ) : (
                      <input
                        id={\`form-field-\${field.name}\`}
                        type={field.type}
                        name={field.name}
                        placeholder={field.placeholder}
                        required={field.required}
                        min={field.type === 'number' ? '1' : undefined}
                        autocomplete={autoComplete[field.name]}
                        inputmode={field.type === 'tel' ? 'tel' : field.type === 'number' ? 'numeric' : undefined}
                        data-datepicker={field.datepicker ? 'true' : undefined}
                      />
                    )}
                  </div>
                ))}
              </div>
            ))}

            <div class="formulario__msg" id="leadFormMsg"></div>

            <button type="submit" class="botao botao--primario botao--largo form-submit">
              <span class="btn-text">Enviar solicitação</span>
              <span class="btn-loading">Enviando…</span>
            </button>
          </form>
        </div>

        <div class="formulario formulario--sucesso" id="form-success" role="alert">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
          </svg>
          <h3>Recebemos sua solicitação</h3>
          <p>Nossa equipe entra em contato em breve pelo WhatsApp ou e-mail para planejar a sua confraternização.</p>
        </div>`;

body = body.slice(0, formStart) + FORM + body.slice(formEnd);

// ------------------------------------------------------------
// 3. Página Astro
// ------------------------------------------------------------
const title = html.match(/<title>([^<]+)<\/title>/)[1];
const description = html.match(/<meta name="description" content="([^"]+)"/)[1];

const page = `---
// ============================================================
// /eventos-corporativos — LP do funil corporativo (F1)
// GERADO por tools/build-eventos-corporativos.mjs — não edite à mão.
// Design: "docs para desenvolvimento/ENTREGA/fazenda-das-pedras-eventos-corporativos.html"
// ============================================================
import Base from '../layouts/Base.astro';
import '../styles/eventos-corporativos.css';
import config from '../../config.json';
import { getPreset } from '../scripts/form-presets';

const webhookUrl = config.forms['lead-form'].webhooks[0];
const campos = getPreset('corporativo');

// Campos "full" ocupam a linha toda; os demais fluem em pares no grid do design.
const formRows: (typeof campos)[] = [];
let par: typeof campos = [];
for (const campo of campos) {
  if (campo.full) {
    if (par.length) { formRows.push(par); par = []; }
    formRows.push([campo]);
    continue;
  }
  par.push(campo);
  if (par.length === 2) { formRows.push(par); par = []; }
}
if (par.length) formRows.push(par);

const autoComplete: Record<string, string> = {
  empresa: 'organization',
  nome: 'name',
  telefone: 'tel',
  email: 'email',
};

const jsonLd = {
  '@context': 'https://schema.org',
  '@type': 'EventVenue',
  name: 'Espaço Fazenda das Pedras — Eventos Corporativos',
  description: ${JSON.stringify(description)},
  image: '${HERO}',
  url: \`https://\${config.domain}/eventos-corporativos\`,
  telephone: '+5511963701306',
  maximumAttendeeCapacity: 600,
  address: {
    '@type': 'PostalAddress',
    streetAddress: 'Rod. Dom Gabriel Paulino Bueno Couto, s/n — km 98',
    addressLocality: 'Itu',
    addressRegion: 'SP',
    postalCode: '13304-350',
    addressCountry: 'BR',
  },
};
---

<Base
  title=${JSON.stringify(title)}
  description=${JSON.stringify(description)}
  ogImage="/images/og-eventos-corporativos.jpg"
  canonical={\`https://\${config.domain}/eventos-corporativos\`}
  theme="light"
  jsonLd={jsonLd}
  whatsAppShowEmpresaField={true}
  whatsAppMessage={'Olá! Quero planejar a confraternização da minha empresa na Fazenda das Pedras.'}
>
  <Fragment slot="head">
    <!-- LCP: o hero é background-image, então o browser só o descobre depois do CSS -->
    <link rel="preload" as="image" href="${HERO}" fetchpriority="high" />
    <link rel="preload" as="font" type="font/woff2" href="/fonts/Kalista-Serif-Regular.woff2" crossorigin />
    <link rel="preload" as="font" type="font/woff2" href="/fonts/Gotham-Book.woff2" crossorigin />
  </Fragment>

${body.split('\n').map((l) => (l.trim() ? '  ' + l : l)).join('\n')}
</Base>

<script>
  import { initForms } from '../scripts/forms';
  import flatpickr from 'flatpickr';
  import { Portuguese } from 'flatpickr/dist/l10n/pt.js';
  import 'flatpickr/dist/flatpickr.min.css';

  initForms();

  const dateEl = document.querySelector<HTMLInputElement>('[data-datepicker="true"]');
  if (dateEl) {
    flatpickr(dateEl, {
      locale: Portuguese,
      dateFormat: 'd/m/Y',
      minDate: 'today',
      allowInput: true,
      disableMobile: false,
    });
    // O fallback mobile do Flatpickr injeta tabindex="1", que quebra a ordem de foco
    document.querySelectorAll<HTMLInputElement>('.flatpickr-mobile').forEach((el) => { el.tabIndex = 0; });
  }

  // O menu mobile é um checkbox CSS-only: fecha ao navegar para a âncora.
  const toggle = document.getElementById('alterna-menu') as HTMLInputElement | null;
  document.querySelectorAll('.cabecalho__nav a').forEach((link) => {
    link.addEventListener('click', () => { if (toggle) toggle.checked = false; });
  });
</script>
`;

await mkdir('src/pages', { recursive: true });
await writeFile('src/pages/eventos-corporativos.astro', page);

console.log('✅ src/styles/eventos-corporativos.css');
console.log('✅ src/pages/eventos-corporativos.astro');
console.log(`   título: ${title}`);
