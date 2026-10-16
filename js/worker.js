'use strict';
importScripts('compression.js');
let prepared;
self.onmessage = ({ data }) => {
  try {
    const { id, type, payload } = data;
    let result;
    if (type === 'prepare') {
      prepared = Compression.prepare(payload.pixels, payload.width, payload.height, payload.levels);
      result = { paddedWidth: prepared.paddedWidth, paddedHeight: prepared.paddedHeight };
    } else if (type === 'preview') {
      result = { dct: Compression.reconstruct(prepared, 'dct', payload.percent), dwt: Compression.reconstruct(prepared, 'dwt', payload.percent) };
    } else if (type === 'experiments') {
      result = payload.percents.map(percent => ({ percent,
        dct: Compression.reconstruct(prepared, 'dct', percent), dwt: Compression.reconstruct(prepared, 'dwt', percent) }));
    } else throw new Error('Невідома операція.');
    self.postMessage({ id, result });
  } catch (error) { self.postMessage({ id: data.id, error: error.message }); }
};
