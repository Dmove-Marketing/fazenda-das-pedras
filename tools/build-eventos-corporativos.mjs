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
const MANIFESTO = JSON.parse(await readFile('tools/imagens.manifest.json', 'utf8'));
const url = (base, w) => `${CDN}/${base}-${w}.webp`;
const HERO_PRELOAD = url('fazendadaspedras-corporativo-hero', 1280);

// ------------------------------------------------------------
// Papel de cada <img> na página → larguras do srcset e o sizes.
//
// ATENÇÃO ao `sizes`: quase toda foto aqui é `object-fit: cover` numa caixa de
// proporção diferente da imagem. Nesse caso a largura RENDERIZADA é maior que a
// caixa (a imagem é ampliada até cobrir e sobra cortada). O `sizes` descreve a
// largura renderizada, não a da caixa — senão o navegador escolhe uma variante
// pequena demais e a foto sai borrada. Os valores abaixo saem da medição real
// max(larguraCaixa, alturaCaixa × proporção) no pior caso de proporção da seção.
// A ordem importa: a primeira regra que casar vence.
// ------------------------------------------------------------
const PAPEIS_IMG = [
  // `caixas`: [larguraDoViewport, larguraDaCaixa, alturaDaCaixa] medidos com
  // tools/audit-responsivo.mjs. A largura que a foto precisa sai de
  // max(larguraCaixa, alturaCaixa × proporçãoDaFoto) — é quanto o `object-fit:
  // cover` amplia a imagem para cobrir a caixa. Retrato e paisagem na mesma
  // seção pedem larguras diferentes, por isso o cálculo é por foto.
  { nome: 'lightbox',  casa: (l) => /class="lightbox__img"/.test(l),
    larguras: [800, 1400], sizesFixo: '100vw' },
  { nome: 'mosaico',   casa: (l) => /galeria__mosaico__item/.test(l),
    larguras: [320, 480, 640, 800], caixas: [[1440, 371, 371], [1024, 319, 319], [768, 233, 233]] },
  { nome: 'gal-marquee', casa: (l) => /galeria__marquee__item/.test(l),
    larguras: [320, 480], caixas: [[390, 300, 225]] },
  { nome: 'infra-marquee', casa: (l) => /galeria-scroll__item/.test(l),
    larguras: [320, 480, 560, 700], caixas: [[1440, 320, 400], [1024, 320, 400], [768, 320, 400], [390, 281, 351]] },
  { nome: 'gastronomia', casa: (l) => /gastronomia__foto/.test(l),
    larguras: [320, 480, 640, 900], caixas: [[1440, 276, 368], [1024, 237, 316], [768, 173, 231], [390, 300, 225]] },
  { nome: 'hospedagem', casa: (l, n) => /hospedagem-/.test(n),
    larguras: [360, 560, 800, 1080], caixas: [[1440, 459, 612], [1024, 393, 524], [768, 728, 546], [390, 350, 263]] },
  { nome: 'ambiente',  casa: (l, n) => /(jatoba|redario|espacorustico|salaoprincipal)/.test(n),
    larguras: [320, 480, 560, 800], caixas: [[1440, 272, 362], [1024, 233, 310], [768, 355, 266], [390, 170, 128]] },
  { nome: 'sobre',     casa: (l, n) => /sobre/.test(n),
    larguras: [480, 700, 1000, 1200, 1600], caixas: [[1440, 540, 405], [1024, 462, 347], [768, 728, 546], [390, 350, 263]] },
];

// Monta o `sizes` desta foto: a largura exigida em cada faixa, em vw (fluido)
// ou px (a partir de 1100px o layout é fixo).
const montarSizes = (papel, proporcao) => {
  if (papel.sizesFixo) return papel.sizesFixo;
  const precisa = (cx, cy) => Math.ceil(Math.max(cx, cy * proporcao));
  const faixas = papel.caixas.map(([vw, cx, cy]) => {
    const w = precisa(cx, cy);
    if (vw >= 1440) return { min: 1100, valor: `${w}px` };
    const min = vw >= 1024 ? 900 : vw >= 768 ? 700 : 0;
    return { min, valor: `${Math.ceil((w / vw) * 100)}vw` };
  }).sort((a, b) => b.min - a.min);
  return faixas.map((f, i) => (i === faixas.length - 1 && f.min === 0 ? f.valor : `(min-width: ${f.min}px) ${f.valor}`)).join(', ');
};

