export function normalizeVector(vec: number[]): number[] {
  let norm = 0;
  for (let i = 0; i < vec.length; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm);
  if (!isFinite(norm) || norm === 0) return vec.slice();
  const out = new Array(vec.length);
  for (let i = 0; i < vec.length; i++) out[i] = vec[i] / norm;
  return out;
}

export function meanVector(vectors: number[][]): number[] {
  if (!vectors.length) return [];
  const dim = vectors[0].length;
  const out = new Array(dim).fill(0) as number[];
  for (const v of vectors) {
    if (!v || v.length !== dim) continue;
    for (let i = 0; i < dim; i++) out[i] += v[i];
  }
  for (let i = 0; i < dim; i++) out[i] /= vectors.length;
  return out;
}

export function toPgvectorLiteral(vec: number[], precision = 6): string {
  // Returns a text literal compatible with pgvector input: '[x,y,...]'
  const parts = vec.map((v) => Number(v).toFixed(precision));
  return `[${parts.join(',')}]`;
}

export function parsePgvectorText(text: string): number[] {
  // Parses pgvector::text format like '[0.1,0.2,...]'
  const t = text.trim();
  const m = t.match(/^\s*\[([^\]]*)\]\s*$/);
  if (!m) return [];
  if (!m[1]) return [];
  return m[1].split(',').map((s) => parseFloat(s.trim())).filter((n) => Number.isFinite(n));
}

