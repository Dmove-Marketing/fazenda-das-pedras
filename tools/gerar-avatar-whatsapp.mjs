// ============================================================
// Avatar do widget de WhatsApp
// ------------------------------------------------------------
// O widget mostra o avatar num círculo de 24 a 40px, com object-fit: cover.
// A logo horizontal (700x296) entrava cortada no meio — lia-se "NDA DAS PE".
// O lockup inteiro também não serve: nesse tamanho o texto vira borrão.
// Então aqui vai só o SÍMBOLO da marca (o sol sobre as montanhas), recortado
// do topo da logo vertical, centrado num quadrado com o verde oliva do
// brandbook. Em 40px e em 24px o símbolo continua reconhecível.
//
//   node tools/gerar-avatar-whatsapp.mjs
// ============================================================
import sharp from 'sharp';

const LOGO = 'public/images/eventos-corporativos/logo-vertical-claro.svg';
const SAIDA = 'public/images/whatsapp-avatar.png';
const LADO = 256;               // exibido no máximo a 40px: sobra para telas 3x
const OCUPACAO = 0.72;          // o resto é respiro, senão o símbolo encosta na borda do círculo
const FUNDO = { r: 0x4a, g: 0x4f, b: 0x27, alpha: 1 };   // --cor-primaria do brandbook

// 1. rasteriza a logo vertical grande
const base = await sharp(LOGO, { density: 600 }).resize({ width: 1200 }).ensureAlpha().png().toBuffer();
const { data, info } = await sharp(base).raw().toBuffer({ resolveWithObject: true });
const { width: w, height: h, channels: ch } = info;

// 2. acha onde o símbolo termina: a primeira faixa horizontal vazia
//    (o respiro entre o símbolo e a palavra "ESPAÇO")
const temConteudo = (y) => {
  for (let x = 0; x < w; x++) if (data[(y * w + x) * ch + 3] > 12) return true;
  return false;
};
let fimSimbolo = -1;
let vazias = 0;
const minFaixa = Math.round(h * 0.012);
for (let y = 0; y < h; y++) {
  if (!temConteudo(y)) {
    vazias++;
    if (vazias >= minFaixa && fimSimbolo < 0) { fimSimbolo = y - vazias + 1; break; }
  } else vazias = 0;
}
if (fimSimbolo < 0) throw new Error('Não achei o fim do símbolo na logo vertical');

// 3. recorta, aperta as bordas e compõe no quadrado
const simbolo = await sharp(base)
  .extract({ left: 0, top: 0, width: w, height: fimSimbolo })
  .trim()
  .resize({ width: Math.round(LADO * OCUPACAO) })
  .png()
  .toBuffer();

const meta = await sharp(simbolo).metadata();
const arquivo = await sharp({ create: { width: LADO, height: LADO, channels: 4, background: FUNDO } })
  .composite([{ input: simbolo, gravity: 'center' }])
  .png({ compressionLevel: 9 })
  .toFile(SAIDA);

console.log(`${SAIDA} — ${arquivo.width}x${arquivo.height}, ${Math.round(arquivo.size / 1024)}KB`);
console.log(`símbolo recortado nos primeiros ${fimSimbolo}px da logo (${Math.round((fimSimbolo / h) * 100)}% da altura)`);
console.log(`desenhado a ${meta.width}x${meta.height} (${Math.round(OCUPACAO * 100)}% do lado), centrado`);
