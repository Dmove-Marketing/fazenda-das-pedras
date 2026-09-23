import sharp from 'sharp';
import { readdir, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';

const SRC = '/Users/michelspinelli/Dmove Marketing/Clientes/Fazenda das Pedras/Páginas web/eventos-corporativos/docs para desenvolvimento/ENTREGA/imagens';
const OUT = '/private/tmp/claude-501/-Users-michelspinelli-Dmove-Marketing-Clientes/ffdfad7b-b20f-44f8-86a0-a8d4694a9604/scratchpad/otimizadas';

// papel de cada imagem na página → largura máxima e qualidade
const rules = [
  { test: /hero\./,          width: 2000, quality: 74 },   // background full-bleed (LCP)
  { test: /estrutura-2\./,   width: 1920, quality: 70 },   // background escurecido (infra)
  { test: /formulario\./,    width: 1920, quality: 70 },   // background escurecido (contato)
  { test: /hospedagem-/,     width: 1080, quality: 78 },   // carrossel 4:5
  { test: /(jatoba|redario|espacorustico)\./, width: 1122, quality: 76 }, // cards de ambiente
  { test: /(sobre|salaoprincipal)\./, width: 1500, quality: 76 },
  { test: /(galeria|gastronomia|estrutura)-/, width: 1400, quality: 75 },
];

const pick = (f) => rules.find((r) => r.test.test(f)) || { width: 1400, quality: 75 };

await mkdir(OUT, { recursive: true });
const files = (await readdir(SRC)).filter((f) => /\.(jpe?g|png)$/i.test(f) && f !== 'favicon.png');

let totalIn = 0, totalOut = 0;
for (const f of files.sort()) {
  const { width, quality } = pick(f);
  const inPath = path.join(SRC, f);
  const outName = f.replace(/\.(jpe?g|png)$/i, '.webp');
  const outPath = path.join(OUT, outName);
  const img = sharp(inPath).rotate();
  const meta = await img.metadata();
  await img
    .resize({ width: Math.min(width, meta.width), withoutEnlargement: true })
    .webp({ quality, effort: 6 })
    .toFile(outPath);
  const [a, b] = [(await stat(inPath)).size, (await stat(outPath)).size];
  totalIn += a; totalOut += b;
  console.log(`${outName.padEnd(58)} ${meta.width}px→${Math.min(width, meta.width)}px  ${(a/1048576).toFixed(1)}MB → ${(b/1024).toFixed(0)}KB`);
}
console.log(`\nTOTAL: ${(totalIn/1048576).toFixed(1)}MB → ${(totalOut/1048576).toFixed(2)}MB`);
