const fs=require('node:fs'),path=require('node:path');
const {prepare,reconstruct}=require('../js/compression.js');
const Samples=require('../js/samples.js');
const {png}=require('./png.cjs');
const root=path.resolve(__dirname,'..'),output=path.join(root,'results');fs.mkdirSync(output,{recursive:true});
const results={schemaVersion:1,imageSize:512,levels:3,percentages:[5,15,35],significanceEpsilon:1e-9,psnrPixels:'rounded, clamped to [0,255], cropped to original dimensions',samples:[]};
for(const id of Object.keys(Samples.names)){
  const sample=Samples.create(id,512),p=prepare(sample.pixels,512,512,3),folder=path.join(output,id);fs.mkdirSync(folder,{recursive:true});
  fs.writeFileSync(path.join(folder,'original.png'),png(sample.pixels,512,512));
  const entry={id,name:sample.name,width:512,height:512,experiments:[]};
  for(const percent of results.percentages){
    const row={percent};const comparison=new Uint8Array(1536*512);
    for(let y=0;y<512;y++)comparison.set(sample.pixels.subarray(y*512,(y+1)*512),y*1536);
    for(const [i,method] of ['dct','dwt'].entries()){
      const {pixels,...metrics}=reconstruct(p,method,percent);row[method]=metrics;
      fs.writeFileSync(path.join(folder,`${method}-${String(percent).padStart(2,'0')}.png`),png(pixels,512,512));
      for(let y=0;y<512;y++)comparison.set(pixels.subarray(y*512,(y+1)*512),y*1536+(i+1)*512);
    }
    fs.writeFileSync(path.join(folder,`comparison-${String(percent).padStart(2,'0')}.png`),png(comparison,1536,512));
    entry.experiments.push(row);
    console.log(`${sample.name}, ${percent}%: DCT ${row.dct.psnr.toFixed(4)} дБ; DWT ${row.dwt.psnr.toFixed(4)} дБ`);
  }
  results.samples.push(entry);
}
fs.writeFileSync(path.join(output,'experiments.json'),JSON.stringify(results,(_,value)=>typeof value==='number'&&!Number.isFinite(value)?String(value):value,2)+'\n');
const rows=['sample,width,height,dwt_levels,retained_percent,method,selected,total,significant,mse,psnr_db'];
for(const sample of results.samples)for(const row of sample.experiments)for(const method of ['dct','dwt']){const r=row[method];rows.push([`"${sample.name}"`,512,512,3,row.percent,method.toUpperCase(),r.retained,r.total,r.significant,r.mse,r.psnr].join(','));}
fs.writeFileSync(path.join(output,'experiments.csv'),'\uFEFF'+rows.join('\n')+'\n');
