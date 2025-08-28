import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET: Get photo processing statistics
export async function GET(request: NextRequest) {
  try {
    // Get total photos count
    const totalResult = await prisma.$queryRaw<{ count: number }[]>`
      SELECT COUNT(*) as count FROM "photos"
    `;
    const total = typeof totalResult[0]?.count === 'bigint' 
      ? Number(totalResult[0].count) 
      : Number(totalResult[0]?.count || 0);

    // Get processed photos count
    const processedResult = await prisma.$queryRaw<{ count: number }[]>`
      SELECT COUNT(*) as count FROM "photos" WHERE "faceProcessedAt" IS NOT NULL
    `;
    const processed = typeof processedResult[0]?.count === 'bigint' 
      ? Number(processedResult[0].count) 
      : Number(processedResult[0]?.count || 0);

    const unprocessed = total - processed;

    return NextResponse.json({
      total,
      processed,
      unprocessed,
      percentage: total > 0 ? Math.round((processed / total) * 100) : 0
    });
  } catch (error) {
    console.error('Error fetching photo stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch photo statistics', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
