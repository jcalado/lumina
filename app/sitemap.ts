import { MetadataRoute } from 'next';
import { prisma } from '@/lib/prisma';

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';

  const entries: MetadataRoute.Sitemap = [
    {
      url: baseUrl,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 1,
    },
    {
      url: `${baseUrl}/favorites`,
      lastModified: new Date(),
      changeFrequency: 'weekly',
      priority: 0.5,
    },
  ];

  try {
    const albums = await prisma.album.findMany({
      where: {
        status: 'PUBLIC',
        enabled: true,
      },
      select: {
        slug: true,
        path: true,
        updatedAt: true,
      },
    });

    for (const album of albums) {
      entries.push({
        url: `${baseUrl}/albums/${album.slug}`,
        lastModified: album.updatedAt,
        changeFrequency: 'weekly',
        priority: 0.8,
      });
    }
  } catch {
    // If database is not available, return base entries only
  }

  return entries;
}
