(function () {
  'use strict';
  const $ = id => document.getElementById(id);
  const number = value => new Intl.NumberFormat('uk-UA').format(value);
  const psnr = value => Number.isFinite(value) ? value.toFixed(2) : '∞';
  const state = { source: null, prepared: null, current: null, experiments: [], revision: 0, previewId: 0, busy: false };
  const pending = new Map();
  let worker, sequence = 0, toastTimer, sliderTimer;
  // file:// підтримується без сервера; HTTP використовує окремий потік Worker.
  if (location.protocol !== 'file:' && typeof Worker !== 'undefined') {
    try {
      worker = new Worker('js/worker.js');
      worker.onmessage = ({ data }) => {
        const promise = pending.get(data.id);
        if (!promise) return;
        pending.delete(data.id);
        if (data.error) promise.reject(new Error(data.error)); else promise.resolve(data.result);
      };
      worker.onerror = () => { for (const promise of pending.values()) promise.reject(new Error('Не вдалося виконати обчислення. Оновіть сторінку.')); pending.clear(); };
    } catch (_) { worker = null; }
  }
  async function compute(type, payload) {
    if (worker) return new Promise((resolve, reject) => {
      const id = ++sequence; pending.set(id, { resolve, reject }); worker.postMessage({ id, type, payload });
    });
    await new Promise(resolve => setTimeout(resolve, 0));
    if (type === 'prepare') {
      state.prepared = Compression.prepare(payload.pixels, payload.width, payload.height, payload.levels);
      return { paddedWidth: state.prepared.paddedWidth, paddedHeight: state.prepared.paddedHeight };
    }
    const pair = percent => ({ percent, dct: Compression.reconstruct(state.prepared, 'dct', percent), dwt: Compression.reconstruct(state.prepared, 'dwt', percent) });
    return type === 'preview' ? pair(payload.percent) : payload.percents.map(pair);
  }
  function toast(message) { clearTimeout(toastTimer); $('toast').textContent = message; $('toast').hidden = false; toastTimer = setTimeout(() => { $('toast').hidden = true; }, 6000); }
  function status(message, busy = false) { $('processing-state').replaceChildren(); const dot = document.createElement('span'); dot.className = 'status-dot'; $('processing-state').append(dot, message); $('processing-state').classList.toggle('busy', busy); }
  function lock(busy) {
    state.busy = busy;
    for (const id of ['levels', 'max-size', 'sample-select', 'upload-button', 'percent', 'export-csv', 'download-images']) $(id).disabled = busy;
    document.querySelectorAll('button[data-percent]').forEach(button => { button.disabled = busy; });
  }
  function draw(canvas, pixels, width, height) {
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d'); const image = ctx.createImageData(width, height);
    for (let i = 0; i < pixels.length; i++) { image.data[i * 4] = pixels[i]; image.data[i * 4 + 1] = pixels[i]; image.data[i * 4 + 2] = pixels[i]; image.data[i * 4 + 3] = 255; }
    ctx.putImageData(image, 0, 0);
  }
  async function setSource(source) {
    clearTimeout(sliderTimer);
    const revision = ++state.revision;
    state.source = source; state.current = null; state.experiments = [];
    lock(true); status('Виконується перетворення…', true);
    draw($('original-canvas'), source.pixels, source.width, source.height);
    $('image-size').textContent = `${source.width} × ${source.height}`;
    $('original-pixels').textContent = `${number(source.pixels.length)} px`;
    try {
      const levels = Number($('levels').value);
      const metadata = await compute('prepare', { ...source, levels });
      if (revision !== state.revision) return;
      $('dwt-level-tag').textContent = `${levels} ${levels === 1 ? 'рівень' : levels < 5 ? 'рівні' : 'рівнів'}`;
      $('padding-info').textContent = `Поточне зображення: ${source.width} × ${source.height}; масив перетворення: ${metadata.paddedWidth} × ${metadata.paddedHeight}; рівнів DWT: ${levels}.`;
      await preview();
      status('Експерименти 5%, 15%, 35%…', true);
      const experiments = await compute('experiments', { percents: [5, 15, 35] });
      if (revision !== state.revision) return;
      state.experiments = experiments; renderExperiments();
      status('Обчислення завершено');
    } catch (error) { toast(error.message); status('Помилка обчислення'); }
    finally { if (revision === state.revision) lock(false); }
  }
  async function preview() {
    const previewId = ++state.previewId, revision = state.revision;
    const percent = Number($('percent').value);
    status('Відновлення зображень…', true);
    try {
      const result = await compute('preview', { percent });
      if (previewId !== state.previewId || revision !== state.revision) return;
      state.current = result;
      for (const method of ['dct', 'dwt']) {
        const data = result[method];
        draw($(`${method}-canvas`), data.pixels, data.width, data.height);
        $(`${method}-psnr`).innerHTML = `${psnr(data.psnr)} <small>дБ</small>`;
        $(`${method}-count`).textContent = `${number(data.retained)} / ${number(data.total)}`;
        $(`${method}-track`).style.width = `${percent}%`;
        $(`${method}-nonzero`).textContent = `Значущих: ${number(data.significant)} · ${number(data.significant / data.total * 100)}%`;
      }
      const delta = result.dct.psnr - result.dwt.psnr;
      $('comparison-insight').textContent = !Number.isFinite(result.dct.psnr) && !Number.isFinite(result.dwt.psnr)
        ? 'Обидва методи відновили зображення без похибки: MSE = 0, PSNR = ∞.'
        : Number.isFinite(delta) && Math.abs(delta) < 0.01 ? `При ${percent}% обидва методи мають практично однаковий PSNR.`
        : Number.isFinite(delta) ? `При ${percent}% ${delta > 0 ? 'DCT' : 'DWT'} має вищий PSNR на ${Math.abs(delta).toFixed(2)} дБ для цього зображення.`
        : `При ${percent}% ${!Number.isFinite(result.dct.psnr) ? 'DCT' : 'DWT'} відновлює зображення без похибки.`;
      document.querySelectorAll('#experiments-body tr').forEach(row => row.classList.toggle('active-row', Number(row.dataset.percent) === percent));
      status('Обчислення завершено');
    } catch (error) { toast(error.message); status('Помилка обчислення'); }
  }
  function updatePercent(value, immediate = false) {
    $('percent').value = value; $('percent-output').innerHTML = `${value}<span>%</span>`;
    document.querySelectorAll('button[data-percent]').forEach(button => { const selected = Number(button.dataset.percent) === Number(value); button.classList.toggle('selected', selected); button.setAttribute('aria-pressed', String(selected)); });
    clearTimeout(sliderTimer);
    if (!state.source || state.busy) return;
    if (immediate) preview(); else sliderTimer = setTimeout(preview, 140);
  }
  function renderExperiments() {
    $('experiments-body').replaceChildren();
    for (const item of state.experiments) {
      const row = document.createElement('tr'); row.dataset.percent = item.percent;
      row.classList.toggle('active-row', Number($('percent').value) === item.percent);
      row.innerHTML = `<td><button type="button" class="row-button" aria-label="Показати збереження ${item.percent}%">${item.percent}%</button></td><td>${number(item.dct.retained)}</td><td>${psnr(item.dct.psnr)}</td><td>${psnr(item.dwt.psnr)}</td>`;
      row.addEventListener('click', () => { if (!state.busy) updatePercent(item.percent, true); });
      $('experiments-body').append(row);
    }
    chart();
  }
  function chart() {
    const data = state.experiments;
    const finite = data.flatMap(row => [row.dct.psnr, row.dwt.psnr]).filter(Number.isFinite);
    const min = finite.length ? Math.max(0, Math.floor(Math.min(...finite) / 5) * 5 - 5) : 0;
    const max = finite.length ? Math.ceil(Math.max(...finite) / 5) * 5 + 5 : 50;
    const x = percent => 48 + (percent - 5) / 30 * 335;
    const y = value => Number.isFinite(value) ? 170 - (value - min) / (max - min) * 145 : 19;
    let svg = '';
    for (let i = 0; i <= 4; i++) {
      const value = min + (max - min) * i / 4, yy = y(value);
      svg += `<line x1="42" x2="392" y1="${yy}" y2="${yy}" stroke="#eeebf4" stroke-dasharray="3 5"/><text x="31" y="${yy + 3}" text-anchor="end" fill="#aaa1b8" font-size="9">${Math.round(value)}</text>`;
    }
    for (const row of data) svg += `<text x="${x(row.percent)}" y="193" text-anchor="middle" fill="#aaa1b8" font-size="10">${row.percent}%</text>`;
    for (const [method, color] of [['dct', '#7955d8'], ['dwt', '#339e95']]) {
      svg += `<polyline points="${data.map(row => `${x(row.percent)},${y(row[method].psnr)}`).join(' ')}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`;
      for (const row of data) svg += `<circle cx="${x(row.percent)}" cy="${y(row[method].psnr)}" r="4" fill="white" stroke="${color}" stroke-width="2"><title>${method.toUpperCase()}, ${row.percent}%: ${psnr(row[method].psnr)} дБ</title></circle>${Number.isFinite(row[method].psnr) ? '' : `<text x="${x(row.percent)}" y="12" fill="${color}" font-size="11" text-anchor="middle">∞</text>`}`;
    }
    $('quality-chart').innerHTML = svg;
  }
  function saveBlob(blob, filename) {
    const url = URL.createObjectURL(blob), link = document.createElement('a');
    link.href = url; link.download = filename; document.body.append(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
  }
  function csv() {
    if (!state.experiments.length) return toast('Дочекайтеся завершення експериментів.');
    const header = 'sample,width,height,dwt_levels,retained_percent,method,selected,total,significant,mse,psnr_db';
    const quote = text => `"${String(text).replaceAll('"', '""')}"`;
    const rows = state.experiments.flatMap(item => ['dct', 'dwt'].map(method => {
      const r = item[method]; return [quote(state.source.name), r.width, r.height, $('levels').value, item.percent, method.toUpperCase(), r.retained, r.total, r.significant, r.mse, Number.isFinite(r.psnr) ? r.psnr : 'Infinity'].join(',');
    }));
    saveBlob(new Blob(['\uFEFF' + [header, ...rows].join('\r\n')], { type: 'text/csv;charset=utf-8' }), 'dct-dwt-experiments.csv');
  }
  function downloadComparison() {
    if (!state.current) return toast('Дочекайтеся відновлення зображень.');
    const { width, height } = state.source, gap = 20, header = 70, bottom = 65;
    const canvas = document.createElement('canvas'); canvas.width = width * 3 + gap * 4; canvas.height = height + header + bottom;
    const ctx = canvas.getContext('2d'); ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#292333'; ctx.font = 'bold 18px sans-serif'; ctx.fillText(`DCT / DWT · Збережено ${state.current.dct.percent}% · Хаар: ${$('levels').value}`, gap, 26);
    for (const [i, method] of ['original', 'dct', 'dwt'].entries()) {
      const left = gap + i * (width + gap); ctx.font = '14px sans-serif'; ctx.fillStyle = method === 'dct' ? '#7955d8' : method === 'dwt' ? '#339e95' : '#292333';
      ctx.fillText(method === 'original' ? 'Original' : `${method.toUpperCase()} · PSNR ${psnr(state.current[method].psnr)} дБ`, left, 54);
      ctx.drawImage($(`${method}-canvas`), left, header, width, height);
    }
    ctx.fillStyle = '#766d82'; ctx.font = '12px sans-serif'; ctx.fillText('Левківський Євгеній Сергійович · ІПС-41', gap, canvas.height - 34);
    ctx.fillText('Частка коефіцієнтів не визначає розмір закодованого файлу.', gap, canvas.height - 14);
    canvas.toBlob(blob => { if (blob) saveBlob(blob, 'original-dct-dwt.png'); }, 'image/png');
  }
  function loadSample() {
    const id = $('sample-select').value;
    if (id !== 'custom') setSource(Samples.create(id, Number($('max-size').value)));
  }
  let uploadedImage = null;
  function processUpload() {
    const { image, name } = uploadedImage, max = Number($('max-size').value);
    const scale = Math.min(1, max / Math.max(image.naturalWidth, image.naturalHeight));
    const width = Math.max(1, Math.round(image.naturalWidth * scale)), height = Math.max(1, Math.round(image.naturalHeight * scale));
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, width, height); ctx.drawImage(image, 0, 0, width, height);
    const rgba = ctx.getImageData(0, 0, width, height).data, pixels = new Uint8ClampedArray(width * height);
    for (let i = 0; i < pixels.length; i++) pixels[i] = Math.round(0.299 * rgba[i * 4] + 0.587 * rgba[i * 4 + 1] + 0.114 * rgba[i * 4 + 2]);
    $('sample-select').value = 'custom'; setSource({ pixels, width, height, name });
  }
  $('upload-button').addEventListener('click', () => $('file-input').click());
  $('file-input').addEventListener('change', event => {
    const file = event.target.files[0]; event.target.value = '';
    if (!file) return;
    if (file.size > 20 * 1024 ** 2) return toast('Оберіть зображення розміром до 20 МБ.');
    const url = URL.createObjectURL(file), image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      if (image.naturalWidth * image.naturalHeight > 40_000_000) return toast('Максимальна площа вхідного зображення — 40 мегапікселів.');
      uploadedImage = { image, name: file.name }; processUpload();
    };
    image.onerror = () => { URL.revokeObjectURL(url); toast('Не вдалося прочитати файл. Спробуйте PNG, JPG, WebP або BMP.'); };
    image.src = url;
  });
  $('sample-select').addEventListener('change', () => { if ($('sample-select').value === 'custom' && uploadedImage) processUpload(); else loadSample(); });
  $('levels').addEventListener('change', () => { if (state.source) setSource(state.source); });
  $('max-size').addEventListener('change', () => { if ($('sample-select').value === 'custom' && uploadedImage) processUpload(); else loadSample(); });
  $('percent').addEventListener('input', event => updatePercent(event.target.value));
  document.querySelectorAll('button[data-percent]').forEach(button => button.addEventListener('click', () => updatePercent(button.dataset.percent, true)));
  $('export-csv').addEventListener('click', csv); $('download-images').addEventListener('click', downloadComparison);
  document.querySelectorAll('[data-zoom]').forEach(button => button.addEventListener('click', () => {
    const method = button.dataset.zoom, sourceCanvas = $(`${method}-canvas`), target = $('zoom-canvas');
    target.width = sourceCanvas.width; target.height = sourceCanvas.height; target.getContext('2d').drawImage(sourceCanvas, 0, 0);
    $('dialog-title').textContent = method === 'original' ? 'Original · Оригінал' : `${method.toUpperCase()} · PSNR ${state.current ? psnr(state.current[method].psnr) : '—'} дБ`;
    $('image-dialog').showModal();
  }));
  $('close-dialog').addEventListener('click', () => $('image-dialog').close());
  $('image-dialog').addEventListener('click', event => { if (event.target === $('image-dialog')) { const rect = event.target.getBoundingClientRect(); if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) event.target.close(); } });
  document.querySelectorAll('.nav-link[href^="#"]').forEach(link => link.addEventListener('click', () => { document.querySelectorAll('.nav-link').forEach(item => item.classList.remove('active')); link.classList.add('active'); }));
  updatePercent(15); loadSample();
})();
