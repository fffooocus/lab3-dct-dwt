const test = require('node:test');
const assert = require('node:assert/strict');
const { C, dct2, haar2, retain, quality, prepare, reconstruct } = require('../js/compression.js');
const Samples = require('../js/samples.js');
const close = (a, b, tolerance = 1e-8) => assert.ok(Math.abs(a - b) <= tolerance, `${a} ≠ ${b}`);
const random = n => Float64Array.from({ length: n }, (_, i) => ((Math.imul(i + 7, 16807) % 65521) / 65521 - 0.5) * 255);
test('матриця DCT ортонормована', () => { for (let i = 0; i < 8; i++) for (let j = 0; j < 8; j++) close(C[i].reduce((s, x, k) => s + x * C[j][k], 0), i === j ? 1 : 0); });
test('DCT сталої має тільки DC: 8 × значення', () => { const out = dct2(new Float64Array(64).fill(10), 8, 8); close(out[0], 80); for (const x of out.subarray(1)) close(x, 0); });
test('DCT відповідає незалежній прямій формулі 2D', () => {
  const input = random(64), out = dct2(input, 8, 8);
  for (let u = 0; u < 8; u++) for (let v = 0; v < 8; v++) {
    let sum = 0;
    for (let x = 0; x < 8; x++) for (let y = 0; y < 8; y++) sum += input[x * 8 + y] * Math.cos((2*x+1)*u*Math.PI/16) * Math.cos((2*y+1)*v*Math.PI/16);
    close(out[u*8+v], sum * (u ? 0.5 : Math.SQRT1_2 / 2) * (v ? 0.5 : Math.SQRT1_2 / 2));
  }
});
test('DCT: обернення прямокутного масиву й збереження енергії', () => { const input = random(32*16), out = dct2(input, 32, 16), back = dct2(out, 32, 16, true); input.forEach((v,i)=>close(v, back[i])); close(input.reduce((s,v)=>s+v*v,0), out.reduce((s,v)=>s+v*v,0), 1e-6); });
test('Хаар 2×2: незалежний очікуваний результат', () => { const out = haar2([1,2,3,4],2,2,1); [5,-1,-2,0].forEach((v,i)=>close(out[i],v)); });
test('Хаар: обернення для 1–5 рівнів, збереження енергії', () => { const input = random(64*32); for (let levels=1;levels<=5;levels++) { const out=haar2(input,64,32,levels), back=haar2(out,64,32,levels,true); input.forEach((v,i)=>close(v,back[i])); close(input.reduce((s,v)=>s+v*v,0),out.reduce((s,v)=>s+v*v,0),1e-6); } });
test('відкидання: точне K, порядок при нічиїй, нулі', () => { const out=retain([0,2,-2,5],50); assert.equal(out.count,2); assert.equal(out.significant,2); assert.deepEqual([...out.values],[0,2,0,5]); assert.equal(retain([0,0],100).significant,0); assert.equal(retain([1,2],0).count,0); });
test('PSNR: нульова похибка та відома різниця в один рівень', () => { assert.equal(quality([5,6],[5,6]).psnr,Infinity); const q=quality([0,0],[1,1]); assert.equal(q.mse,1); close(q.psnr,48.1308036086791); });
test('100%: точне відновлення пікселів, доповнення та обрізання 13×19', () => { const input=Uint8ClampedArray.from(random(13*19),v=>v+128), p=prepare(input,13,19,4); assert.equal(p.paddedWidth,16); assert.equal(p.paddedHeight,32); for(const method of ['dct','dwt']) { const r=reconstruct(p,method,100); assert.deepEqual(r.pixels,input); assert.equal(r.psnr,Infinity); assert.equal(r.total,512); } });
test('збільшення K не збільшує похибку коефіцієнтів', () => { const p=prepare(Samples.create('texture',64).pixels,64,64); for(const method of ['dct','dwt']) { let previous=Infinity; for(const percent of [0,5,15,35,100]) { const kept=retain(p[method],percent,p.ranks[method]); const loss=p[method].reduce((s,v,i)=>s+(v-kept.values[i])**2,0); assert.ok(loss <= previous+1e-6); previous=loss; } } });
test('некоректні параметри відхиляються', () => { assert.throws(()=>dct2([1],1,1),RangeError); assert.throws(()=>haar2(new Float64Array(64),8,8,4),RangeError); assert.throws(()=>retain([1],101),RangeError); assert.throws(()=>quality([],[]),RangeError); });
test('зразки відтворювані й різні', () => { for(const name of Object.keys(Samples.names)) { const a=Samples.create(name,32),b=Samples.create(name,32); assert.deepEqual(a.pixels,b.pixels); assert.equal(a.pixels.length,1024); assert.ok(new Set(a.pixels).size > 50); } });
