import { cn } from '@/lib/utils';

interface AlbumCardOverlayProps {
  name: string;
  description?: string | null;
  /** Short trailing detail, e.g. a date or date range. */
  meta?: string | null;
  /** Sub-album tiles are much smaller, so they get a tighter type scale. */
  size?: 'default' | 'compact';
  className?: string;
}

/**
 * Album title block laid over the bottom of a thumbnail, matching the featured
 * banner's treatment. The whole thing is pointer-events-none so it never
 * intercepts the hover-scrub on the image underneath.
 */
export function AlbumCardOverlay({
  name,
  description,
  meta,
  size = 'default',
  className,
}: AlbumCardOverlayProps) {
  const compact = size === 'compact';

  return (
    <div className={cn('pointer-events-none absolute inset-0', className)}>
      {/* Kept light so the photo still reads; the text shadow carries
          legibility over bright images rather than a heavier scrim. */}
      <div className="absolute inset-0 bg-linear-to-t from-black/85 from-0% via-black/45 via-45% to-transparent to-85%" />
      <div
        className={cn(
          'absolute inset-x-0 bottom-0 [text-shadow:0_1px_3px_rgb(0_0_0/0.85)]',
          compact ? 'p-3' : 'p-4'
        )}
      >
        <h3
          className={cn(
            'font-semibold text-white text-pretty line-clamp-2',
            compact ? 'text-sm' : 'text-base'
          )}
        >
          {name}
        </h3>
        {description && (
          <p
            className={cn(
              // One line on a card: the full description is on the album page,
              // and a taller block would push the title off the dark base.
              'text-white/85 mt-0.5 line-clamp-1',
              compact ? 'text-[11px]' : 'text-xs'
            )}
          >
            {description}
          </p>
        )}
        {meta && (
          <p className={cn('text-white/70 mt-1', compact ? 'text-[11px]' : 'text-xs')}>{meta}</p>
        )}
      </div>
    </div>
  );
}