// Fundos em CSS: o browser não tem srcset, então troca-se a variante por media query.
const FUNDOS = [
  { seletor: '.hero',       base: 'fazendadaspedras-corporativo-hero',       menor: 1280, camadas: [[600, 1600], [1400, 2000]] },
  { seletor: '.depoimento', base: 'fazendadaspedras-corporativo-estrutura-2', menor: 640,  camadas: [[600, 960], [1000, 1280], [1600, 1920]] },
  { seletor: '.contato',    base: 'fazendadaspedras-corporativo-formulario',  menor: 640,  camadas: [[600, 960], [1000, 1280], [1600, 1920]] },
];

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

// imagens de background → CDN, já na menor variante (mobile-first)
css = css.replace(/url\('imagens\/([^']+)\.(jpe?g|png)'\)/gi, (_m, name) => {
  const fundo = FUNDOS.find((f) => f.base === name);
  if (!fundo) throw new Error(`Background sem regra de variante: ${name}`);
  return `url('${url(name, fundo.menor)}')`;
});

// Camadas por largura de viewport: cada fundo sobe de variante conforme a tela cresce.
const camadasFundo = FUNDOS.map((f) => {
  const decl = css.match(new RegExp(`\\${f.seletor}\\s*\\{[^}]*?background-image:\\s*([^;]+);`, 's'));
  if (!decl) throw new Error(`Não achei o background-image de ${f.seletor}`);
  return f.camadas
    .map(([minw, w]) => `@media (min-width: ${minw}px) {\n  ${f.seletor} { background-image: ${decl[1].trim().replace(`-${f.menor}.webp`, `-${w}.webp`)}; }\n}`)
    .join('\n');
}).join('\n');

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

/* ============================================================
   Responsividade e toque
   ============================================================ */

/* iPad paisagem (1024px): "1fr" não encolhe abaixo do min-content do título,
   e a coluna de 620px do formulário empurrava a página 51px pra fora. */
@media (min-width: 900px) {
  .contato__conteudo { grid-template-columns: minmax(0, 1fr) minmax(0, 620px); }
}
#form-grid { min-width: 0; }

/* Alvos de toque de no mínimo 44px onde o ponteiro é o dedo.
   No desktop o design fica como desenhado. */
@media (max-width: 899px) {
  .cabecalho__botao-menu {
    width: 44px; height: 44px;
    padding: 10px 6px;
    box-sizing: border-box;
    margin-right: -6px;
  }
  .botao {
    min-height: 44px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
  }
  .hero__acoes .botao, .botao--largo { min-height: 48px; }
  .marquee__seta { width: 44px; height: 44px; }
  .hospedagem-carrossel__seta { width: 44px; height: 44px; }
  .lightbox__fechar { min-width: 44px; min-height: 44px; display: flex; align-items: center; justify-content: center; }

  /* Campos do formulário: 35px de altura é pouco pro dedo, e fonte abaixo de
     16px faz o iOS dar zoom ao focar — a página pula na hora da conversão. */
  .campo input, .campo select, .campo textarea {
    min-height: 44px;
    font-size: 16px;
    padding: 10px 14px;
  }
  .campo textarea { min-height: 76px; }
}

/* Texto abaixo de 12px não se lê bem em tela nenhuma */
.autoridade__logo-slot { font-size: 12px; }

/* Desktop: o link do menu tem 17px de altura de texto. O padding aumenta a
   área clicável sem mover nada, porque a nav é mais baixa que o logo. */
@media (min-width: 900px) {
  .cabecalho__nav a:not(.botao) { padding-block: 12px; }
}

/* Celular deitado: a altura útil some. O menu vira lista rolável e o hero
   para de esticar além do que cabe. */
@media (max-width: 899px) and (orientation: landscape) {
  .cabecalho__nav {
    justify-content: flex-start;
    gap: 14px;
    padding: 70px 20px 24px;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }
  .cabecalho__nav a { font-size: 20px; }
  .hero { min-height: 480px; }
}

/* Telas muito estreitas (320px): o respiro lateral não pode comer o conteúdo */
@media (max-width: 359px) {
  :root { --gutter: 16px; }
  .hero__titulo { font-size: 32px; }
}

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
${CSS_EXTRA}

