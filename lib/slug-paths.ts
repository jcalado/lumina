import { prisma } from './prisma';

/**
 * Converts a filesystem path to a hierarchical slug path
 * Example: "ACNAC/2023/Exploradores/01 - Domingo" -> "acnac/2023/exploradores/01-domingo"
 */
export async function pathToSlugPath(path: string): Promise<string> {
  if (!path) return '';
  
  const segments = path.split('/');
  const slugSegments: string[] = [];
  
  // Build each hierarchical path and get its slug
  let currentPath = '';
  for (const segment of segments) {
    currentPath = currentPath ? `${currentPath}/${segment}` : segment;
    
    // Get the album for this path using raw query to access slug field
    const albums = await prisma.$queryRaw`
      SELECT slug FROM albums WHERE path = ${currentPath}
    ` as Array<{slug: string}>;
    
    if (albums.length > 0) {
      slugSegments.push(albums[0].slug);
    } else {
      // Fallback: generate slug from segment name
      slugSegments.push(segment.toLowerCase().replace(/[^a-z0-9]+/g, '-'));
    }
  }
  
  return slugSegments.join('/');
}

/**
 * Converts a hierarchical slug path back to a filesystem path
 * Example: "acnac/2023/exploradores/01-domingo" -> "ACNAC/2023/Exploradores/01 - Domingo"
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
    ` as Array<{path: string}>;
    
    // Find the album that is exactly one level deeper
    const matchingAlbum = albums.find(album => {
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
 * Get the slug path for a given album path (used for URL generation)
 */
export async function getAlbumSlugPath(path: string): Promise<string> {
  return await pathToSlugPath(path);
}
