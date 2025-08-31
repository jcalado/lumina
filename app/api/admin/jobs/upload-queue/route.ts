import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { getUploadQueue } from '@/lib/queues/uploadQueue'

export async function GET() {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth

  const queue = getUploadQueue()
  const [waiting, active, completed, failed, delayed, paused] = await Promise.all([
    queue.getWaitingCount(),
    queue.getActiveCount(),
    queue.getCompletedCount(),
    queue.getFailedCount(),
    queue.getDelayedCount(),
    queue.isPaused().then(v => v ? 1 : 0)
  ])
  return NextResponse.json({ waiting, active, completed, failed, delayed, paused })
}
