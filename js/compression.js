/* Власні перетворення: жодних готових dct/dwt або сторонніх бібліотек. */
(function (root) {
  'use strict';
  const BLOCK = 8;
  const EPSILON = 1e-9;
  // Ортонормована матриця DCT-II: C[k,n] = α(k) cos(π(2n+1)k/16).
  const C = Array.from({ length: BLOCK }, (_, k) => Float64Array.from(
    { length: BLOCK }, (_, n) => (k === 0 ? Math.sqrt(1 / BLOCK) : Math.sqrt(2 / BLOCK))
      * Math.cos(Math.PI * (2 * n + 1) * k / (2 * BLOCK))));

  function dimensions(data, width, height) {
    if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1
      || data.length !== width * height) throw new RangeError('Некоректні розміри масиву.');
  }

  function dct2(data, width, height, inverse = false) {
    dimensions(data, width, height);
    if (width % BLOCK || height % BLOCK) throw new RangeError('DCT потребує розмірів, кратних 8.');
    const output = new Float64Array(data.length);
    const temp = new Float64Array(64);
    for (let by = 0; by < height; by += BLOCK) {
      for (let bx = 0; bx < width; bx += BLOCK) {
        // Пряме: T = C·B, A = T·Cᵀ. Обернене: T = Cᵀ·A, B = T·C.
        for (let r = 0; r < BLOCK; r++) {
          for (let col = 0; col < BLOCK; col++) {
            let sum = 0;
            for (let k = 0; k < BLOCK; k++) sum += (inverse ? C[k][r] : C[r][k]) * data[(by + k) * width + bx + col];
            temp[r * BLOCK + col] = sum;
          }
        }
        for (let r = 0; r < BLOCK; r++) {
          for (let col = 0; col < BLOCK; col++) {
            let sum = 0;
            for (let k = 0; k < BLOCK; k++) sum += temp[r * BLOCK + k] * (inverse ? C[k][col] : C[col][k]);
            output[(by + r) * width + bx + col] = sum;
          }
        }
      }
    }
    return output;
  }

  function haar2(data, width, height, levels = 3, inverse = false) {
    dimensions(data, width, height);
    if (!Number.isInteger(levels) || levels < 1 || levels > 10 || width % (2 ** levels) || height % (2 ** levels)) {
      throw new RangeError('Розміри DWT мають бути кратними 2^L.');
    }
    const out = Float64Array.from(data);
    const temp = new Float64Array(Math.max(width, height));
    const scale = Math.SQRT1_2;
    for (let step = 0; step < levels; step++) {
      const level = inverse ? levels - step - 1 : step;
      const w = width / (2 ** level), h = height / (2 ** level);
      if (!inverse) {
        // Рядки: середні ліворуч, різниці праворуч.
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w / 2; x++) {
            const a = out[y * width + 2 * x], b = out[y * width + 2 * x + 1];
            temp[x] = (a + b) * scale;
            temp[x + w / 2] = (a - b) * scale;
          }
          for (let x = 0; x < w; x++) out[y * width + x] = temp[x];
        }
        // Стовпці. Наступний рівень обробляє тільки LL у верхньому лівому куті.
        for (let x = 0; x < w; x++) {
          for (let y = 0; y < h / 2; y++) {
            const a = out[2 * y * width + x], b = out[(2 * y + 1) * width + x];
            temp[y] = (a + b) * scale;
            temp[y + h / 2] = (a - b) * scale;
          }
          for (let y = 0; y < h; y++) out[y * width + x] = temp[y];
        }
      } else {
        // Зворотний порядок: спочатку стовпці, потім рядки.
        for (let x = 0; x < w; x++) {
          for (let y = 0; y < h / 2; y++) {
            const a = out[y * width + x], d = out[(y + h / 2) * width + x];
            temp[2 * y] = (a + d) * scale;
            temp[2 * y + 1] = (a - d) * scale;
          }
          for (let y = 0; y < h; y++) out[y * width + x] = temp[y];
        }
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w / 2; x++) {
            const a = out[y * width + x], d = out[y * width + x + w / 2];
            temp[2 * x] = (a + d) * scale;
            temp[2 * x + 1] = (a - d) * scale;
          }
          for (let x = 0; x < w; x++) out[y * width + x] = temp[x];
        }
      }
    }
    return out;
  }

  function rankCoefficients(coefficients) {
    // Стабільний порядок при однакових модулях дає точно K вибраних позицій.
    return Uint32Array.from({ length: coefficients.length }, (_, i) => i).sort(
      (a, b) => Math.abs(coefficients[b]) - Math.abs(coefficients[a]) || a - b);
  }

  function retain(coefficients, percent, ranked = rankCoefficients(coefficients)) {
    if (!Number.isFinite(percent) || percent < 0 || percent > 100) throw new RangeError('Частка має бути від 0 до 100%.');
    const count = Math.round(coefficients.length * percent / 100);
    const values = new Float64Array(coefficients.length);
    let significant = 0;
    for (let i = 0; i < count; i++) {
      const index = ranked[i];
      values[index] = coefficients[index];
      if (Math.abs(values[index]) > EPSILON) significant++;
    }
    return { values, count, significant };
  }

  function quality(original, restored) {
    if (!original.length || original.length !== restored.length) throw new RangeError('Масиви для PSNR мають однаковий ненульовий розмір.');
    let squaredError = 0;
    for (let i = 0; i < original.length; i++) squaredError += (original[i] - restored[i]) ** 2;
    const mse = squaredError / original.length;
    return { mse, psnr: mse === 0 ? Infinity : 10 * Math.log10(255 ** 2 / mse) };
  }

  function prepare(pixels, width, height, levels = 3) {
    dimensions(pixels, width, height);
    if (!Number.isInteger(levels) || levels < 1 || levels > 10) throw new RangeError('Некоректна глибина DWT.');
    const unit = Math.max(BLOCK, 2 ** levels);
    const paddedWidth = Math.ceil(width / unit) * unit;
    const paddedHeight = Math.ceil(height / unit) * unit;
    const centered = new Float64Array(paddedWidth * paddedHeight);
    for (let y = 0; y < paddedHeight; y++) {
      for (let x = 0; x < paddedWidth; x++) {
        // Доповнення найближчим крайовим пікселем, однакове для двох методів.
        centered[y * paddedWidth + x] = pixels[Math.min(y, height - 1) * width + Math.min(x, width - 1)] - 128;
      }
    }
    const dct = dct2(centered, paddedWidth, paddedHeight);
    const dwt = haar2(centered, paddedWidth, paddedHeight, levels);
    const ranks = { dct: rankCoefficients(dct), dwt: rankCoefficients(dwt) };
    return { original: Uint8ClampedArray.from(pixels), width, height, paddedWidth, paddedHeight, levels, dct, dwt, ranks };
  }

  function reconstruct(prepared, method, percent) {
    if (method !== 'dct' && method !== 'dwt') throw new RangeError('Невідомий метод.');
    const { width, height, paddedWidth, paddedHeight, levels } = prepared;
    const kept = retain(prepared[method], percent, prepared.ranks[method]);
    const restored = method === 'dct' ? dct2(kept.values, paddedWidth, paddedHeight, true)
      : haar2(kept.values, paddedWidth, paddedHeight, levels, true);
    const pixels = new Uint8ClampedArray(width * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) pixels[y * width + x] = Math.max(0, Math.min(255, Math.round(restored[y * paddedWidth + x] + 128)));
    }
    return {
      pixels, method, percent, retained: kept.count, significant: kept.significant,
      total: restored.length, width, height, ...quality(prepared.original, pixels)
    };
  }

  const api = { BLOCK, EPSILON, C, dct2, haar2, rankCoefficients, retain, quality, prepare, reconstruct };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Compression = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
