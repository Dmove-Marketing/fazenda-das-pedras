import { chromium } from 'playwright';
const URL = process.argv[2] || 'http://localhost:4331/eventos-corporativos';
const b = await chromium.launch();
for (const [nome, w, h, dpr] of [['mobile 390@3x',390,844,3],['tablet 768@2x',768,1024,2],['desktop 1440@1x',1440,900,1]]) {
  const p = await b.newPage({ viewport:{width:w,height:h}, deviceScaleFactor:dpr });
  let bytes=0, imgs=0, imgBytes=0;
  p.on('response', async r=>{ try{ const buf=await r.body(); bytes+=buf.length;
    if((r.headers()['content-type']||'').startsWith('image/')){imgs++;imgBytes+=buf.length;} }catch{} });
  await p.goto(URL,{waitUntil:'networkidle'});
  await p.waitForTimeout(600);
  const semRolar = {bytes,imgs,imgBytes};
  await p.evaluate(async()=>{for(let y=0;y<document.body.scrollHeight;y+=600){window.scrollTo(0,y);await new Promise(r=>setTimeout(r,80));}});
  await p.waitForTimeout(1200);
  console.log(`${nome.padEnd(16)} sem rolar: ${(semRolar.bytes/1024).toFixed(0)}KB (${semRolar.imgs} imgs, ${(semRolar.imgBytes/1024).toFixed(0)}KB)  ·  página toda: ${(bytes/1048576).toFixed(2)}MB (${imgs} imgs)`);
  await p.close();
}
// lightbox carrega ao abrir?
const p = await b.newPage({ viewport:{width:390,height:844} });
await p.goto(URL,{waitUntil:'networkidle'});
const antes = await p.evaluate(()=>document.querySelector('#lb-gal-1 .lightbox__img').naturalWidth);
await p.evaluate(()=>{location.hash='#lb-gal-1';});
await p.waitForTimeout(2500);
const depois = await p.evaluate(()=>({nw:document.querySelector('#lb-gal-1 .lightbox__img').naturalWidth, vis:getComputedStyle(document.querySelector('#lb-gal-1')).opacity}));
console.log(`\nLightbox: naturalWidth antes de abrir = ${antes} · depois de abrir = ${depois.nw} (opacity ${depois.vis})`);
await b.close();
