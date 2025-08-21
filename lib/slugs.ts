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
 * Generate a unique slug for an album
 */
export async function generateUniqueSlug(name: string, albumId?: string): Promise<string> {
  const { prisma } = await import('@/lib/prisma');
  
  const baseSlug = generateSlug(name);
  let slug = baseSlug;
  let counter = 1;

  while (true) {
    // Check if slug exists using raw query to avoid TypeScript issues
    let existing: any[];
    
    if (albumId) {
      existing = await prisma.$queryRaw`
        SELECT id FROM albums WHERE slug = ${slug} AND id != ${albumId}
      `;
    } else {
      existing = await prisma.$queryRaw`
        SELECT id FROM albums WHERE slug = ${slug}
      `;
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
