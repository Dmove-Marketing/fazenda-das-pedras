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
// O hero do celular é o elemento de LCP: servido do próprio domínio ele dispensa
// o aperto de mão com o CDN e aproveita a conexão já aberta do documento (-0,5s).
const urlHeroLocal = (w) => `/images/hero/fazendadaspedras-corporativo-hero-${w}.webp`;
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
  // O palco mostra um ambiente por vez, quase em tela cheia — a caixa é outra.
  { nome: 'ambiente',  casa: (l, n) => /(jatoba|redario|espacorustico|salaoprincipal)/.test(n),
    larguras: [320, 480, 560, 800, 1100, 1400], caixas: [[1440, 720, 620], [1024, 620, 560], [768, 560, 520], [390, 340, 480]] },
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
  // Abaixo de 900px o hero não usa fundo em CSS: a foto é um <img> inteiro.
  { seletor: '.hero',       base: 'fazendadaspedras-corporativo-hero',       menor: 1280, camadas: [[900, 1600], [1400, 2000]] },
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

// O texto do depoimento é serifado e claro sobre foto: com o véu original
// (.82/.88) a leitura sofria. Escurece só o do depoimento, antes de gerar as camadas.
css = css.replace(
  /(\.depoimento\s*\{[^}]*?background-image:\s*linear-gradient\(180deg,\s*)rgba\(58,62,31,\.82\)(\s*0%,\s*)rgba\(42,45,23,\.88\)/s,
  '$1rgba(40,43,20,.90)$2rgba(28,31,14,.94)'
);

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

/* ============================================================
   Cabeçalho legível sobre foto clara
   ------------------------------------------------------------
   O véu do design (.55 → .28) some quando a foto atrás é clara — no hero
   do celular e no palco de ambientes o logo e o menu ficavam lavados.
   ============================================================ */
.cabecalho {
  background: linear-gradient(180deg, rgba(34, 37, 17, .74) 0%, rgba(34, 37, 17, .34) 70%, rgba(34, 37, 17, 0) 100%);
}

/* ============================================================
   Hero no celular: a foto inteira, não um recorte
   ------------------------------------------------------------
   O design amplia o fundo em 420% no mobile, o que mostra um pedaço
   pequeno demais do espaço. Abaixo de 900px a foto vira um <img> de
   largura total (proporção original preservada) e o texto desce para
   o verde da marca. De 900px para cima nada muda.
   ============================================================ */
.hero__foto { display: none; }

@media (max-width: 899px) {
  .hero {
    background-image: none;
    background-color: var(--cor-primaria-escura);
    /* Segue ocupando a tela inteira: se o hero encurta, a foto da seção
       seguinte espia na primeira dobra e vira o elemento de LCP — foi o que
       derrubou 1,3s da medição quando a foto virou <img>. */
    min-height: 100svh;
    display: flex;
    flex-direction: column;
    justify-content: flex-start;
    padding: 0 0 28px;
  }
  .hero__foto {
    display: block;
    width: 100%;
    height: auto;
    margin: 0;
    flex: 0 0 auto;
  }
  .hero__conteudo {
    flex: 1 1 auto;
    display: flex;
    align-items: center;
    padding-top: 24px;
    min-width: 0;
  }
  /* sem isto a caixa não encolhe abaixo do min-content ("confraternização")
     e vaza 27px numa tela de 320px */
  .hero__caixa { min-width: 0; width: 100%; }
}

/* ============================================================
   Depoimento: o peso 300 sobre foto escura ficava ilegível
   ============================================================ */
.depoimento__texto {
  font-weight: 400;
  text-shadow: 0 1px 12px rgba(26, 28, 14, .45);
}

/* ============================================================
   Carrossel — rolagem nativa, arrastável com o dedo
   ------------------------------------------------------------
   Substitui a animação infinita com setas em href="#id" do design, que
   não permitia arrastar e fazia a PÁGINA pular na vertical a cada seta.
   Sem JS continua sendo uma faixa rolável: as setas e os indicadores só
   aparecem quando o script assume (.carrossel--pronto).
   ============================================================ */
.carrossel { position: relative; }

.carrossel__trilho {
  display: flex;
  gap: 14px;
  overflow-x: auto;
  overscroll-behavior-x: contain;
  scroll-snap-type: x mandatory;
  scroll-padding-inline: var(--gutter);
  scrollbar-width: none;
  -webkit-overflow-scrolling: touch;
  padding-block: 2px;
}
.carrossel__trilho::-webkit-scrollbar { display: none; }
.carrossel__trilho:focus-visible { outline: 2px solid var(--cor-destaque-escura); outline-offset: 4px; border-radius: var(--radius); }
.carrossel__trilho.esta-arrastando { cursor: grabbing; scroll-snap-type: none; }
.carrossel__trilho.esta-arrastando * { pointer-events: none; }

.carrossel__item {
  flex: 0 0 auto;
  scroll-snap-align: start;
  border-radius: var(--radius);
  overflow: hidden;
  position: relative;
}
.carrossel__item img { width: 100%; height: 100%; object-fit: cover; display: block; }
.carrossel__item > a { display: block; width: 100%; height: 100%; }

/* faixa horizontal (infraestrutura e galeria no mobile) */
.carrossel--faixa .carrossel__item { width: min(76vw, 320px); aspect-ratio: 4 / 5; }
@media (min-width: 700px) {
  .carrossel--faixa .carrossel__item { width: 320px; aspect-ratio: 4 / 5; }
}

/* um por vez, em retrato (chalés) */
.carrossel--retrato { width: 100%; }
.carrossel--retrato .carrossel__trilho { gap: 0; }
.carrossel--retrato .carrossel__item { width: 100%; height: 100%; aspect-ratio: inherit; border-radius: inherit; }

.carrossel__seta {
  position: absolute;
  top: calc(50% - 22px);
  width: 44px; height: 44px;
  border: 0; padding: 0;
  border-radius: 50%;
  background: rgba(250, 248, 240, .92);
  color: var(--cor-primaria);
  font-family: var(--fonte-titulo);
  font-size: 22px; line-height: 1;
  display: none;
  align-items: center; justify-content: center;
  cursor: pointer;
  z-index: 3;
  box-shadow: 0 2px 14px rgba(26, 28, 14, .22);
  transition: background .2s ease, transform .2s ease;
}
.carrossel--pronto .carrossel__seta { display: flex; }
.carrossel__seta:hover { background: var(--cor-fundo); transform: scale(1.07); }
.carrossel__seta:active { transform: scale(.96); }
.carrossel__seta--prev { left: 8px; }
.carrossel__seta--next { right: 8px; }
@media (min-width: 700px) {
  .carrossel__seta--prev { left: 12px; }
  .carrossel__seta--next { right: 12px; }
}

.carrossel__pontos {
  display: none;
  align-items: center; justify-content: center;
  gap: 2px;
  margin-top: 14px;
}
.carrossel--pronto .carrossel__pontos { display: flex; }
.carrossel__ponto {
  width: 40px; height: 40px;
  border: 0; padding: 0; background: none;
  position: relative; cursor: pointer;
}
.carrossel__ponto::before {
  content: '';
  position: absolute;
  top: 18px; left: 16px;
  width: 8px; height: 4px;
  border-radius: 4px;
  background: rgba(74, 79, 39, .26);
  transition: width .28s ease, left .28s ease, background .28s ease;
}
.carrossel__ponto.is-ativo::before { width: 24px; left: 8px; background: var(--cor-destaque-escura); }
.hospedagem-verde .carrossel__ponto::before { background: rgba(245, 238, 220, .32); }
.hospedagem-verde .carrossel__ponto.is-ativo::before { background: var(--cor-destaque-clara); }

/* muitos itens: contador + barra, que lê melhor que 9 bolinhas */
.carrossel__medidor { display: none; align-items: center; gap: 12px; justify-content: center; margin-top: 14px; }
.carrossel--pronto .carrossel__medidor { display: flex; }
.carrossel__contagem { font-size: 12px; letter-spacing: .14em; color: var(--cor-label); font-variant-numeric: tabular-nums; }
.carrossel__barra { width: min(180px, 42vw); height: 3px; border-radius: 3px; background: rgba(74, 79, 39, .18); overflow: hidden; }
.carrossel__barra span { display: block; height: 100%; border-radius: 3px; background: var(--cor-destaque-escura); transform-origin: left center; transition: transform .35s cubic-bezier(.4, 0, .2, 1); }
.hospedagem-verde .carrossel__contagem { color: var(--cor-destaque-clara); }
.hospedagem-verde .carrossel__barra { background: rgba(245, 238, 220, .22); }
.hospedagem-verde .carrossel__barra span { background: var(--cor-destaque-clara); }

/* ============================================================
   Palco de ambientes — um ambiente por vez, trocando com a rolagem
   ------------------------------------------------------------
   Em grade de 4 colunas não dava para entender ambiente nenhum. Aqui cada
   um ocupa a tela; marcos invisíveis dão o compasso e as cenas só mudam
   de opacidade e escala, então a troca roda no compositor.
   Sem JS (ou com "reduzir movimento") vira uma lista de fotos grandes.
   ============================================================ */
.palco__fixo { display: grid; gap: 18px; }
.palco__quadro { display: grid; gap: 18px; }
.palco__cena { position: relative; margin: 0; border-radius: var(--radius); overflow: hidden; }
.palco__cena img { width: 100%; height: 100%; object-fit: cover; display: block; }
/* cena ainda não acordada: sem src, não deve desenhar ícone de imagem quebrada */
.palco__foto[data-src] { display: none; }
.palco__trilha, .palco__dica, .palco__barra { display: none; }
.palco__indice { display: none; }

.palco__legenda {
  position: absolute; left: 0; right: 0; bottom: 0;
  padding: 54px 20px 18px;
  display: flex; align-items: baseline; gap: 12px;
  background: linear-gradient(180deg, transparent 0%, rgba(42, 45, 23, .86) 100%);
  color: var(--cor-texto-claro);
  text-align: left;
}
.palco__numero { font-family: var(--fonte-titulo); font-size: 13px; letter-spacing: .18em; color: var(--cor-destaque-clara); }
.palco__nome { font-family: var(--fonte-titulo); font-size: 26px; line-height: 1.1; }
@media (min-width: 900px) { .palco__nome { font-size: 32px; } }

/* —— com JS —— */
/* 280svh = a tela fixa (100) + 180 de rolagem divididos entre os 4 ambientes,
   ~45svh cada. Mais que isso vira arrastado e empurra o formulário para longe. */
.palco--pronto { position: relative; height: 280svh; }
.palco--pronto .palco__fixo {
  position: sticky; top: 0;
  height: 100svh;
  display: flex; flex-direction: column;
  align-items: center; justify-content: center;
  gap: 16px;
}
.palco--pronto .palco__quadro {
  position: relative;
  display: block;
  width: min(92vw, 560px);
  height: 62svh;
  border-radius: var(--radius);
  overflow: hidden;
  box-shadow: 0 18px 60px rgba(42, 45, 23, .18);
  touch-action: pan-y;
}
@media (min-width: 900px) {
  .palco--pronto .palco__quadro { width: min(62vw, 760px); height: 70svh; }
}
.palco--pronto .palco__cena {
  position: absolute; inset: 0;
  border-radius: 0;
  opacity: 0;
  transform: scale(1.07);
  transition: opacity .65s cubic-bezier(.4, 0, .2, 1), transform 1.2s cubic-bezier(.4, 0, .2, 1);
  will-change: opacity, transform;
}
.palco--pronto .palco__cena.is-ativa { opacity: 1; transform: scale(1); }
.palco--pronto .palco__cena.is-passada { transform: scale(.96); }

.palco--pronto .palco__trilha { display: block; position: absolute; inset: 0; z-index: -1; }
.palco--pronto .palco__marco { height: 25%; }

.palco--pronto .palco__barra {
  display: block;
  width: min(280px, 60vw); height: 3px;
  border-radius: 3px;
  background: rgba(74, 79, 39, .16);
  overflow: hidden;
}
.palco--pronto .palco__barra span {
  display: block; height: 100%;
  background: var(--cor-destaque-escura);
  transform-origin: left center; transform: scaleX(.25);
  transition: transform .5s cubic-bezier(.4, 0, .2, 1);
}

.palco--pronto .palco__indice {
  display: flex; flex-wrap: wrap; gap: 6px; justify-content: center;
  max-width: min(92vw, 560px);   /* sem isto os 4 nomes ficam numa linha só e vazam */
}
@media (min-width: 900px) { .palco--pronto .palco__indice { max-width: min(62vw, 760px); } }
.palco__atalho {
  border: 0; cursor: pointer;
  background: none;
  font-family: var(--fonte-corpo);
  font-size: 12px; letter-spacing: .04em;
  color: var(--cor-texto);
  opacity: .5;
  padding: 10px 12px;
  min-height: 40px;
  border-radius: 999px;
  transition: opacity .25s ease, background .25s ease;
}
.palco__atalho.is-ativo { opacity: 1; background: var(--cor-fundo-creme); color: var(--cor-primaria); font-weight: 600; }

.palco--pronto .palco__dica {
  display: block;
  position: absolute; left: 0; right: 0; bottom: 74px;
  margin: 0;
  text-align: center;
  font-size: 12px; letter-spacing: .12em; text-transform: uppercase;
  color: var(--cor-texto-claro);
  opacity: .85;
  animation: palco-dica 2.4s ease-in-out infinite;
  pointer-events: none;
  transition: opacity .4s ease;
}
.palco--iniciado .palco__dica { opacity: 0; }
@keyframes palco-dica {
  0%, 100% { transform: translateY(0); }
  50% { transform: translateY(5px); }
}

/* lista simples quando o visitante pede menos movimento */
.palco--simples .palco__quadro { gap: 16px; }
@media (prefers-reduced-motion: reduce) {
  .palco--pronto .palco__cena { transition: none; }
  .palco__dica { animation: none; }
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

// ============================================================
// Reconstrução de componentes
// ------------------------------------------------------------
// O design entregou os carrosséis como animação CSS infinita com setas em
// `href="#id"`. Isso não permite arrastar com o dedo e, pior, cada seta
// navegava por hash — o que rolava a PÁGINA na vertical em vez de mover as
// fotos. Aqui os três viram carrossel nativo (scroll-snap + botões), e a
// grade de ambientes vira um palco que troca de ambiente conforme a rolagem.
// ============================================================

// Troca o bloco que começa em `abertura` (e fecha no </div> de mesma indentação).
const trocarBloco = (txt, abertura, montar) => {
  const i = txt.indexOf(abertura);
  if (i < 0) throw new Error(`Bloco não encontrado: ${abertura.trim()}`);
  const indent = abertura.match(/^[ ]*/)[0];
  const fecha = `\n${indent}</div>`;
  const j = txt.indexOf(fecha, i);
  if (j < 0) throw new Error(`Fechamento não encontrado: ${abertura.trim()}`);
  return txt.slice(0, i) + montar(txt.slice(i, j + fecha.length), indent) + txt.slice(j + fecha.length);
};

const imagensDe = (bloco, { soComAlt = true } = {}) =>
  (bloco.match(/<img[^>]*>/g) || []).filter((t) => (soComAlt ? !/alt=""/.test(t) : true));

const carrossel = (indent, { id, rotulo, classe = '', autoplay = 0, itens }) => {
  const i2 = indent + '  ';
  const i3 = indent + '    ';
  return [
    `${indent}<div class="carrossel ${classe}" data-carrossel="${id}"${autoplay ? ` data-autoplay="${autoplay}"` : ''}>`,
    `${i2}<div class="carrossel__trilho" role="group" aria-roledescription="carrossel" aria-label="${rotulo}">`,
    ...itens.map((c) => `${i3}<div class="carrossel__item">${c}</div>`),
    `${i2}</div>`,
    `${i2}<button class="carrossel__seta carrossel__seta--prev" type="button" aria-label="Foto anterior"><span aria-hidden="true">‹</span></button>`,
    `${i2}<button class="carrossel__seta carrossel__seta--next" type="button" aria-label="Próxima foto"><span aria-hidden="true">›</span></button>`,
    `${i2}<div class="carrossel__pontos" role="group" aria-label="Escolher foto"></div>`,
    `${indent}</div>`,
  ].join('\n');
};

// —— Ambientes: palco com troca por rolagem ——
body = trocarBloco(body, '      <div class="ambientes__grade">', (bloco, indent) => {
  const imgs = imagensDe(bloco);
  const nomes = [...bloco.matchAll(/<span class="ambiente-card__rotulo">([^<]+)<\/span>/g)].map((m) => m[1]);
  if (imgs.length !== 4 || nomes.length !== 4) throw new Error('Ambientes: esperava 4 cards');

  const i2 = indent + '  ', i3 = indent + '    ', i4 = indent + '      ', i5 = indent + '        ';
  return [
    `${indent}<div class="palco" data-ambientes>`,
    `${i2}<div class="palco__fixo">`,
    `${i3}<div class="palco__quadro">`,
    // Só o primeiro ambiente carrega junto com a página. Os outros três pesam
    // ~550KB e ficam invisíveis até o visitante rolar — vão de data-src e são
    // acordados pelo palco (o atual e o próximo). <noscript> cobre quem não tem JS.
    ...imgs.flatMap((img, n) => [
      `${i4}<figure class="palco__cena${n === 0 ? ' is-ativa' : ''}" aria-hidden="${n === 0 ? 'false' : 'true'}">`,
      n === 0
        ? `${i5}${img.replace('<img ', '<img class="palco__foto" ')}`
        : `${i5}${img.replace('<img ', '<img class="palco__foto" ').replace(/\bsrc=/, 'data-src=').replace(/\bsrcset=/, 'data-srcset=').replace(/\bsizes=/, 'data-sizes=')}\n${i5}<noscript>${img}</noscript>`,
      `${i5}<figcaption class="palco__legenda">`,
      `${i5}  <span class="palco__numero">${String(n + 1).padStart(2, '0')}</span>`,
      `${i5}  <span class="palco__nome">${nomes[n]}</span>`,
      `${i5}</figcaption>`,
      `${i4}</figure>`,
    ]),
    `${i4}<p class="palco__dica"><span aria-hidden="true">↓</span> role para conhecer os ambientes</p>`,
    `${i3}</div>`,
    `${i3}<div class="palco__barra" aria-hidden="true"><span></span></div>`,
    `${i3}<nav class="palco__indice" aria-label="Ambientes">`,
    ...nomes.map((nome, n) => `${i4}<button type="button" class="palco__atalho${n === 0 ? ' is-ativo' : ''}">${nome}</button>`),
    `${i3}</nav>`,
    `${i2}</div>`,
    `${i2}<div class="palco__trilha" aria-hidden="true">`,
    ...nomes.map(() => `${i3}<div class="palco__marco"></div>`),
    `${i2}</div>`,
    `${indent}</div>`,
  ].join('\n');
});

// —— Infraestrutura ——
body = trocarBloco(body, '      <div class="infra__galeria marquee">', (bloco, indent) =>
  carrossel(indent, {
    id: 'infra', rotulo: 'Fotos da infraestrutura', classe: 'carrossel--faixa infra__galeria',
    autoplay: 6500, itens: imagensDe(bloco),
  })
);

// —— Hospedagem (cada slide abre o lightbox, então o item inteiro vai junto) ——
body = trocarBloco(body, '        <div class="sobre__foto hospedagem-carrossel">', (bloco, indent) => {
  const slides = bloco.match(/<a href="#lb-hosp-\d+"[\s\S]*?<\/a>/g) || [];
  if (slides.length !== 8) throw new Error(`Hospedagem: esperava 8 slides, achei ${slides.length}`);
  return carrossel(indent, {
    id: 'hospedagem', rotulo: 'Fotos dos chalés', classe: 'carrossel--retrato sobre__foto',
    autoplay: 5500, itens: slides,
  });
});

// —— Galeria (faixa do mobile) ——
body = trocarBloco(body, '      <div class="galeria__marquee marquee">', (bloco, indent) =>
  carrossel(indent, {
    id: 'galeria', rotulo: 'Galeria de fotos', classe: 'carrossel--faixa galeria__marquee',
    autoplay: 5000, itens: imagensDe(bloco),
  })
);

// —— Hero: no celular a foto vira elemento real, inteira, acima do texto ——
{
  const base = 'fazendadaspedras-corporativo-hero';
  const item = MANIFESTO[base];
  // A foto ocupa a largura da tela mas só ~275px de altura. 800px dá ~1,9× de
  // densidade num celular de 412px — indistinguível de 2,6× a olho nu — e é
  // metade dos bytes do elemento de LCP.
  const larguras = [480, 640, 800].filter((w) => item.variantes.some((v) => v.w === w));
  const maior = larguras[larguras.length - 1];
  const dims = item.variantes.find((v) => v.w === maior);
  // decoding="sync": num elemento de LCP o "async" autoriza o browser a pintar o
  // resto antes de decodificar a foto — o download terminava em 1,6s e a pintura
  // só saía aos 3,9s.
  const img = `<img class="hero__foto" src="${urlHeroLocal(maior)}" srcset="${larguras.map((w) => `${urlHeroLocal(w)} ${w}w`).join(', ')}" sizes="100vw" width="${dims.w}" height="${dims.h}" alt="Confraternização de empresa ao ar livre na Fazenda das Pedras, em Itu" fetchpriority="high" decoding="sync">`;
  const alvo = '    <div class="container hero__conteudo">'.slice(2);
  if (!body.includes(alvo)) throw new Error('Hero: não achei o container do conteúdo');
  body = body.replace(alvo, `    ${img}\n${alvo}`);
}

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
    <!-- LCP: no desktop o hero é background-image (o browser só descobre depois do CSS);
         no celular é <img>, então o preload acompanha o mesmo srcset. -->
    <link rel="preload" as="image" href="${url('fazendadaspedras-corporativo-hero', 1600)}" media="(min-width: 900px)" fetchpriority="high" />
    <link
      rel="preload"
      as="image"
      href="${urlHeroLocal(800)}"
      imagesrcset="${[480, 640, 800].map((w) => `${urlHeroLocal(w)} ${w}w`).join(', ')}"
      imagesizes="100vw"
      media="(max-width: 899px)"
      fetchpriority="high"
    />
    <link rel="preload" as="font" type="font/woff2" href="/fonts/Kalista-Serif-Regular.woff2" crossorigin />
    <link rel="preload" as="font" type="font/woff2" href="/fonts/Gotham-Book.woff2" crossorigin />
  </Fragment>

${body.split('\n').map((l) => (l.trim() ? '  ' + l : l)).join('\n')}
</Base>

<script>
  import { initForms } from '../scripts/forms';
  import { initCarrosseis, initAmbientes } from '../scripts/eventos-corporativos-ui';
  import flatpickr from 'flatpickr';
  import { Portuguese } from 'flatpickr/dist/l10n/pt.js';
  import 'flatpickr/dist/flatpickr.min.css';

  initForms();
  initCarrosseis();
  initAmbientes();

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
