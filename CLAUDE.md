# CLAUDE.md — dmove-astro-template

Você está num **clone limpo do template de landing page da Dmove**. Este arquivo é o playbook de implementação: leia-o inteiro antes de começar. Ele descreve como transformar o HTML do Claude Design em um site Astro no ar na VPS — e **quando parar e perguntar ao usuário**.

## Como um projeto começa

1. O usuário clona este repo para `Clientes/<Cliente>/Landing pages/<slug>`.
2. Você faz as **perguntas de onboarding** (Fase 0).
3. O usuário informa **onde está o HTML** recebido do time (Claude Design) e **qual pasta** usar.
4. Você executa as Fases 1–7, perguntando só o que depende do usuário.

## Princípios

1. **Shift-left:** o HTML já deve vir no padrão (`docs/design-brief.md`). Se não vier, normalize na conversão.
2. **Config-driven:** decisões de projeto vivem no `config.json`. Definições técnicas (campos, validação) vivem no código padronizado — nunca redigite por projeto.
3. **Valide com evidência:** screenshot e auditoria de computed style, não "achismo".

## Comandos

```bash
npm install
npm run dev        # http://localhost:4321
npm run build      # dist/ estático
npm run deploy     # build + scp de dist/ para config.deploy.*
```

---

## FASE 0 — Perguntas de onboarding (SEMPRE, no início)

Pergunte **tudo de uma vez**, mesmo sem DNS pronto (desenvolve-se local e ativa quando apontar):

1. **Domínio/subdomínio** (ex.: `eventos.cliente.com.br`)
2. **GTM ID** (`GTM-XXXXXXX`)
3. **Webhook n8n** dos leads (`https://server3n8n.dmove.com.br/webhook/<slug>`)
4. **WhatsApp** de destino dos leads
5. **Funil / preset** de cada página: `social` ou `corporativo`
6. **Slug(s)** da(s) página(s)
7. **Onde está o HTML** do Claude Design e a **pasta de destino** do projeto

---

> **Cliente com mais de um funil?** A raiz `/` vira uma **home de triagem** (roteia por tipo de evento). Ver `docs/home-triagem.md`. Use `<Base hideWhatsApp={true}>` na home.

## FASE 1 — Setup

- Preencha o `config.json`: `project_name`, `project_slug`, `domain`, `client`, `tracking.gtm_id`, `whatsapp.*`, `forms.lead-form.webhooks[0]`, `forms.lead-form.preset`, `deploy.remote_path` (`/var/www/<dominio>`).
- Ajuste `astro.config.mjs > site` para o domínio.

## FASE 2 — Assets (imagens, fontes, vídeo)

- Imagens/fontes/vídeo vêm numa pasta do Google Drive; a Dmove trata e sobe pro CDN.
- **CDN:** `/var/www/media-storage/clients/<slug>/{photos,fonts,videos}` → `https://media.dmove.com.br/clients/<slug>/...`. Imagens tratadas: `.webp` com sufixo `_resultado`.
- **Fontes:** vêm em `.ttf`; **self-host** a fonte crítica em `public/fonts/` (evita CORS). Converta p/ `.woff2` se houver ferramenta.
- SSH: `root@157.173.197.116`.

## FASE 3 — Conversão do HTML (greenfield)

Se o preview vier com base64 (comum), use `tools/`:

1. **`node tools/extract-preview.mjs <arquivo.html>`** — separa `<style>`/`<body>`, troca cada mídia base64 por placeholder `__IMAGE_n__`/`__VIDEO_n__`/`__FONT_n__` e gera manifesto em `_work/`. Reduz um HTML de dezenas de MB a ~KB legíveis.
2. **Mapeie cada placeholder → URL do CDN** pelo contexto/`alt` de cada imagem.
3. Escreva um `tools/build-page.mjs` **por projeto** (aplica o mapa placeholder→CDN, faz o wiring do form, extrai o `<style>` para CSS scoped e monta `src/pages/<slug>.astro`).
4. Imagens do CDN entram como `<img>` normal (já otimizadas). Hero = LCP → `fetchpriority="high"`.
5. Extraia as interações do design (`<script>`) para `src/scripts/<slug>.js` (menos a lógica de form).

