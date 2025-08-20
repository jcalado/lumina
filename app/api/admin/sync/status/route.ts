import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    // Get the most recent sync job
    const currentJob = await prisma.syncJob.findFirst({
      orderBy: { createdAt: 'desc' },
      where: {
        OR: [
          { status: 'RUNNING' },
          { status: 'PENDING' },
          { completedAt: { gte: new Date(Date.now() - 5 * 60 * 1000) } } // Last 5 minutes
        ]
      }
    })

    return NextResponse.json({ 
      currentJob: currentJob ? {
        ...currentJob,
        startedAt: currentJob.startedAt?.toISOString() || null,
        completedAt: currentJob.completedAt?.toISOString() || null,
        albumProgress: currentJob.albumProgress ? JSON.parse(currentJob.albumProgress) : null,
        logs: currentJob.logs ? JSON.parse(currentJob.logs) : []
      } : null
    })
  } catch (error) {
    console.error('Error fetching sync status:', error)
    return NextResponse.json(
      { error: 'Failed to fetch sync status' },
      { status: 500 }
    )
  }
}
