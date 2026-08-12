/**
 * Seeds the dev stack with mock albums whose photos carry real EXIF capture
 * dates, so date-based sorting/filtering can be exercised end to end.
 *
 * Images are generated with sharp (no fixtures on disk), uploaded to the dev
 * MinIO bucket, and then pushed through the same queues the admin upload flow
 * uses — so thumbnails, blurhash and `takenAt` all come from the real workers.
 *
 * Filenames are deliberately NOT in capture-date order: sorting by name and
 * sorting by date taken produce visibly different orders.
 *
 *   npm run seed:mock                            # create (skips existing albums)
 *   npm run seed:mock -- --reset                 # rebuild all seeded albums
 *   npm run seed:mock -- --reset=family-archive  # rebuild one album subtree
 */
import sharp from 'sharp';
import { createPrismaClient } from '../lib/prisma-client';
import { generateUniqueSlug } from '../lib/slugs';
import { S3Service } from '../lib/s3';
import { enqueueThumbnailJob } from '../lib/queues/thumbnailQueue';
import { enqueueBlurhashJob } from '../lib/queues/blurhashQueue';
import { enqueueExifJob } from '../lib/queues/exifQueue';

const prisma = createPrismaClient();
const s3 = new S3Service();

type Orientation = 'landscape' | 'portrait' | 'square';

interface MockAlbum {
  path: string;
  name: string;
  description: string;
  status: 'PUBLIC' | 'PRIVATE';
  featured?: boolean;
  hue: number;
  /** ISO timestamps, one per photo, in the order the photos are generated. */
  takenAt: string[];
}

