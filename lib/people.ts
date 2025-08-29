import { prisma } from '@/lib/prisma';

function parseEmbedding(json: string | null): number[] | null {
  if (!json) return null;
  try {
    const arr = JSON.parse(json);
    if (Array.isArray(arr)) return arr.map((v) => Number(v));
  } catch {}
  return null;
}

function normalize(v: number[]): number[] {
  let mag = 0;
  for (const x of v) mag += x * x;
  mag = Math.sqrt(mag);
  if (mag === 0) return v.slice();
  return v.map((x) => x / mag);
}

export async function updatePersonCentroid(personId: string): Promise<void> {
  // Fetch embeddings for this person's faces (only valid embeddings)
  const rows = await prisma.face.findMany({
    where: { personId, hasEmbedding: true, embedding: { not: null }, ignored: { not: true } },
    select: { embedding: true },
    take: 2000, // safety cap
    orderBy: { confidence: 'desc' },
  });

  const embs: number[][] = [];
  for (const r of rows) {
    const e = parseEmbedding(r.embedding as any);
    if (e && e.length) embs.push(normalize(e));
  }

  if (embs.length === 0) {
    await prisma.person.update({ where: { id: personId }, data: { centroidEmbedding: null } });
    return;
  }

  const dim = embs[0].length;
  const acc = new Array(dim).fill(0) as number[];
  for (const e of embs) {
    for (let i = 0; i < dim; i++) acc[i] += e[i];
  }
  for (let i = 0; i < dim; i++) acc[i] /= embs.length;

  await prisma.person.update({ where: { id: personId }, data: { centroidEmbedding: JSON.stringify(acc) } });
}

export async function rebuildAllPersonCentroids(limit?: number): Promise<{ updated: number }>{
  const people = await prisma.person.findMany({ select: { id: true }, take: limit });
  let updated = 0;
  for (const p of people) {
    try { await updatePersonCentroid(p.id); updated++; } catch {}
  }
  return { updated };
}

