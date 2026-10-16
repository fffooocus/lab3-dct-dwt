const fs=require('node:fs'),path=require('node:path');
module.exports=function(){
  try{return require('playwright');}catch{}
  const cache=path.join(process.env.LOCALAPPDATA||'','npm-cache','_npx');
  if(fs.existsSync(cache))for(const dir of fs.readdirSync(cache)){const p=path.join(cache,dir,'node_modules','playwright');if(fs.existsSync(path.join(p,'package.json')))return require(p);}
  throw new Error('Для PDF та перевірки браузера потрібен Playwright: npm install --no-save playwright; npx playwright install chromium');
};
