const { PrismaClient } = require('@prisma/client');

async function testOrientationDisplay() {
  const prisma = new PrismaClient();
  
  try {
    // Get a few photos to test with
    const photos = await prisma.photo.findMany({
      take: 3,
      select: { id: true, filename: true, metadata: true }
    });

    console.log('Testing orientation by updating photo metadata...\n');

    // Test different orientations
    const orientations = [
      { value: 1, name: 'Normal' },
      { value: 3, name: 'Upside Down (180°)' },
      { value: 6, name: 'Rotated Left (270°)' },
      { value: 8, name: 'Rotated Right (90°)' }
    ];

    for (let i = 0; i < Math.min(photos.length, orientations.length); i++) {
      const photo = photos[i];
      const orientation = orientations[i];
      
      // Parse existing metadata
      const metadata = typeof photo.metadata === 'string' 
        ? JSON.parse(photo.metadata) 
        : photo.metadata || {};
      
      // Add orientation
      metadata.orientation = orientation.value;
      
      // Update photo with orientation
      await prisma.photo.update({
        where: { id: photo.id },
        data: { metadata: JSON.stringify(metadata) }
      });
      
      console.log(`✓ Updated ${photo.filename} with orientation ${orientation.value} (${orientation.name})`);
    }

    console.log('\n✅ Test orientation data added to photos!');
    console.log('🌐 Check the gallery to see orientation corrections in action');
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testOrientationDisplay();
