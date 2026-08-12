import { prisma } from '@/lib/prisma';
import { DropboxList } from './DropboxList';

export default async function AdminDropboxesPage() {
  // Ordered by path so each album follows its parent, which is what lets the
  // picker render the hierarchy from a flat list.
  const albums = await prisma.album.findMany({
    select: { id: true, name: true, path: true },
    orderBy: { path: 'asc' },
  });
  return <DropboxList albums={albums} />;
}
