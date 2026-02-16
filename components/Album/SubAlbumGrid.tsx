'use client';

import Link from 'next/link';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Image, Folder, Images } from 'lucide-react';
import { ScrubThumbnail } from '@/components/Gallery/ScrubThumbnail';
import type { SubAlbumData } from '@/lib/types/album';

// Utility function to format date range
function formatDateRange(dateRange: { earliest: string | null; latest: string | null } | null | undefined): string {
  if (!dateRange || !dateRange.earliest) return '';
  const earliest = new Date(dateRange.earliest);
  const latest = dateRange.latest ? new Date(dateRange.latest) : earliest;
  const earliestMonth = earliest.toLocaleString('default', { month: 'long' });
  const earliestYear = earliest.getFullYear();
  const latestMonth = latest.toLocaleString('default', { month: 'long' });
  const latestYear = latest.getFullYear();
  if (earliestMonth === latestMonth && earliestYear === latestYear) return `${earliestMonth} ${earliestYear}`;
  if (earliestYear === latestYear) return `${earliestMonth} - ${latestMonth} ${earliestYear}`;
  return `${earliestMonth} ${earliestYear} - ${latestMonth} ${latestYear}`;
}

interface SubAlbumGridProps {
  subAlbums: SubAlbumData[];
}

export function SubAlbumGrid({ subAlbums }: SubAlbumGridProps) {
  if (subAlbums.length === 0) return null;

  return (
    <div>
      <h2 className="text-xl font-semibold mb-4">Albums</h2>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-4 mb-6">
        {subAlbums.map((subAlbum) => (
          <div key={subAlbum.id} className="relative">
            <Link href={`/albums/${subAlbum.slugPath || encodeURIComponent(subAlbum.path)}`}>
              <Card className="h-full hover:shadow-lg transition-shadow cursor-pointer group">
                <CardContent className="p-0">
                  <div className="aspect-[4/3] bg-muted relative overflow-hidden rounded-t-lg">
                    <ScrubThumbnail
                      thumbnails={subAlbum.thumbnails.map(t => ({
                        mediaId: t.mediaId,
                        filename: t.filename,
                        mediaType: t.mediaType,
                      }))}
                      albumName={subAlbum.name}
                    />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors pointer-events-none">
                      <div className="absolute top-2 left-2 pointer-events-auto">
                        <div className="bg-black/60 rounded-full p-1.5">
                          <Images className="w-4 h-4 text-white" />
                        </div>
                      </div>
                      <div className="absolute top-2 right-2 flex gap-1 pointer-events-auto">
                        {subAlbum.totalPhotoCount > 0 && (
                          <Badge className="bg-black/60 text-white text-xs hover:bg-black/60">
                            <Image className="w-3 h-3 mr-1" />
                            {subAlbum.totalPhotoCount}
                          </Badge>
                        )}
                        {subAlbum.subAlbumsCount > 0 && (
                          <Badge className="bg-black/60 text-white text-xs hover:bg-black/60">
                            <Folder className="w-3 h-3 mr-1" />
                            {subAlbum.subAlbumsCount}
                          </Badge>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="p-4">
                    <div className="flex items-start justify-between mb-1">
                      <h3 className="font-medium text-sm line-clamp-2 flex-1">{subAlbum.name}</h3>
                      {subAlbum.dateRange && formatDateRange(subAlbum.dateRange) && (
                        <span className="text-xs text-muted-foreground ml-2 flex-shrink-0">
                          {formatDateRange(subAlbum.dateRange)}
                        </span>
                      )}
                    </div>
                    {subAlbum.description && (
                      <p className="text-xs text-muted-foreground line-clamp-2">{subAlbum.description}</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
