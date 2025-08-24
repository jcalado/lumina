const { PrismaClient } = require('@prisma/client');

async function testIndividualAlbumVideoThumbnails() {
  const prisma = new PrismaClient();
  
  try {
    console.log('Testing individual album API for video thumbnail functionality...');
    
    // Test the parent album that contains the video-only sub-album
    const parentAlbumPath = 'Album fotos e videos';
    console.log(`\nTesting parent album: ${parentAlbumPath}`);
    
    // Find the parent album
    const parentAlbum = await prisma.album.findUnique({
      where: {
        path: parentAlbumPath,
      },
      include: {
        photos: {
          include: {
            thumbnails: true,
          },
          orderBy: {
            takenAt: 'asc',
          },
          take: 10,
        },
        videos: {
          include: {
            thumbnails: true,
          },
          orderBy: {
            takenAt: 'asc',
          },
          take: 10,
        },
        _count: {
          select: {
            photos: true,
            videos: true,
          },
        },
      },
    });

    if (!parentAlbum) {
      console.log('❌ Parent album not found');
      return;
    }

    console.log(`✅ Found parent album: ${parentAlbum.name}`);
    console.log(`   Direct photos: ${parentAlbum._count.photos}`);
    console.log(`   Direct videos: ${parentAlbum._count.videos}`);

    // Find sub-albums like the API does
    const allSubAlbums = await prisma.album.findMany({
      where: {
        status: 'PUBLIC',
        enabled: true,
        NOT: {
          path: parentAlbumPath,
        },
      },
      select: {
        id: true,
        path: true,
        name: true,
        description: true,
        _count: {
          select: {
            photos: true,
          },
        },
      },
    });

    // Filter to get only direct children
    const subAlbums = allSubAlbums.filter((album) => {
      const expectedPrefix = parentAlbumPath + '/';
      if (!album.path.startsWith(expectedPrefix)) {
        return false;
      }
      const remainingPath = album.path.substring(expectedPrefix.length);
      return !remainingPath.includes('/'); // No deeper nesting
    });

    console.log(`\nFound ${subAlbums.length} direct sub-albums:`);

    // Add video counts and test thumbnail generation for each sub-album
    for (const subAlbum of subAlbums) {
      // Add video count manually 
      const videoCount = await prisma.video.count({
        where: {
          albumId: subAlbum.id,
        },
      });
      subAlbum._count.videos = videoCount;

      console.log(`\n📁 ${subAlbum.name}`);
      console.log(`   Path: ${subAlbum.path}`);
      console.log(`   Photos: ${subAlbum._count.photos}, Videos: ${videoCount}`);

      // Test the thumbnail generation logic
      let media = [];

      if (subAlbum._count.photos > 0 || videoCount > 0) {
        // Get photos from this album directly
        const directPhotos = await prisma.photo.findMany({
          where: {
            albumId: subAlbum.id,
          },
          select: {
            id: true,
            filename: true,
            takenAt: true,
          },
          orderBy: {
            takenAt: 'asc',
          },
        });

        // Get videos from this album directly
        const directVideos = await prisma.video.findMany({
          where: {
            albumId: subAlbum.id,
          },
          select: {
            id: true,
            filename: true,
            takenAt: true,
          },
          orderBy: {
            takenAt: 'asc',
          },
        });

        // Combine and sort all media by date
        const allDirectMedia = [
          ...directPhotos.map(p => ({ ...p, type: 'photo' })),
          ...directVideos.map(v => ({ ...v, type: 'video' }))
        ].sort((a, b) => {
          const dateA = a.takenAt ? new Date(a.takenAt).getTime() : 0;
          const dateB = b.takenAt ? new Date(b.takenAt).getTime() : 0;
          return dateA - dateB;
        });

        // Get distributed sample from direct media
        if (allDirectMedia.length <= 5) {
          media = allDirectMedia;
        } else {
          const interval = Math.floor(allDirectMedia.length / 5);
          for (let i = 0; i < 5; i++) {
            const skip = i * interval;
            if (skip < allDirectMedia.length) {
              media.push(allDirectMedia[skip]);
            }
          }
        }

        console.log(`   Generated ${media.length} thumbnails:`);
        media.forEach((item, index) => {
          const icon = item.type === 'video' ? '🎥' : '📷';
          console.log(`     ${index + 1}. ${icon} ${item.filename} (${item.type})`);
        });

        if (subAlbum._count.photos === 0 && videoCount > 0) {
          console.log(`   ✅ SUCCESS: Video-only album now has ${media.filter(m => m.type === 'video').length} video thumbnails!`);
        }
      } else {
        console.log(`   ❌ No media found in this album`);
      }
    }

  } catch (error) {
    console.error('❌ Error testing individual album video thumbnails:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testIndividualAlbumVideoThumbnails();
