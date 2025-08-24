const { PrismaClient } = require('@prisma/client');

async function testAlbumApiEndpoint() {
  const prisma = new PrismaClient();
  
  try {
    console.log('Testing the /api/albums endpoint to verify video thumbnails...');
    
    // Simulate the main albums API logic
    const result = await prisma.$queryRaw`
      WITH AlbumStats AS (
        SELECT 
          a.id,
          a.path,
          a.slug,
          a.name,
          a.description,
          a.createdAt,
          a.updatedAt,
          (SELECT COUNT(*) FROM photos WHERE albumId = a.id) as photoCount,
          (SELECT COUNT(*) FROM photos p2 
           INNER JOIN albums a2 ON p2.albumId = a2.id 
           WHERE a2.path LIKE a.path || '/%' 
             AND a2.status = 'PUBLIC' 
             AND a2.enabled = 1) as subAlbumPhotosCount,
          (SELECT COUNT(*) FROM albums a3 
           WHERE a3.path LIKE a.path || '/%' 
             AND a3.status = 'PUBLIC' 
             AND a3.enabled = 1) as subAlbumsCount
        FROM albums a
        WHERE a.status = 'PUBLIC' 
          AND a.enabled = 1 
          AND a.path NOT LIKE '%/%'
      ),
      AlbumThumbnails AS (
        SELECT 
          parent.id as parentAlbumId,
          p.id as mediaId,
          p.filename,
          'photo' as mediaType,
          p.takenAt,
          ROW_NUMBER() OVER (PARTITION BY parent.id ORDER BY p.takenAt ASC) as rn
        FROM AlbumStats parent
        LEFT JOIN albums sub ON sub.path LIKE parent.path || '/%' 
          AND sub.status = 'PUBLIC' 
          AND sub.enabled = 1
        LEFT JOIN photos p ON (p.albumId = parent.id OR p.albumId = sub.id)
        WHERE p.id IS NOT NULL
        
        UNION ALL
        
        SELECT 
          parent.id as parentAlbumId,
          v.id as mediaId,
          v.filename,
          'video' as mediaType,
          v.takenAt,
          ROW_NUMBER() OVER (PARTITION BY parent.id ORDER BY v.takenAt ASC) as rn
        FROM AlbumStats parent
        LEFT JOIN albums sub ON sub.path LIKE parent.path || '/%' 
          AND sub.status = 'PUBLIC' 
          AND sub.enabled = 1
        LEFT JOIN videos v ON (v.albumId = parent.id OR v.albumId = sub.id)
        WHERE v.id IS NOT NULL
      ),
      RankedThumbnails AS (
        SELECT 
          parentAlbumId,
          mediaId,
          filename,
          mediaType,
          ROW_NUMBER() OVER (PARTITION BY parentAlbumId ORDER BY takenAt ASC) as final_rn
        FROM AlbumThumbnails
      )
      SELECT 
        a.*,
        COALESCE(t.thumbnails, '') as thumbnails
      FROM AlbumStats a
      LEFT JOIN (
        SELECT 
          parentAlbumId,
          GROUP_CONCAT(mediaId || '|||' || filename || '|||' || mediaType, ';;;') as thumbnails
        FROM RankedThumbnails 
        WHERE final_rn <= 5
        GROUP BY parentAlbumId
      ) t ON t.parentAlbumId = a.id
      ORDER BY a.name ASC
    `;

    console.log('\nAlbum API results:');
    for (const album of result) {
      console.log(`\n📁 ${album.name}`);
      console.log(`   Path: ${album.path}`);
      console.log(`   PhotoCount: ${album.photoCount}, SubAlbumPhotosCount: ${album.subAlbumPhotosCount}`);
      
      if (album.thumbnails) {
        const thumbnails = album.thumbnails.split(';;;').map(item => {
          const [mediaId, filename, mediaType] = item.split('|||');
          return { mediaId, filename, mediaType };
        });
        
        console.log(`   Thumbnails: ${thumbnails.length} items`);
        thumbnails.forEach((thumb, index) => {
          const icon = thumb.mediaType === 'video' ? '🎥' : '📷';
          console.log(`     ${index + 1}. ${icon} ${thumb.filename} (${thumb.mediaType})`);
        });
        
        if (album.photoCount === 0 && thumbnails.some(t => t.mediaType === 'video')) {
          console.log(`   ✅ SUCCESS: Album with no photos now has video thumbnails!`);
        }
      } else {
        console.log(`   ❌ No thumbnails found`);
      }
    }
    
    // Test the individual album endpoint for the video-only album
    const videoOnlyAlbum = await prisma.album.findFirst({
      where: {
        path: 'Album fotos e videos/Vídeos',
        status: 'PUBLIC',
        enabled: true,
      },
      include: {
        _count: {
          select: {
            photos: true,
            videos: true,
          }
        }
      }
    });
    
    if (videoOnlyAlbum) {
      console.log(`\n🎥 Testing individual album endpoint for: ${videoOnlyAlbum.name}`);
      console.log(`   Photos: ${videoOnlyAlbum._count.photos}, Videos: ${videoOnlyAlbum._count.videos}`);
      
      // Test the same logic that would be used in the individual album API
      const directVideos = await prisma.video.findMany({
        where: {
          albumId: videoOnlyAlbum.id,
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
      
      if (directVideos.length > 0) {
        console.log(`   ✅ Found ${directVideos.length} videos for individual album thumbnails:`);
        directVideos.forEach(video => {
          console.log(`     🎥 ${video.filename}`);
        });
      }
    }
    
  } catch (error) {
    console.error('❌ Error testing API endpoint:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testAlbumApiEndpoint();
