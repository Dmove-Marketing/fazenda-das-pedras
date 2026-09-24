// ============================================================
// Imagens da /eventos-corporativos → WebP em várias larguras
// ------------------------------------------------------------
// Gera, por foto, as larguras que a página realmente usa (medidas em
// tools/audit-responsivo.mjs) e um manifesto com as dimensões intrínsecas,
// que o build-eventos-corporativos.mjs consome para montar srcset/sizes
// e os atributos width/height (anti-CLS).
//
//   node tools/optimize-eventos-corporativos.mjs
//   → _work/otimizadas/  +  tools/imagens.manifest.json
// ============================================================
import sharp from 'sharp';
import { readdir, mkdir, writeFile, stat, rm } from 'node:fs/promises';
import path from 'node:path';

const SRC = '../eventos-corporativos/docs para desenvolvimento/ENTREGA/imagens';
const OUT = '_work/otimizadas';

// Larguras por papel. O papel sai do nome do arquivo — é assim que o time de
// criação nomeia a entrega, e o build usa a mesma convenção.
const PAPEIS = [
  { test: /hero\./,        larguras: [480, 640, 800, 960, 1280, 1600, 2000], quality: 74 },  // background do hero (LCP)
  { test: /estrutura-2\./, larguras: [320, 480, 640, 960, 1280, 1920], quality: 70 }, // marquee + fundo do depoimento
  { test: /formulario\./,  larguras: [640, 960, 1280, 1920], quality: 70 },         // fundo da seção de contato
  { test: /hospedagem-/,   larguras: [360, 560, 800, 1080], quality: 76 },
  // Fotos vindas de PNG com muito detalhe: pesam o dobro no mesmo tamanho.
  { test: /(jatoba|redario|espacorustico)\./, larguras: [320, 480, 560, 800], quality: 68 },
  { test: /sobre\./,       larguras: [480, 700, 1000, 1200, 1600], quality: 74 },
  { test: /salaoprincipal\./, larguras: [320, 480, 560, 800, 1400], quality: 75 },
  { test: /galeria-/,      larguras: [320, 480, 640, 800, 1400], quality: 74 },
  { test: /gastronomia-/,  larguras: [320, 480, 640, 900, 1400], quality: 74 },
  { test: /estrutura-/,    larguras: [320, 480, 560, 700, 1400], quality: 74 },
];
const papel = (f) => PAPEIS.find((r) => r.test.test(f)) || { larguras: [480, 800, 1400], quality: 75 };

await rm(OUT, { recursive: true, force: true });
await mkdir(OUT, { recursive: true });

const arquivos = (await readdir(SRC)).filter((f) => /\.(jpe?g|png)$/i.test(f) && f !== 'favicon.png').sort();
const manifesto = {};
let entrada = 0, saida = 0, geradas = 0;

for (const f of arquivos) {
  const { larguras, quality } = papel(f);
  const base = f.replace(/\.(jpe?g|png)$/i, '');
  const origem = path.join(SRC, f);
  const meta = await sharp(origem).metadata();
  entrada += (await stat(origem)).size;

  const alvos = [...new Set(larguras.map((w) => Math.min(w, meta.width)))].sort((a, b) => a - b);
  const variantes = [];
  for (const w of alvos) {
    const nome = `${base}-${w}.webp`;
    const info = await sharp(origem).rotate()
      .resize({ width: w, withoutEnlargement: true })
      .webp({ quality, effort: 6 })
      .toFile(path.join(OUT, nome));
    variantes.push({ w: info.width, h: info.height, arquivo: nome, kb: Math.round(info.size / 1024) });
    saida += info.size; geradas++;
  }
  // maior variante é a usada como src padrão (fallback de navegador sem srcset)
  const maior = variantes[variantes.length - 1];
  manifesto[base] = { largura: maior.w, altura: maior.h, proporcao: +(meta.width / meta.height).toFixed(4), variantes };
  console.log(`${base.padEnd(46)} ${meta.width}px → ${variantes.map((v) => `${v.w}(${v.kb}k)`).join(' ')}`);
}

await writeFile('tools/imagens.manifest.json', JSON.stringify(manifesto, null, 2));
console.log(`\n${arquivos.length} fotos → ${geradas} variantes`);
console.log(`originais ${(entrada / 1048576).toFixed(1)} MB · variantes ${(saida / 1048576).toFixed(2)} MB`);
console.log('manifesto → tools/imagens.manifest.json');
