// Simple, deterministic LSH utilities (random hyperplane, banded signatures)

function seededPRNG(seed: number) {
  // xorshift32
  let x = seed | 0;
  return () => {
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    // Map to [0,1)
    return ((x >>> 0) % 0xFFFFFFFF) / 0xFFFFFFFF;
  };
}

function makePlanes(dim: number, bits: number, seed = 1337): number[][] {
  const rnd = seededPRNG(seed);
  const planes: number[][] = [];
  for (let b = 0; b < bits; b++) {
    const v = new Array(dim);
    for (let i = 0; i < dim; i++) {
      // Uniform in [-1,1)
      v[i] = rnd() * 2 - 1;
    }
    planes.push(v);
  }
  return planes;
}

export interface LSHParams {
  bands: number;
  rowsPerBand: number;
  seed?: number;
}

export function buildLSHBuckets(embeddings: number[][], params: LSHParams): Map<string, number[]> {
  const { bands, rowsPerBand, seed = 1337 } = params;
  if (embeddings.length === 0) return new Map();
  const dim = embeddings[0].length;
  const bits = bands * rowsPerBand;
  const planes = makePlanes(dim, bits, seed);

  const buckets = new Map<string, number[]>();
  for (let idx = 0; idx < embeddings.length; idx++) {
    const e = embeddings[idx];
    // Build signature bits
    const sig: number[] = new Array(bits);
    for (let b = 0; b < bits; b++) {
      let dot = 0;
      const p = planes[b];
      for (let k = 0; k < dim; k++) dot += e[k] * p[k];
      sig[b] = dot >= 0 ? 1 : 0;
    }
    // Band into buckets
    for (let band = 0; band < bands; band++) {
      let keyBits = '';
      const start = band * rowsPerBand;
      for (let r = 0; r < rowsPerBand; r++) keyBits += sig[start + r];
      const key = band + ':' + keyBits;
      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key)!.push(idx);
    }
  }
  return buckets;
}

