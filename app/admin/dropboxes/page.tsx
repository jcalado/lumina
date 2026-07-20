import { prisma } from '@/lib/prisma';
import { DropboxList } from './DropboxList';

export default async function AdminDropboxesPage() {
  const albums = await prisma.album.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } });
  return <DropboxList albums={albums} />;
}
