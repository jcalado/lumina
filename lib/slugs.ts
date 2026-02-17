/**
 * Extract the parent path from an album path.
 * Returns '' for root-level albums.
 */
export function getParentPath(albumPath: string): string {
  const lastSlash = albumPath.lastIndexOf('/')
  return lastSlash === -1 ? '' : albumPath.substring(0, lastSlash)
}

/**
 * Generate a URL-friendly slug from a string
 */
export function generateSlug(text: string): string {
  return text
    .toLowerCase()
    .trim()
    // Replace spaces and underscores with hyphens
    .replace(/[\s_]+/g, '-')
    // Remove special characters except hyphens
    .replace(/[^\w\-]/g, '')
    // Remove consecutive hyphens
    .replace(/-+/g, '-')
    // Remove leading/trailing hyphens
    .replace(/^-+|-+$/g, '');
}

/**
 * Generate a unique slug for an album, scoped to siblings (same parent path).
 * @param name - Album name to generate slug from
 * @param parentPath - Parent path ('' for root-level albums)
 * @param albumId - Exclude this album from uniqueness check (for updates)
 */
export async function generateUniqueSlug(name: string, parentPath: string, albumId?: string): Promise<string> {
  const { prisma } = await import('@/lib/prisma');

  const baseSlug = generateSlug(name);
  let slug = baseSlug;
  let counter = 1;

  while (true) {
    // Check if slug exists among sibling albums (same parent) using raw query
    let existing: any[];

    if (parentPath === '') {
      // Root-level: siblings are albums whose path contains no '/'
      if (albumId) {
        existing = await prisma.$queryRaw`
          SELECT id FROM albums WHERE slug = ${slug} AND path NOT LIKE '%/%' AND id != ${albumId}
        `;
      } else {
        existing = await prisma.$queryRaw`
          SELECT id FROM albums WHERE slug = ${slug} AND path NOT LIKE '%/%'
        `;
      }
    } else {
      // Non-root: siblings are direct children of parentPath
      const likePrefix = `${parentPath}/%`;
      const likeNested = `${parentPath}/%/%`;
      if (albumId) {
        existing = await prisma.$queryRaw`
          SELECT id FROM albums WHERE slug = ${slug} AND path LIKE ${likePrefix} AND path NOT LIKE ${likeNested} AND id != ${albumId}
        `;
      } else {
        existing = await prisma.$queryRaw`
          SELECT id FROM albums WHERE slug = ${slug} AND path LIKE ${likePrefix} AND path NOT LIKE ${likeNested}
        `;
      }
    }

    if (existing.length === 0) {
      return slug;
    }

    // Generate new slug with counter
    slug = `${baseSlug}-${counter}`;
    counter++;
  }
}

/**
 * Validate a slug format
 */
export function isValidSlug(slug: string): boolean {
  // Must be lowercase, alphanumeric with hyphens, no consecutive hyphens
  const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
  return slugRegex.test(slug) && slug.length > 0 && slug.length <= 100;
}
