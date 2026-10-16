const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..'), output=path.join(root,'dist');
fs.mkdirSync(output,{recursive:true});
for(const item of ['index.html','styles.css','js','assets','docs','results']) fs.cpSync(path.join(root,item),path.join(output,item),{recursive:true});
fs.writeFileSync(path.join(output,'_headers'),'/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\n');
console.log('Статичний застосунок підготовлено: dist/');
