const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
const {pathToFileURL}=require('node:url');
const {png}=require('./png.cjs');
const root=path.resolve(__dirname,'..'),artifacts=path.join(root,'.artifacts');fs.mkdirSync(artifacts,{recursive:true});
const expected=JSON.parse(fs.readFileSync(path.join(root,'results','experiments.json'),'utf8'));
const ready=async page=>{await page.waitForFunction(()=>document.getElementById('processing-state').textContent.includes('Обчислення завершено')&&!document.getElementById('percent').disabled);};
(async()=>{
  const {chromium}=require('./browser-runtime.cjs')(),browser=await chromium.launch({headless:true});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:1100},deviceScaleFactor:1});const errors=[];
    page.on('pageerror',error=>errors.push(error.message));
    await page.goto('http://127.0.0.1:4173');await ready(page);
    const initial=expected.samples[0].experiments[1];
    assert.ok((await page.locator('#dct-psnr').textContent()).includes(initial.dct.psnr.toFixed(2)));
    assert.ok((await page.locator('#dwt-psnr').textContent()).includes(initial.dwt.psnr.toFixed(2)));
    assert.equal(await page.locator('#experiments-body tr').count(),3);
    await page.screenshot({path:path.join(artifacts,'desktop.png'),fullPage:true});
    await page.locator('button[data-percent="100"]').click();await page.waitForFunction(()=>document.getElementById('dct-psnr').textContent.includes('∞')&&document.getElementById('dwt-psnr').textContent.includes('∞'));
    await page.locator('button[data-percent="5"]').click();await page.waitForFunction(()=>document.getElementById('dct-psnr').textContent.includes('39.99'));
    await page.locator('[data-zoom="dct"]').click();assert.equal(await page.locator('#image-dialog').evaluate(d=>d.open),true);await page.keyboard.press('Escape');
    const [csv]=await Promise.all([page.waitForEvent('download'),page.locator('#export-csv').click()]);await csv.saveAs(path.join(artifacts,'browser-export.csv'));
    const lines=fs.readFileSync(path.join(artifacts,'browser-export.csv'),'utf8').trim().split(/\r?\n/);assert.equal(lines.length,7);assert.ok(lines[1].includes('DCT'));
    const [image]=await Promise.all([page.waitForEvent('download'),page.locator('#download-images').click()]);await image.saveAs(path.join(artifacts,'browser-comparison.png'));assert.deepEqual([...fs.readFileSync(path.join(artifacts,'browser-comparison.png')).subarray(0,8)],[137,80,78,71,13,10,26,10]);
    await page.locator('#sample-select').selectOption('texture');await ready(page);assert.ok((await page.locator('#dct-psnr').textContent()).includes(expected.samples[1].experiments[0].dct.psnr.toFixed(2)));
    const fixture=path.join(artifacts,'non-square.png');fs.writeFileSync(fixture,png(Uint8Array.from({length:17*29},(_,i)=>i%256),17,29));
    await page.locator('#file-input').setInputFiles(fixture);await ready(page);assert.equal(await page.locator('#image-size').textContent(),'17 × 29');
    await page.locator('#levels').selectOption('5');await ready(page);assert.ok((await page.locator('#padding-info').textContent()).includes('32 × 32'));
    await page.locator('button[data-percent="100"]').click();await page.waitForFunction(()=>document.getElementById('dct-psnr').textContent.includes('∞')&&document.getElementById('dwt-psnr').textContent.includes('∞'));
    await page.locator('#sample-select').selectOption('geometry');await ready(page);await page.locator('#max-size').selectOption('256');await ready(page);assert.equal(await page.locator('#image-size').textContent(),'256 × 256');
    await page.locator('#levels').selectOption('3');await ready(page);await page.locator('#max-size').selectOption('512');await ready(page);await page.locator('#sample-select').selectOption('landscape');await ready(page);await page.locator('button[data-percent="15"]').click();await page.waitForFunction(()=>document.getElementById('dct-psnr').textContent.includes('49.71'));
    for(const width of [375,768,1024]){await page.setViewportSize({width,height:1000});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`Переповнення на ${width}px`);}
    await page.setViewportSize({width:375,height:900});await page.screenshot({path:path.join(artifacts,'mobile.png'),fullPage:true});
    const offline=await browser.newPage();offline.on('pageerror',error=>errors.push(error.message));await offline.goto(pathToFileURL(path.join(root,'index.html')).href);await ready(offline);assert.ok((await offline.locator('#dct-psnr').textContent()).includes('49.71'));
    assert.deepEqual(errors,[]);console.log('Браузер: PSNR, 3 експерименти, 100%, вибір зразка, PNG/CSV, збільшення, власний файл 17×29, 5 рівнів, розмір 256, мобільна верстка й file:// — перевірено.');
  }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
