import { config } from 'dotenv';
import { FileSystemScanner } from '../lib/filesystem';

config();

async function testScanner() {
  try {
    console.log('Testing filesystem scanner...');
    console.log('PHOTOS_ROOT_PATH:', process.env.PHOTOS_ROOT_PATH);
    
    const scanner = new FileSystemScanner(process.env.PHOTOS_ROOT_PATH || '');
    
    // Test scanning the specific album path
    const albumPath = 'Acampamentos/Inter Regional - Norte e Centro';
    console.log(`Scanning album: ${albumPath}`);
    
    const albumData = await scanner.scanDirectory(albumPath);
    console.log('Album data:', {
      name: albumData.name,
      path: albumData.path,
      photoCount: albumData.photos.length,
      subAlbums: albumData.subAlbums,
    });
    
    if (albumData.photos.length > 0) {
      console.log('First photo:', albumData.photos[0]);
    }
    
  } catch (error) {
    console.error('Error testing scanner:', error);
  }
}

testScanner();
