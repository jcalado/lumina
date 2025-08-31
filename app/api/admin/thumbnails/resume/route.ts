import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { getThumbnailQueue } from '@/lib/queues/thumbnailQueue'

export async function POST() {
  const auth = await requireAdmin()
  if (auth instanceof NextResponse) return auth
  try {
    await getThumbnailQueue().resume()
    return NextResponse.json({ success: true, message: 'Thumbnail queue resumed' })
  } catch (error) {
    return NextResponse.json({ error: 'Failed to resume queue' }, { status: 500 })
  }
}

