# dmove-astro-template

Template de landing page da Dmove (Astro 7, estático) — modelo para clonar a cada novo projeto de cliente.

---

## Inicio rapido

```bash
npm install
npm run dev      # http://localhost:4321
npm run build
```

Preencha o `config.json` (dominio, GTM, webhook, WhatsApp, preset do formulario) antes de comecar.

---

## Como publicar

**Push na main salva no GitHub mas NAO publica o site.**

Para colocar no ar, crie uma **Release** no GitHub (ou pelo terminal):

```bash
git tag v1.0.1
git push origin v1.0.1
gh release create v1.0.1 --title "v1.0.1" --notes "descricao do que mudou"
```

O GitHub Actions builda e envia automaticamente para a VPS. Acompanhe na aba **Actions** do repositorio.

---

## O que esse template tem alem do Astro padrao

### config.json — configuracao central

Tudo que muda de cliente para cliente vive aqui: nome, GTM ID, WhatsApp, webhook dos leads, preset do formulario (social ou corporativo), dominio de deploy. Nenhum outro arquivo precisa ser editado para configurar um projeto novo.

### Captacao de leads (formulario + WhatsApp)

O template tem dois caminhos de captacao que enviam para o mesmo webhook:

- **Formulario** — campos padronizados por preset. O preset `social` tem: nome, telefone, email, tipo de evento, data, convidados. O `corporativo` adiciona "empresa" como primeiro campo. Validacao com mascara de telefone, honeypot anti-spam, e estado de loading no botao.

- **WhatsApp conversacional** — widget flutuante que simula um chat. Faz as perguntas uma a uma (nome, telefone, email, tipo de evento, data, convidados) e so abre o WhatsApp depois de coletar tudo. O lead vai pro webhook antes de abrir a conversa.

### Tracking completo

O template produz todos os sinais que o container GTM da Dmove consome:

- **UTMs e click IDs** — capturados da URL e gravados em cookies 1st-party (90 dias). Sobrevivem a fechar a aba e voltar depois.
- **Meta CAPI** — `fbc`, `fbp`, `external_id` (UUID 365d), `event_id` (UUID por pageview para dedup Pixel x CAPI).
- **Google Ads** — `gclid`, `gbraid`, `wbraid` enviados no payload para atribuicao offline (OCI).
- **IP do visitante** — capturado via Cloudflare trace (ou ipify como fallback) e enviado no payload.
- **Enhanced Conversions** — o GTM le email/telefone/nome do DOM pelos IDs `#form-field-*`. Por isso cada campo do form precisa ter `id="form-field-<nome>"`.
- **Eventos GTM** — `form_start`, `form_submit`, `form_error` (form e WhatsApp).

### Componentes de UI

- **Img** — wrapper do Image do Astro. Converte para WebP/AVIF no build. Use `priority` na imagem do hero (LCP).
- **Video** — player de video self-hosted (.mp4). Lazy-load. Gera JSON-LD VideoObject para o Google automaticamente.
- **StaticMap** — Google Maps com overlay que bloqueia cliques (evita ponto de fuga da LP).

### Layout Base

Toda pagina usa o `Base.astro` que monta o `<head>` completo: SEO, Open Graph, canonical, JSON-LD, GTM, UTM capture, WhatsApp widget, fontes. Aceita props: `title`, `description`, `ogImage`, `theme` (dark/light), `hideWhatsApp`, `jsonLd`.

### Home de triagem

Quando o cliente tem mais de um funil (ex: casamentos + corporativo + debutantes), a raiz `/` vira uma home leve que pergunta o tipo de evento e direciona para a LP certa. Documentacao em `docs/home-triagem.md`.

### Deploy automatico (GitHub Actions)

O arquivo `.github/workflows/deploy.yml` dispara quando voce cria uma Release. Ele builda o projeto e envia o `dist/` para a VPS via rsync. Os secrets (`VPS_HOST`, `VPS_USER`, `VPS_SSH_KEY`) estao configurados na org Dmove-Marketing — nenhum repo individual precisa de configuracao.

O `deploy.mjs` ainda existe como fallback para deploy manual (`npm run deploy`).

---

## Estrutura do projeto

