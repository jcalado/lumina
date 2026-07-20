import { prisma } from '@/lib/prisma';
import { notFound } from 'next/navigation';
import { ReviewClient } from './ReviewClient';

export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const dropbox = await prisma.dropbox.findUnique({ where: { id }, include: { destinationAlbum: { select: { id: true, name: true } } } });
  if (!dropbox) notFound();
  const albums = await prisma.album.findMany({ select: { id: true, name: true }, orderBy: { name: 'asc' } });
  return <ReviewClient dropboxId={id} dropboxName={dropbox.name} destinationAlbumId={dropbox.destinationAlbumId} albums={albums} />;
}
