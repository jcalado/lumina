import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { pathToSlugPath, slugPathToPath } from '@/lib/slug-paths';

export async function POST(request: NextRequest) {
  try {
    const { paths } = await request.json();
    
    if (!Array.isArray(paths)) {
      return NextResponse.json(
        { error: 'paths must be an array' },
        { status: 400 }
      );
    }

    console.log('Breadcrumb API received paths:', paths);

    const breadcrumbs = await Promise.all(
      paths.map(async (slugPath: string) => {
        try {
          // Convert slug path to filesystem path
          const filesystemPath = await slugPathToPath(slugPath);
          console.log(`Converting slug path "${slugPath}" to filesystem path "${filesystemPath}"`);
          
          if (!filesystemPath) {
            console.log(`Could not convert slug path "${slugPath}"`);
            // Fallback to path segment
            const segments = slugPath.split('/');
            const lastSegment = segments[segments.length - 1];
            return {
              name: decodeURIComponent(lastSegment),
              path: slugPath,
              slugPath: slugPath,
              href: `/albums/${slugPath}`
            };
          }

          // Get album info using filesystem path
          const album = await prisma.album.findUnique({
            where: { path: filesystemPath },
            select: { name: true, path: true }
          });

          console.log(`Album lookup for "${filesystemPath}":`, album);

          if (album) {
            const slugPathForUrl = await pathToSlugPath(album.path);
            return {
              name: album.name,
              path: slugPath, // Keep the slug path for the breadcrumb
              slugPath: slugPathForUrl || slugPath,
              href: `/albums/${slugPathForUrl || slugPath}`
            };
          } else {
            console.log(`Album not found for filesystem path "${filesystemPath}"`);
            // Fallback to path segment
            const segments = slugPath.split('/');
            const lastSegment = segments[segments.length - 1];
            return {
              name: decodeURIComponent(lastSegment),
              path: slugPath,
              slugPath: slugPath,
              href: `/albums/${slugPath}`
            };
          }
        } catch (error) {
          console.error('Error processing breadcrumb path:', slugPath, error);
          // Fallback
          const segments = slugPath.split('/');
          const lastSegment = segments[segments.length - 1];
          return {
            name: decodeURIComponent(lastSegment),
            path: slugPath,
            slugPath: slugPath,
            href: `/albums/${slugPath}`
          };
        }
      })
    );

    console.log('Breadcrumb API returning:', breadcrumbs);
    return NextResponse.json({ breadcrumbs });
  } catch (error) {
    console.error('Error in breadcrumbs API:', error);
    return NextResponse.json(
      { error: 'Failed to fetch breadcrumbs' },
      { status: 500 }
    );
  }
}
