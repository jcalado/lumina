import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

console.log('🔍 Testing S3 Key Generation');
console.log('============================');

function generateKey(albumPath, filename, type = 'original') {
  const cleanPath = albumPath.replace(/^\/+|\/+$/g, '');
  const cleanFilename = filename.replace(/[^a-zA-Z0-9.-]/g, '_');
  
  if (type === 'thumbnail') {
    return `thumbnails/${cleanPath}/${cleanFilename}`;
  }
  
  return `photos/${cleanPath}/${cleanFilename}`;
}

const albumPath = 'Acampamentos/Inter Regional - Norte e Centro';
const filename = 'InterRegional.jpg';

console.log('Input:');
console.log(`  Album path: "${albumPath}"`);
console.log(`  Filename: "${filename}"`);
console.log('');

console.log('Generated S3 key:');
const key = generateKey(albumPath, filename);
console.log(`  "${key}"`);
console.log('');

console.log('Key components:');
console.log(`  Clean path: "${albumPath.replace(/^\/+|\/+$/g, '')}"`);
console.log(`  Clean filename: "${filename.replace(/[^a-zA-Z0-9.-]/g, '_')}"`);
console.log('');

console.log('Expected in database: photos/Acampamentos/Inter Regional - Norte e Centro/InterRegional.jpg');
console.log(`Actual generated:     ${key}`);