```
config.json                  <- configuracao do cliente (GTM, WhatsApp, webhook, deploy)
src/
  layouts/Base.astro         <- layout obrigatorio (SEO, GTM, WhatsApp, fontes)
  pages/                     <- paginas do site (.astro)
  components/
    ui/
      WhatsAppWidget.astro   <- widget conversacional (perguntas uma a uma)
      Img.astro              <- imagem otimizada (WebP/AVIF)
      Video.astro            <- video self-hosted + JSON-LD
      StaticMap.astro         <- mapa sem ponto de fuga
    tracking/
      GTMHead.astro          <- snippet GTM no <head>
      GTMBody.astro          <- <noscript> GTM no <body>
      UTMCapture.astro       <- captura UTMs + click IDs + external_id
      InteractionTrigger.astro <- eventos de interacao para GTM
  scripts/
    forms.ts                 <- motor de envio (validacao, IP, tracking, webhook)
    form-presets.ts           <- campos por funil (social / corporativo)
    lead-payload.ts           <- mapa de campos para o n8n + opcoes de tipo_evento
    smooth-scroll.ts          <- scroll suave (Lenis)
  styles/
    global.css               <- design system base (CSS vars)
  assets/images/             <- imagens processadas no build
public/
  fonts/                     <- fontes self-hosted (.woff2/.ttf)
  images/                    <- favicon, OG image, avatar WhatsApp
tools/
  extract-preview.mjs        <- separa base64 do HTML do Claude Design
  shot.mjs                   <- screenshots de QA (Playwright)
scripts/
  compare.mjs                <- VRT (visual regression test, 3 viewports)
  run-lighthouse.mjs          <- auditoria de performance
docs/
  design-brief.md            <- brief para o time de criacao (Claude Design)
  home-triagem.md            <- padrao de home com 2+ funis
  performance.md             <- playbook de performance (LCP, fontes, cache)
  tracking-gtm.md            <- contrato entre o site e o container GTM
```

---

## Documentacao

| Documento | Para quem |
|-----------|-----------|
| [CLAUDE.md](./CLAUDE.md) | Para a IA — playbook completo de implementacao (7 fases) |
| [docs/design-brief.md](./docs/design-brief.md) | Para o time de criacao — o que entregar no Claude Design |
| [docs/home-triagem.md](./docs/home-triagem.md) | Para quem monta a home de clientes com 2+ funis |
| [docs/performance.md](./docs/performance.md) | Para otimizar LCP, fontes, imagens, cache |
| [docs/tracking-gtm.md](./docs/tracking-gtm.md) | Para entender o contrato site x GTM |

---

## Rota `/eventos-corporativos` (funil F1 — corporativo)

LP do funil corporativo, construída a partir do HTML entregue pelo time de criação em
`../eventos-corporativos/docs para desenvolvimento/ENTREGA/`.

**Os dois arquivos da página são gerados — não edite à mão:**

| Gerado | Fonte |
|---|---|
| `src/pages/eventos-corporativos.astro` | `ENTREGA/fazenda-das-pedras-eventos-corporativos.html` |
| `src/styles/eventos-corporativos.css` | o `<style>` do mesmo HTML |

Design revisado? Substitua o HTML na pasta de entrega e rode:

```bash
node tools/build-eventos-corporativos.mjs     # regenera página + CSS
node tools/optimize-eventos-corporativos.mjs  # imagens → WebP em _work/otimizadas (subir pro CDN)
node tools/qa-eventos-corporativos.mjs        # QA: fontes, tracking, formulário, menu, screenshots
node tools/vrt-eventos-corporativos.mjs       # VRT: design × Astro nos 3 viewports
node tools/audit-responsivo.mjs               # overflow, alvos de toque, texto miúdo, imagem grande demais
node tools/audit-fontes.mjs                   # tipografia elemento a elemento contra o design
node tools/medir-peso.mjs                     # bytes transferidos por dispositivo
node tools/qa-interacoes.mjs                  # carrosséis, palco de ambientes, hero mobile
```

O QA e o VRT esperam o preview rodando (`npx astro preview --port 4331`).

**O que o build faz além de copiar o design:**

- fontes da marca (`.otf`/`.ttf`) → `.woff2` self-hospedado em `public/fonts/`
- fotos → WebP em várias larguras no CDN `media.dmove.com.br/clients/fazenda-das-pedras/photos/`,
  com `srcset` + `sizes` calculados por foto (ver abaixo) e `loading="lazy"` em tudo que não é o topo
- formulário do design trocado pelo motor padrão (`form-presets.ts` + `forms.ts`), preset `corporativo`
- neutraliza o vazamento de tipografia do `global.css` (`line-height` do body/`p`/`h1..h6`), sem o que
  a página inteira desalinha ~6 px por seção em relação ao design
