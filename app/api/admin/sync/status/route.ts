import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSyncQueue } from '@/lib/queues/syncQueue'

export async function GET() {
  try {
    // Get the most recent sync job from database
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

    let bullmqJobInfo: any = null
    if (currentJob) {
      try {
        // Get BullMQ job information
        const queue = getSyncQueue()
        const bullmqJob = await queue.getJob(currentJob.id)
        
        if (bullmqJob) {
          const state = await bullmqJob.getState()
          const progress = bullmqJob.progress
          
          bullmqJobInfo = {
            id: bullmqJob.id,
            state,
            progress,
            data: bullmqJob.data,
            opts: bullmqJob.opts,
            attemptsMade: bullmqJob.attemptsMade,
            finishedOn: bullmqJob.finishedOn,
            processedOn: bullmqJob.processedOn,
            failedReason: bullmqJob.failedReason
          }
        }
      } catch (error) {
        console.warn('Failed to get BullMQ job info:', error)
      }
    }

    return NextResponse.json({ 
      currentJob: currentJob ? {
        ...currentJob,
        startedAt: currentJob.startedAt?.toISOString() || null,
        completedAt: currentJob.completedAt?.toISOString() || null,
        albumProgress: currentJob.albumProgress ? JSON.parse(currentJob.albumProgress) : null,
        logs: currentJob.logs ? JSON.parse(currentJob.logs) : []
      } : null,
      bullmqJob: bullmqJobInfo
    })
  } catch (error) {
    console.error('Error fetching sync status:', error)
    return NextResponse.json(
      { error: 'Failed to fetch sync status' },
      { status: 500 }
    )
  }
}