/* ---- Variantes de fundo por largura de viewport ---- */
${camadasFundo}
`
);

// ------------------------------------------------------------
// 2. Corpo da página
// ------------------------------------------------------------
let body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/)[1].trim();

// Logos são SVG: vão para public/, sem variante.
body = body.replace(/src="imagens\/(logo-[^"]+\.svg)"/g, (_m, f) => `src="/images/eventos-corporativos/${f}"`);

// ------------------------------------------------------------
// Cada <img> de foto vira srcset + sizes + width/height + lazy.
// O papel é decidido pela linha (classes do contêiner) e pelo nome do arquivo,
// porque é o contexto que define o tamanho exibido, não a imagem em si.
// ------------------------------------------------------------
const usoPorPapel = {};
body = body.split('\n').map((linha) => {
  if (!/<img[^>]+src="imagens\//.test(linha)) return linha;
  // a seção "autoridade" traz um <img> de exemplo dentro de comentário HTML
  if (/<!--/.test(linha) && linha.indexOf('<!--') < linha.indexOf('<img')) return linha;

  return linha.replace(/<img([^>]*?)src="imagens\/([^"]+)\.(jpe?g|png)"([^>]*)>/gi, (tag, antes, nome, _ext, depois) => {
    const item = MANIFESTO[nome];
    if (!item) throw new Error(`Foto fora do manifesto: ${nome} (rode tools/optimize-eventos-corporativos.mjs)`);

    const papel = PAPEIS_IMG.find((r) => r.casa(linha, nome));
    if (!papel) throw new Error(`<img> sem papel definido: ${nome} na linha: ${linha.trim().slice(0, 80)}`);
    usoPorPapel[papel.nome] = (usoPorPapel[papel.nome] || 0) + 1;

    // só as variantes que existem de fato para esta foto
    const disponiveis = item.variantes.map((v) => v.w);
    let escolhidas = papel.larguras.map((w) => Math.min(w, item.largura)).filter((w) => disponiveis.includes(w));
    if (!escolhidas.length) escolhidas = [disponiveis[disponiveis.length - 1]];
    escolhidas = [...new Set(escolhidas)].sort((a, b) => a - b);

    const maior = escolhidas[escolhidas.length - 1];
    const dims = item.variantes.find((v) => v.w === maior);
    const srcset = escolhidas.map((w) => `${url(nome, w)} ${w}w`).join(', ');

    const resto = `${antes}${depois}`.trim();
    const temLazy = /loading=/.test(resto);
    const atributos = [
      `src="${url(nome, maior)}"`,
      `srcset="${srcset}"`,
      `sizes="${montarSizes(papel, item.proporcao)}"`,
      `width="${dims.w}"`,
      `height="${dims.h}"`,
      temLazy ? '' : 'loading="lazy"',
      'decoding="async"',
    ].filter(Boolean).join(' ');

    return `<img ${resto ? resto + ' ' : ''}${atributos}>`;
  });
}).join('\n');

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
  image: '${HERO_PRELOAD}',
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
    <link rel="preload" as="image" href="${HERO_PRELOAD}" fetchpriority="high" />
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

  // As 21 fotos dos lightbox são lazy para não baixarem todas no load. Em troca,
  // precisam ser acordadas ao abrir — e já no toque/hover, para a foto estar
  // chegando quando o clique se completa.
  const acordarLightbox = (hash: string | null) => {
    if (!hash || !hash.startsWith('#lb-')) return;
    const img = document.querySelector<HTMLImageElement>(hash + ' img');
    if (!img || img.complete) return;
    img.loading = 'eager';
    img.setAttribute('fetchpriority', 'high');
    img.srcset = img.srcset;  // garante o disparo em navegadores que não reagem só ao loading
  };
  document.querySelectorAll<HTMLAnchorElement>('.lightbox-trigger').forEach((a) => {
    const alvo = () => acordarLightbox(a.getAttribute('href'));
    a.addEventListener('pointerenter', alvo, { once: true, passive: true });
    a.addEventListener('touchstart', alvo, { once: true, passive: true });
    a.addEventListener('click', alvo);
  });
  window.addEventListener('hashchange', () => acordarLightbox(location.hash));
  acordarLightbox(location.hash);

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
console.log(`   imagens por papel: ${Object.entries(usoPorPapel).map(([k, v]) => `${k}=${v}`).join(' · ')}`);
