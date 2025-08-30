import { prisma } from '@/lib/prisma';
import { parsePgvectorText, toPgvectorLiteral, normalizeVector } from '@/lib/vector-utils';
import { randomUUID } from 'crypto';

function l2(a: number[], b: number[]): number {
  let s = 0; for (let i = 0; i < a.length; i++) { const d = a[i]-b[i]; s += d*d; } return Math.sqrt(s);
}

export async function recomputePersonPrototypes(personId: string): Promise<void> {
  const rows = await prisma.$queryRaw<Array<{ id: string; v: string }>>`
    SELECT id, embedding AS v
    FROM faces
    WHERE "personId" = ${personId} AND embedding IS NOT NULL AND ignored = false
    ORDER BY confidence DESC
    LIMIT 200
  `;
  const faces = rows.map((r) => ({ id: r.id, vec: parsePgvectorText(r.v) })).filter((r) => r.vec.length > 0);
  await prisma.personPrototype.deleteMany({ where: { personId } }).catch(() => {});
  if (faces.length === 0) return;
  const k = Math.min(3, Math.max(1, faces.length));
  const chosen: number[][] = [];
  chosen.push(normalizeVector(faces[0].vec));
  if (k >= 2 && faces.length >= 2) {
    let bestIdx = 1, bestDist = -1;
    for (let i = 1; i < faces.length; i++) {
      const d = l2(chosen[0], faces[i].vec);
      if (d > bestDist) { bestDist = d; bestIdx = i; }
    }
    chosen.push(normalizeVector(faces[bestIdx].vec));
  }
  if (k >= 3 && faces.length >= 3) {
    const mean = chosen[0].map((v, i) => (v + (chosen[1] || chosen[0])[i]) / 2);
    let bestIdx = 2, bestDist = -1;
    for (let i = 2; i < faces.length; i++) {
      const d = l2(mean, faces[i].vec);
      if (d > bestDist) { bestDist = d; bestIdx = i; }
    }
    chosen.push(normalizeVector(faces[bestIdx].vec));
  }
  for (const v of chosen) {
    const lit = toPgvectorLiteral(v);
    const id = 'proto_' + randomUUID().replace(/-/g, '');
    await prisma.$executeRawUnsafe(
      `INSERT INTO person_prototypes (id, "personId", embedding_vec, weight) VALUES ($1, $2, $3::vector, $4)`,
      id,
      personId,
      lit,
      1.0 / chosen.length,
    );
  }
}