- corrige no design: `aria-label` proibido em `<label>` e o seletor do hamburger que nunca virava "X"

**Pendência:** `config.json > tracking.gtm_id` ainda está em `GTM-XXXXXXX`. O site inteiro
(não só esta rota) está no ar sem medição até o ID real do container entrar aí.


### Responsividade — como o `sizes` é calculado

Quase toda foto da página é `object-fit: cover` numa caixa de proporção diferente da
imagem. Nesse caso a largura **renderizada** é maior que a caixa: a imagem é ampliada
até cobrir e o excedente é cortado. O `sizes` precisa descrever a largura renderizada,
não a da caixa — senão o navegador baixa uma variante pequena demais e a foto sai borrada.

Por isso `PAPEIS_IMG` guarda a **geometria medida da caixa** por breakpoint
(`[viewport, larguraCaixa, alturaCaixa]`, de `tools/audit-responsivo.mjs`) e o build
calcula, para cada foto, `max(larguraCaixa, alturaCaixa × proporção)`. Retrato e paisagem
na mesma seção recebem `sizes` diferentes: na seção de ambientes o card retrato pede
290px e o `salaoprincipal`, paisagem, pede 543px.

Os fundos em CSS (hero, depoimento, contato) não têm `srcset`: trocam de variante por
media query, geradas no fim do CSS.

**Custo conhecido:** os carrosséis do design são CSS puro, então os 8 slides de hospedagem
e os 10 do marquee de infraestrutura existem no DOM e carregam junto. No tablet isso
responde por boa parte dos ~2,3 MB. Reduzir exigiria trocar a interação por JS.


### Componentes reconstruídos (fora do design original)

O HTML de criação trouxe os carrosséis como **animação CSS infinita com setas em
`href="#id"`**. Não dava para arrastar com o dedo e cada seta navegava por hash, o
que rolava a **página** na vertical em vez de mover as fotos. Os três foram
reconstruídos em `src/scripts/eventos-corporativos-ui.ts`:

- **Carrossel** (`[data-carrossel]`) — rolagem nativa com `scroll-snap`, setas que
  chamam `scrollTo` no trilho (nunca hash), indicadores (bolinhas até 6 fotos,
  contador + barra acima disso), teclado, arrasto com mouse e avanço automático que
  pausa ao primeiro toque e só roda enquanto o carrossel está na tela.
- **Palco de ambientes** (`[data-ambientes]`) — a grade de 4 colunas não deixava
  entender ambiente nenhum. Agora cada um ocupa a tela e troca conforme a rolagem,
  com marcos invisíveis dando o compasso via IntersectionObserver. Só mudam opacidade
  e escala, então a troca roda no compositor.

Ambos são melhoria progressiva: **sem JS** o carrossel continua sendo uma faixa
rolável e o palco vira uma lista de fotos grandes. `prefers-reduced-motion` desliga
o palco e o avanço automático. Nenhum listener de `scroll` — só IntersectionObserver.

**Hero no celular:** o design ampliava o fundo em 420%, o que mostrava um recorte
pequeno demais do espaço. Abaixo de 900px a foto virou um `<img>` de largura total
com a proporção original preservada, e o texto desceu para o verde da marca.

Três detalhes que essa troca exigiu, cada um medido:
- A seção segue com `min-height: 100svh`. Sem isso o hero encurta, a foto da seção
  seguinte espia na primeira dobra e **ela** vira o elemento de LCP.
- O `srcset` para no **800px**: a faixa tem ~275px de altura, e 800 já dá 1,9× de
  densidade num celular de 412px. 1280 custava 1,7s a mais no Lighthouse.
- As três variantes móveis ficam **self-hospedadas** em `public/images/hero/`
  (geradas pelo otimizador). Servir o elemento de LCP do próprio domínio dispensa
  o aperto de mão com o CDN: 0,5s a menos.

⚠️ **Sobre a nota do Lighthouse:** antes desta mudança o elemento de LCP era o
`<h1>` — texto, que pinta assim que o CSS chega. Agora é a foto do espaço, que
precisa de bytes. A nota de performance caiu de 92 para 87 e o LCP de 3,0s para
3,6s por causa disso, não por a página ter ficado mais lenta: o peso total caiu de
1,49 MB para 1,19 MB e o CLS melhorou. É o preço de mostrar a foto no topo.
