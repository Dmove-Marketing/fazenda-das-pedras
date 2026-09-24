// ============================================================
// Caça o bug de cascata que o pontinho da hospedagem revelou:
// uma regra dentro de @media (max-width: …) que é anulada por uma regra
// de mesma especificidade declarada DEPOIS, fora de qualquer media query.
// O autor escreveu a variação mobile, ela existe no arquivo, e mesmo assim
// não vale — silenciosamente.
//
//   node tools/lint-cascata.mjs [arquivo.css ...]
// ============================================================
import { readFile } from 'node:fs/promises';

const arquivos = process.argv.slice(2);
if (!arquivos.length) arquivos.push('src/styles/eventos-corporativos.css', 'src/styles/bio.css');

const regras = (css) => {
  const achadas = [];
  let i = 0;
  let media = null;
  let fimMedia = -1;
  while (i < css.length) {
    const abre = css.indexOf('{', i);
    if (abre < 0) break;
    // saiu do @media? (o fecha do bloco fica no meio do caminho)
    if (fimMedia > 0 && abre > fimMedia) { media = null; fimMedia = -1; }
    // o cabeçalho pode vir com o "}" do bloco anterior grudado
    const cabecalho = css
      .slice(i, abre)
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^[\s}]+/, '')
      .trim();

    if (cabecalho.startsWith('@media')) {
      // entra no bloco: acha o fecha correspondente
      let nivel = 1, j = abre + 1;
      while (j < css.length && nivel > 0) { if (css[j] === '{') nivel++; else if (css[j] === '}') nivel--; j++; }
      media = cabecalho;
      fimMedia = j;
      i = abre + 1;
      continue;
    }
    if (cabecalho.startsWith('@')) { // keyframes, font-face, supports…
      let nivel = 1, j = abre + 1;
      while (j < css.length && nivel > 0) { if (css[j] === '{') nivel++; else if (css[j] === '}') nivel--; j++; }
      i = j;
      continue;
    }

    const fecha = css.indexOf('}', abre);
    if (fecha < 0) break;
    const corpo = css.slice(abre + 1, fecha);
    const props = [...corpo.matchAll(/(^|;)\s*([a-z-]+)\s*:/g)].map((m) => m[2]);
    if (cabecalho) {
      achadas.push({
        seletor: cabecalho.split(',').map((s) => s.trim()).filter(Boolean),
        props: new Set(props),
        pos: abre,
        media: fimMedia > abre ? media : null,
      });
    }
    i = fecha + 1;
  }
  return achadas;
};

let problemas = 0;
for (const arquivo of arquivos) {
  const css = await readFile(arquivo, 'utf8');
  const todas = regras(css);
  const linhaDe = (pos) => css.slice(0, pos).split('\n').length;

  for (const r of todas) {
    if (!r.media || !/max-width/.test(r.media)) continue;
    for (const sel of r.seletor) {
      const depois = todas.filter((o) => !o.media && o.pos > r.pos && o.seletor.includes(sel));
      for (const d of depois) {
        let anuladas = [...r.props].filter((p) => d.props.has(p));
        if (!anuladas.length) continue;
        // alguma media query POSTERIOR à regra base restabelece o valor?
        // (é assim que a normalização do build conserta o CSS do design)
        const resgate = todas.filter((o) => o.media && /max-width/.test(o.media) && o.pos > d.pos && o.seletor.includes(sel));
        anuladas = anuladas.filter((p) => !resgate.some((o) => o.props.has(p)));
        if (!anuladas.length) continue;
        problemas++;
        console.log(`\n❌ ${arquivo}`);
        console.log(`   "${sel}" dentro de ${r.media} (linha ${linhaDe(r.pos)})`);
        console.log(`   é anulado pela mesma regra na linha ${linhaDe(d.pos)}, fora de media query`);
        console.log(`   propriedades perdidas: ${anuladas.join(', ')}`);
      }
    }
  }
}

console.log(problemas ? `\n${problemas} regra(s) mobile sendo anulada(s).` : '\n✅ Nenhuma regra mobile anulada por regra base posterior.');
process.exit(problemas ? 1 : 0);