## FASE 4 — Formulário (padrão Dmove — NÃO hardcode)

Use o preset: `getPreset(config.forms['lead-form'].preset)` de `src/scripts/form-presets.ts`. Renderize com as classes visuais do design, mas o motor é padrão:

- `tipo_evento` = **select** com todas as `tipoEventoOptions`
- `data_evento` = **Flatpickr** pt-BR (minDate hoje, máscara dd/mm/aaaa)
- `telefone` = máscara; se começar com 55 e passar de 11 dígitos, o 55 some (já no `forms.ts`)
- `detalhes_adicionais` = "Detalhes do evento (não obrigatório)" — **único opcional**
- Corporativo → `empresa` ("Nome da empresa") como **1º campo**
- Ligue o `<form>` ao `forms.ts` via `data-form-id`, `data-submit-url`, `data-grid-id`, `data-success-id` + honeypot `name="website"`.
- **`id` de cada campo = `form-field-<name>`** (ex.: `id="form-field-telefone"`). O GTM lê e-mail/telefone/nome do DOM por esses IDs (Enhanced Conversions). O `<label for>` acompanha. **Sem isso, telefone e nome não são capturados nas conversões.**

**Nomes canônicos (batem com o keyMap do n8n):** `nome, telefone, email, tipo_evento, data_evento, convidados, empresa, detalhes_adicionais`.

## FASE 5 — Fontes (armadilha conhecida)

O `global.css` usa `--font-display`/`--font-body` (default de sistema). Para a fonte do design:
- Self-host em `public/fonts/` + `@font-face` no CSS do design.
- **Sobrescreva** `--font-display`/`--font-body` no `:root` do CSS do design + regra explícita `h1..h6 { font-family: <fonte> }`.
- O `WhatsAppWidget` já usa `font-family: inherit` (herda a fonte da página).
- **Verifique com auditoria de computed style** (Playwright), não só lendo CSS.

## Tracking / GTM — contrato obrigatório com o container padrão

O container de GTM padrão da Dmove **lê sinais específicos do site**. Se o site não os produz, as conversões chegam vazias. O `UTMCapture.astro` e o `forms.ts` deste template já cumprem o contrato — **não regride isso**. Detalhes em `docs/tracking-gtm.md`. Resumo:

- **UTMs em COOKIES** — `UTMCapture` grava `utm_source/medium/campaign/content/term` + click IDs como cookies 1st-party (90d). O GTM lê de cookie, não de dataLayer. (Também resolve a persistência: sobrevive a fechar aba/voltar depois.)
- **`_external_id`** — cookie 1st-party (UUID, 365d) para Enhanced Conversions/CAPI.
- **`window.__page_event_id`** — UUID por pageview; o GTM usa como `event_id` do Pixel e o site manda o MESMO id no webhook → dedup Pixel×CAPI.
- **PII pelo DOM** — o GTM lê e-mail/telefone/nome dos campos `#form-field-*` (ver Fase 4). **Não** mande PII no dataLayer.
- **`form_submit`** (form e WhatsApp) dispara as conversões — payload limpo: `{ event, form_source: 'form'|'whatsapp', form_id, tipo_evento, event_id }`. Idem `form_start`/`form_error`.
- Container de referência: `Clientes/a' Playbooks e Metodologia/GTM-PKJ6HVMP_workspace20.json`.

## FASE 6 — QA (com evidência)

