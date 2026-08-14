import { prisma } from '@/lib/prisma';
import { notFound } from 'next/navigation';
import { ReviewClient } from './ReviewClient';

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const dropbox = await prisma.dropbox.findUnique({ where: { id }, include: { destinationAlbum: { select: { id: true, name: true } } } });
  if (!dropbox) notFound();
  // Ordered by path so each album follows its parent, which is what lets the
  // picker render the hierarchy from a flat list.
  const albums = await prisma.album.findMany({
    select: { id: true, name: true, path: true },
    orderBy: { path: 'asc' },
  });
  return <ReviewClient dropboxId={id} dropboxName={dropbox.name} destinationAlbumId={dropbox.destinationAlbumId} albums={albums} />;
}
