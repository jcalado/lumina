import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { scanner } from '@/lib/filesystem'

// GET /api/admin/albums/filesystem - List filesystem album paths
export async function GET() {
  const authResult = await requireAdmin()
  if (authResult instanceof NextResponse) {
    return authResult
  }

  try {
    const paths = await scanner.getAllAlbums()
    const albums = await Promise.all(paths.map(async (p) => {
      const counts = await scanner.countMedia(p)
      return { path: p, name: p.split('/').pop() || p, counts }
    }))
    return NextResponse.json({ albums })
  } catch (error) {
    console.error('Error listing filesystem albums:', error)
    return NextResponse.json({ error: 'Failed to list filesystem albums' }, { status: 500 })
  }
}