- **Fontes:** percorra os elementos e cheque `getComputedStyle().fontFamily` — nenhum fora da fonte do design.
- **Screenshots:** `tools/shot.mjs` captura frames rolando. `fullPage` **não dispara** o reveal (seções em branco) — role de verdade ou force `.is-visible`.
- **VRT:** `npm run compare` compara contra o HTML do design (baseline greenfield).
- **Lighthouse / PageSpeed:** `npm run audit`. + checar links quebrados. Para otimizar de verdade (LCP, imagens, fontes, libs), siga **[docs/performance.md](docs/performance.md)** — playbook com as armadilhas do Astro (LCP nunca `lazy`, carrossel empilhado, preload que casa, CSS de lib fora do crítico, self-host de fonte, cache de CDN).
- **Form:** confira o wiring; só dispare **lead de teste real no n8n com o OK do usuário**.
- **Tracking:** valide em runtime (ver `docs/tracking-gtm.md`) — cookies `utm_*`/`_external_id`, `window.__page_event_id` e os seletores `#form-field-*` (replicando os cJS do container). Depois o cliente valida no GTM Preview/Tag Assistant.

## FASE 7 — Deploy na VPS

1. `config.json > environment: "production"`, `npm run build`.
2. `ssh root@157.173.197.116 'mkdir -p /var/www/<dominio>'`
3. `scp -r dist/. root@157.173.197.116:/var/www/<dominio>/` + `chmod -R 755`
4. **Vhost nginx** (padrão): `root /var/www/<dominio>` + `try_files $uri $uri/ $uri/index.html =404` + cache assets 1y + gzip. Symlink em `sites-enabled`, `nginx -t`, `reload`.
5. **SSL:** `certbot --nginx -d <dominio> --non-interactive --agree-tos -m michel@dmove.com.br --redirect`.
6. Verifique: HTTPS 200, HTTP→HTTPS 301, fonte 200, GTM presente.

---

## QUANDO PARAR E PERGUNTAR AO USUÁRIO

- **Início:** as 7 perguntas de onboarding.
- **Assets ambíguos:** qual imagem é o poster do vídeo, versão certa de um logo, imagem faltando.
- **Assets de marca definitivos:** favicon/OG/avatar do WhatsApp — se só houver stopgap, avise.
- **Antes de publicar em produção** (ação externa) — confirme.
- **Antes de disparar lead de teste real** no n8n.
- **Decisões de negócio:** funil/preset, campos extras, textos, redirects.
- **Qualquer coisa fora do padrão** no design (form não-padrão, fonte sem arquivo, tracking embutido).

Prefira perguntar tudo o que puder **de uma vez** no início.

---

## Arquitetura (referência)

- **`src/layouts/Base.astro`** — wrapper obrigatório. SEO, OG, GTM, UTM capture, WhatsApp widget, JSON-LD. Props: `title`, `description`, `ogImage`, `canonical`, `noIndex`, `theme`, `jsonLd`.
- **`config.json`** — config do projeto. `forms.lead-form.preset` escolhe o funil; `webhooks[0]` é o webhook (lido pela página e pelo WhatsAppWidget).
- **`src/scripts/form-presets.ts`** — catálogo de campos + presets `social`/`corporativo`. Fonte única dos campos.
- **`src/scripts/forms.ts`** — envio, validação, máscara de telefone, honeypot, GTM, payload+UTMs+CAPI.
- **`src/scripts/lead-payload.ts`** — `keyMap` (name→chave n8n) + `tipoEventoOptions`.
- **`src/components/ui/`** — `Img` (otimização build), `Video` (self-host + JSON-LD), `StaticMap`, `WhatsAppWidget`.
- **`src/styles/global.css`** — design system base (tokens de cor/fonte/espaçamento). Sobrescreva os tokens no CSS do projeto.
- **`tools/extract-preview.mjs`** — separa base64 do HTML. **`tools/shot.mjs`** — screenshots de QA.

## Referência rápida

- **VPS:** `157.173.197.116` · páginas em `/var/www/<dominio>` · CDN em `/var/www/media-storage/clients/<slug>/`
- **Presets:** `social` (sem empresa) · `corporativo` (empresa 1º)
- **Slugs:** `/casamentos /eventos-corporativos /eventos-corporativos-confraternizacoes /debutantes /aniversarios /formaturas`
