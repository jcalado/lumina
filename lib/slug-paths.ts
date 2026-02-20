import { prisma } from './prisma';

/**
 * Builds a slug path from a filesystem path using a pre-fetched slug map.
 * This is the efficient variant for use in hot paths where ancestor slugs
 * have already been loaded (e.g. album page data, listing pages).
 *
 * @param fsPath - The filesystem path (e.g. "ACNAC/2023/Exploradores")
 * @param slugByPath - Map of filesystem path → slug
 * @returns The slug path (e.g. "acnac/2023/exploradores")
 */
export function buildSlugPathFromMap(fsPath: string, slugByPath: Map<string, string>): string {
  if (!fsPath) return '';
  const segments = fsPath.split('/');
  const slugSegments: string[] = [];
  let accum = '';
  for (const seg of segments) {
    accum = accum ? `${accum}/${seg}` : seg;
    const slug = slugByPath.get(accum);
    if (slug) {
      slugSegments.push(slug);
    } else {
      // Fallback: generate slug from segment name
      slugSegments.push(seg.toLowerCase().replace(/[^a-z0-9]+/g, '-'));
    }
  }
  return slugSegments.join('/');
}

/**
 * Converts a filesystem path to a hierarchical slug path.
 * Fetches all ancestor albums in a single query.
 *
 * @param path - The filesystem path (e.g. "ACNAC/2023/Exploradores")
 * @returns The slug path (e.g. "acnac/2023/exploradores")
 */
export async function pathToSlugPath(path: string): Promise<string> {
  if (!path) return '';

  const segments = path.split('/');
  // Build all ancestor paths including the path itself
  const ancestorPaths: string[] = [];
  let accum = '';
  for (const seg of segments) {
    accum = accum ? `${accum}/${seg}` : seg;
    ancestorPaths.push(accum);
  }

  const ancestors = await prisma.album.findMany({
    where: { path: { in: ancestorPaths } },
    select: { path: true, slug: true },
  });

  const slugByPath = new Map(ancestors.map((a) => [a.path, a.slug]));
  return buildSlugPathFromMap(path, slugByPath);
}

/**
 * Converts a hierarchical slug path back to a filesystem path.
 *
 * @param slugPath - The slug path (e.g. "acnac/2023/exploradores")
 * @returns The filesystem path, or null if not found
 */
export async function slugPathToPath(slugPath: string): Promise<string | null> {
  if (!slugPath) return '';

  const slugSegments = slugPath.split('/');
  let currentPath = '';

  // Build the path incrementally by resolving each slug segment
  for (let i = 0; i < slugSegments.length; i++) {
    const currentSlug = slugSegments[i];
    const parentPath = currentPath;

    // Find albums that match this slug and are children of the current path
    const albums = await prisma.$queryRaw`
      SELECT path FROM albums
      WHERE slug = ${currentSlug}
      AND path LIKE ${parentPath ? `${parentPath}/%` : '%'}
      AND path NOT LIKE ${parentPath ? `${parentPath}/%/%` : '%/%'}
    ` as Array<{ path: string }>;

    // Find the album that is exactly one level deeper
    const matchingAlbum = albums.find((album) => {
      const pathSegments = album.path.split('/');
      const expectedDepth = parentPath ? parentPath.split('/').length + 1 : 1;
      return pathSegments.length === expectedDepth;
    });

    if (matchingAlbum) {
      currentPath = matchingAlbum.path;
    } else {
      return null; // Path not found
    }
  }

  return currentPath;
}

/**
 * Alias for pathToSlugPath.
 */
export async function getAlbumSlugPath(path: string): Promise<string> {
  return await pathToSlugPath(path);
}
