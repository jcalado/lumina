import { notFound } from 'next/navigation';
import { Metadata } from 'next';
import { getAlbumPageData } from '@/lib/data/album';
import { AlbumClient } from './album-client';

interface AlbumPageProps {
  params: Promise<{ path: string[] }>;
}

export async function generateMetadata({ params }: AlbumPageProps): Promise<Metadata> {
  const { path } = await params;
  const slugPath = path.map(s => decodeURIComponent(s)).join('/');
  const data = await getAlbumPageData(slugPath);
  if (!data) return { title: 'Album Not Found' };
  return {
    title: data.album.name,
    description: data.album.description || `Photo album: ${data.album.name}`,
    openGraph: data.ogImageUrl
      ? {
          images: [{ url: data.ogImageUrl }],
        }
      : undefined,
  };
}

export default async function AlbumPage({ params }: AlbumPageProps) {
  const { path } = await params;
  const slugPath = path.map(s => decodeURIComponent(s)).join('/');
  const data = await getAlbumPageData(slugPath);
  if (!data) notFound();
  return <AlbumClient initialData={data} slugPath={slugPath} />;
}