/** Today's date at a given time — keeps "up to now" seeds current on every run. */
function todayAt(time: string): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}T${time}:00`;
}

/** Spreads `count` captures across a day, starting at `startHour`. */
function timesOnDay(day: string, startHour: number, count: number, stepMinutes = 37): string[] {
  return Array.from({ length: count }, (_, i) => {
    const minutes = startHour * 60 + i * stepMinutes;
    const h = String(Math.floor(minutes / 60) % 24).padStart(2, '0');
    const m = String(minutes % 60).padStart(2, '0');
    return `${day}T${h}:${m}:00`;
  });
}

const ALBUMS: MockAlbum[] = [
  {
    path: 'iceland-2024',
    name: 'Iceland 2024',
    description:
      'Twelve frames shot over a week in February. Capture dates are spread across the trip while filenames are shuffled — sort by *date taken* vs *name* to see the difference.',
    status: 'PUBLIC',
    featured: true,
    hue: 205,
    takenAt: [
      '2024-02-03T08:14:00', '2024-02-03T16:52:00', '2024-02-04T09:03:00',
      '2024-02-05T07:41:00', '2024-02-05T18:27:00', '2024-02-06T11:19:00',
      '2024-02-07T06:58:00', '2024-02-07T14:33:00', '2024-02-08T10:05:00',
      '2024-02-09T15:47:00', '2024-02-10T08:22:00', '2024-02-10T19:11:00',
    ],
  },
  {
    path: 'iceland-2024/reykjavik-day-trip',
    name: 'Reykjavik Day Trip',
    description: 'A nested sub-album — six frames from a single afternoon, a month after the parent album.',
    status: 'PUBLIC',
    hue: 280,
    takenAt: timesOnDay('2024-03-12', 13, 6, 24),
  },
  {
    path: 'studio-portraits',
    name: 'Studio Portraits',
    description: 'All eight frames were shot on the same day — only the time of day separates them, which exercises sub-day date sorting.',
    status: 'PUBLIC',
    hue: 25,
    takenAt: timesOnDay('2025-06-14', 9, 8, 43),
  },
  {
    path: 'family-archive',
    name: 'Family Archive 2000-2026',
    description:
      'A 26-year span: the first frame is from October 2000 and the last from August 2026. Useful for checking timeline range handling, year grouping and the two extremes of date sorting.',
    status: 'PUBLIC',
    hue: 340,
    takenAt: [
      '2000-10-07T15:22:00', // oldest
      '2002-06-19T11:40:00', '2005-01-30T09:12:00', '2008-08-23T18:55:00',
      '2011-11-05T13:07:00', '2014-03-16T16:30:00', '2017-07-28T12:45:00',
      '2020-05-02T10:18:00', '2022-09-11T19:03:00', '2024-12-24T21:35:00',
      '2026-02-14T08:50:00',
      '2026-08-09T17:26:00', // newest
    ],
  },
  {
    path: 'family-archive/lily',
    name: 'Lily over the years',
    description:
      'A sub-album of the archive: one frame a year or so from 2010 through today. The final photo is stamped with the date the seeder ran, so this album always reaches the present.',
    status: 'PUBLIC',
    hue: 310,
    takenAt: [
      '2010-06-05T14:10:00', '2011-08-14T10:25:00', '2012-11-02T16:48:00',
      '2014-01-19T09:33:00', '2015-04-27T17:02:00', '2016-09-30T12:16:00',
      '2018-02-11T15:41:00', '2019-07-23T11:07:00', '2021-03-08T18:29:00',
      '2022-10-16T13:54:00', '2023-12-05T08:37:00', '2025-05-21T16:12:00',
      '2026-01-09T10:48:00',
      todayAt('11:30'), // newest — always "today"
    ],
  },
  {
    path: 'client-preview',
    name: 'Client Preview',
    description: 'A PRIVATE album (reachable by direct link only). Capture dates span six years, so date grouping has to cope with a wide range.',
    status: 'PRIVATE',
    hue: 145,
    takenAt: [
      '2019-04-21T12:30:00', '2021-09-08T17:05:00', '2022-12-25T10:15:00',
      '2024-07-04T20:40:00', '2025-11-30T08:00:00',
    ],
  },
];

const ORIENTATIONS: Record<Orientation, { width: number; height: number }> = {
  landscape: { width: 1600, height: 1067 },
  portrait: { width: 1067, height: 1600 },
  square: { width: 1400, height: 1400 },
};

/** EXIF wants `YYYY:MM:DD HH:mm:ss`, not ISO. */
function exifDate(iso: string): string {
  const [date, time] = iso.split('T');
  return `${date.replace(/-/g, ':')} ${time}`;
}

function escapeXml(value: string): string {
  return value.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c] as string));
}

/**
 * Builds a labelled JPEG with the capture date baked into both the pixels
 * (so it is verifiable by eye in the gallery) and the EXIF block.
 */
async function generatePhoto(opts: {
  album: MockAlbum;
  filename: string;
  index: number;
  takenAt: string;
  orientation: Orientation;
}): Promise<Buffer> {
  const { width, height } = ORIENTATIONS[opts.orientation];
  const [date, time] = opts.takenAt.split('T');
  // Shift the hue per photo so neighbouring thumbnails stay distinguishable.
  const hue = (opts.album.hue + opts.index * 11) % 360;

  const svg = `
    <svg width="${width}" height="${height}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="hsl(${hue}, 62%, 58%)" />
          <stop offset="100%" stop-color="hsl(${(hue + 40) % 360}, 55%, 32%)" />
        </linearGradient>
      </defs>
      <rect width="${width}" height="${height}" fill="url(#bg)" />
      <circle cx="${width * 0.78}" cy="${height * 0.24}" r="${Math.min(width, height) * 0.13}"
              fill="hsl(${(hue + 180) % 360}, 70%, 70%)" opacity="0.55" />
      <text x="${width * 0.07}" y="${height * 0.46}" font-family="DejaVu Sans, sans-serif"
            font-size="${Math.round(width * 0.075)}" font-weight="700" fill="#ffffff">
        ${escapeXml(opts.album.name)}
      </text>
      <text x="${width * 0.07}" y="${height * 0.58}" font-family="DejaVu Sans Mono, monospace"
            font-size="${Math.round(width * 0.055)}" fill="#ffffff" opacity="0.95">
        ${date} ${time}
      </text>
      <text x="${width * 0.07}" y="${height * 0.67}" font-family="DejaVu Sans Mono, monospace"
            font-size="${Math.round(width * 0.032)}" fill="#ffffff" opacity="0.8">
        ${escapeXml(opts.filename)} &#183; #${String(opts.index + 1).padStart(2, '0')} &#183; ${opts.orientation}
      </text>
    </svg>`;

  return sharp(Buffer.from(svg))
    .jpeg({ quality: 82 })
    .withExif({
      IFD0: {
        Make: 'Lumina',
        Model: `MockCam ${opts.orientation}`,
        Software: 'seed-mock-albums',
      },
      IFD2: {
        DateTimeOriginal: exifDate(opts.takenAt),
        CreateDate: exifDate(opts.takenAt),
        // Plausible-looking shooting parameters for the EXIF panel.
        FNumber: String(1.8 + (opts.index % 5)),
        ISO: String(100 * (1 + (opts.index % 6))),
        FocalLength: String(24 + (opts.index % 4) * 25),
      },
    })
    .toBuffer();
}

/** Deterministic shuffle so filename order never matches capture order. */
function shuffledFilenames(count: number, prefix: string): string[] {
  const numbers = Array.from({ length: count }, (_, i) => i + 1);
  for (let i = numbers.length - 1; i > 0; i--) {
    const j = (i * 7 + 3) % (i + 1);
    [numbers[i], numbers[j]] = [numbers[j], numbers[i]];
  }
  return numbers.map((n) => `${prefix}_${String(n).padStart(4, '0')}.jpg`);
}

/** Deletes seeded albums (and their S3 objects). `only` limits it to one album subtree. */
async function reset(only?: string): Promise<void> {
  console.log(only ? `Resetting ${only}...` : 'Resetting previously seeded mock albums...');
  // Children first so parents never fail on a foreign key.
  const paths = [...ALBUMS]
    .filter((a) => !only || a.path === only || a.path.startsWith(`${only}/`))
    .sort((a, b) => b.path.length - a.path.length)
    .map((a) => a.path);

  if (paths.length === 0) {
    console.log(`  no seeded album matches "${only}"`);
  }

  for (const path of paths) {
    const album = await prisma.album.findUnique({ where: { path } });
    if (!album) continue;

    // Originals and thumbnails live under separate prefixes (see s3.generateKey).
    for (const prefix of [`photos/${path}/`, `thumbnails/${path}/`]) {
      const keys = await s3.listObjects(prefix);
      for (const key of keys) {
        await s3.deleteObject(key);
      }
      if (keys.length > 0) console.log(`  removed ${keys.length} object(s) under ${prefix}`);
    }

    // Photo/Thumbnail rows cascade from the album.
    await prisma.album.delete({ where: { id: album.id } });
    console.log(`  deleted album ${path}`);
  }
}

async function seedAlbum(spec: MockAlbum): Promise<void> {
  const existing = await prisma.album.findUnique({ where: { path: spec.path } });
  if (existing) {
    console.log(`Album ${spec.path} already exists — skipping (use --reset to rebuild).`);
    return;
  }

  const parentPath = spec.path.includes('/') ? spec.path.slice(0, spec.path.lastIndexOf('/')) : '';
  const album = await prisma.album.create({
    data: {
      path: spec.path,
      slug: await generateUniqueSlug(spec.name, parentPath),
      name: spec.name,
      description: spec.description,
      status: spec.status,
      enabled: true,
      featured: spec.featured ?? false,
    },
  });

  const count = spec.takenAt.length;
  const prefix = spec.path.split('/').pop()!.slice(0, 3).toUpperCase();
  const filenames = shuffledFilenames(count, `IMG_${prefix}`);
  const orientations: Orientation[] = ['landscape', 'portrait', 'square'];

  console.log(`Album ${spec.path} (${spec.status}) — generating ${count} photos...`);

  for (let i = 0; i < count; i++) {
    const filename = filenames[i];
    const orientation = orientations[i % orientations.length];
    const buffer = await generatePhoto({
      album: spec,
      filename,
      index: i,
      takenAt: spec.takenAt[i],
      orientation,
    });

    const s3Key = s3.generateKey(spec.path, filename);
    await s3.uploadFile(s3Key, buffer, 'image/jpeg');

    const photo = await prisma.photo.create({
      data: {
        albumId: album.id,
        filename,
        s3Key,
        fileSize: buffer.length,
      },
    });

    // Same post-processing the admin confirm-upload endpoint triggers:
    // the EXIF worker is what fills in `takenAt` from the embedded dates.
    await enqueueThumbnailJob({ photoId: photo.id, s3Key, albumPath: spec.path, filename });
    await enqueueBlurhashJob({ photoId: photo.id, s3Key });
    await enqueueExifJob({ photoId: photo.id });

    console.log(`  ${filename}  taken ${spec.takenAt[i]}  ${orientation}  ${(buffer.length / 1024).toFixed(0)} KB`);
  }
}

async function main(): Promise<void> {
  const resetArg = process.argv.find((a) => a === '--reset' || a.startsWith('--reset='));
  if (resetArg) {
    await reset(resetArg.startsWith('--reset=') ? resetArg.slice('--reset='.length) : undefined);
  }

  for (const spec of ALBUMS) {
    await seedAlbum(spec);
  }

  const total = ALBUMS.reduce((sum, a) => sum + a.takenAt.length, 0);
  console.log(
    `\nDone — ${ALBUMS.length} albums, ${total} photos queued for thumbnail/blurhash/EXIF processing.` +
      `\nThe workers fill in takenAt and thumbnails within a few seconds.`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    process.exit(0);
  });
