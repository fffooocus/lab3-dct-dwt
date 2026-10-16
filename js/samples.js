(function (root) {
  'use strict';
  const clamp = x => Math.max(0, Math.min(255, Math.round(x)));
  function noise(x, y, seed = 0) {
    let n = Math.imul(x + seed * 131, 374761393) + Math.imul(y, 668265263);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967295;
  }
  function smooth(x, y, seed) {
    const ix = Math.floor(x), iy = Math.floor(y);
    let fx = x - ix, fy = y - iy;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    return (noise(ix, iy, seed) * (1 - fx) + noise(ix + 1, iy, seed) * fx) * (1 - fy)
      + (noise(ix, iy + 1, seed) * (1 - fx) + noise(ix + 1, iy + 1, seed) * fx) * fy;
  }
  function fbm(x, y, seed) {
    let result = 0, weight = 0.5;
    for (let i = 0; i < 5; i++) { result += smooth(x, y, seed + i) * weight; x *= 2; y *= 2; weight *= 0.5; }
    return result;
  }
  const names = { landscape: 'Гірський пейзаж', texture: 'Текстури й частоти', geometry: 'Контури та градієнти' };
  function create(name = 'landscape', size = 512) {
    if (!Object.hasOwn(names, name)) throw new RangeError('Невідомий зразок.');
    const pixels = new Uint8ClampedArray(size * size);
    for (let y = 0; y < size; y++) {
      for (let x = 0; x < size; x++) {
        const u = x / size, v = y / size;
        let value;
        if (name === 'landscape') {
          const n = fbm(u * 7, v * 7, 23);
          value = 209 - v * 62 + (n - 0.5) * 14;
          const sun = Math.hypot(u - 0.76, v - 0.19);
          if (sun < 0.055) value = 248 - sun * 100;
          for (let layer = 0; layer < 5; layer++) {
            const ridge = 0.31 + layer * 0.105 + 0.065 * Math.sin(u * (8 + layer * 2) + layer * 1.8)
              + (fbm(u * (5 + layer * 2), 0.5, 73 + layer * 9) - 0.48) * 0.36;
            if (v > ridge) {
              value = 164 - layer * 27 + (fbm(u * (22 + layer * 7), v * 33, 100 + layer) - 0.5) * (27 + layer * 10)
                + Math.max(0, 0.05 - (v - ridge)) * 250;
              if (layer < 2 && v - ridge < 0.035 && smooth(u * 65, v * 80, 5) > 0.48) value += 40;
            }
          }
          if (v > 0.79) value = 82 + 62 * (v - 0.79) + 11 * Math.sin(v * 330 + n * 6) + fbm(u * 33, v * 70, 8) * 22;
          // Дрібні хвойні дерева на передньому плані створюють гострі контури.
          for (let t = 0; t < 9; t++) {
            const tx = 0.035 + t * 0.071, ty = 0.82 + noise(t, 3) * 0.12;
            const th = 0.055 + noise(t, 7) * 0.12;
            if (v > ty - th && v < ty && Math.abs(u - tx) < (v - ty + th) * 0.25) value = 22 + (v - ty + th) * 70;
          }
        } else if (name === 'texture') {
          if (u < 0.5 && v < 0.5) value = 128 + 100 * Math.sin(u * 100 + v * 50);
          else if (u >= 0.5 && v < 0.5) value = ((Math.floor(u * 64) + Math.floor(v * 64)) % 2) * 210 + 22;
          else if (u < 0.5) value = 15 + 225 * (u + v - 0.5);
          else value = 128 + 95 * Math.cos(Math.hypot(u - 0.75, v - 0.75) * 250);
        } else {
          value = 25 + 205 * u;
          if (Math.hypot(u - 0.3, v - 0.33) < 0.19) value = 232;
          if (u > 0.53 && u < 0.87 && v > 0.17 && v < 0.49) value = 42;
          if (v > 0.6 && v < 0.88 && u > 0.12 && u < 0.88) value = 120 + 100 * Math.sin(u * 110);
          if (Math.abs(v - u) < 0.004) value = 255;
        }
        pixels[y * size + x] = clamp(value);
      }
    }
    return { pixels, width: size, height: size, name: names[name], id: name };
  }
  const api = { create, names };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Samples = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
