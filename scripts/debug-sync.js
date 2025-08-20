import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs/promises';

// Load environment variables
dotenv.config();

console.log('🔍 Debugging Photo Sync Process');
console.log('================================');

const photosRoot = process.env.PHOTOS_ROOT_PATH || '';

console.log(`Photos root path: ${photosRoot}`);
console.log('');

async function debugSync() {
  try {
    // Check if photos directory exists
    console.log('1. Checking photos directory...');
    try {
      const stats = await fs.stat(photosRoot);
      if (stats.isDirectory()) {
        console.log(`✅ Directory exists: ${photosRoot}`);
      } else {
        console.log(`❌ Path exists but is not a directory: ${photosRoot}`);
        return;
      }
    } catch (error) {
      console.log(`❌ Directory does not exist: ${photosRoot}`);
      console.log(`Error: ${error.message}`);
      console.log('');
      console.log('💡 To fix this:');
      console.log(`   1. Create the directory: mkdir "${photosRoot}"`);
      console.log(`   2. Add some photo albums in subdirectories`);
      console.log(`   3. Example: "${photosRoot}\\test-album\\photo1.jpg"`);
      return;
    }
    
    // List contents of photos directory
    console.log('2. Listing directory contents...');
    try {
      const entries = await fs.readdir(photosRoot, { withFileTypes: true });
      console.log(`Found ${entries.length} entries:`);
      
      if (entries.length === 0) {
        console.log('   📁 Directory is empty');
        console.log('');
        console.log('💡 To add photos:');
        console.log(`   1. Create album directories: "${photosRoot}\\album-name\\"`);
        console.log(`   2. Add JPG/PNG photos to album directories`);
        console.log(`   3. Optionally add project.md files for descriptions`);
        return;
      }
      
      entries.forEach(entry => {
        const type = entry.isDirectory() ? '[DIR]' : '[FILE]';
        console.log(`   ${type} ${entry.name}`);
      });
      console.log('');
      
      // Check for valid album directories (any directory, can contain photos or sub-albums)
      console.log('3. Checking album structure...');
      let foundDirectories = 0;
      
      const checkDirectory = async (dirPath, level = 0) => {
        const indent = '  '.repeat(level);
        try {
          const albumEntries = await fs.readdir(dirPath);
          const photoFiles = albumEntries.filter(file => {
            const ext = path.extname(file).toLowerCase();
            return ['.jpg', '.jpeg', '.png', '.webp'].includes(ext);
          });
          
          const subdirs = [];
          for (const entry of albumEntries) {
            const entryPath = path.join(dirPath, entry);
            const stats = await fs.stat(entryPath);
            if (stats.isDirectory()) {
              subdirs.push(entry);
            }
          }
          
          const dirName = path.basename(dirPath);
          
          if (photoFiles.length > 0 || subdirs.length > 0) {
            foundDirectories++;
            console.log(`${indent}📁 "${dirName}"`);
            
            if (photoFiles.length > 0) {
              console.log(`${indent}   📸 ${photoFiles.length} photos`);
              photoFiles.slice(0, 2).forEach(photo => {
                console.log(`${indent}      - ${photo}`);
              });
              if (photoFiles.length > 2) {
                console.log(`${indent}      ... and ${photoFiles.length - 2} more`);
              }
            }
            
            if (subdirs.length > 0) {
              console.log(`${indent}   📂 ${subdirs.length} sub-album(s)`);
              for (const subdir of subdirs) {
                await checkDirectory(path.join(dirPath, subdir), level + 1);
              }
            }
            
            // Check for project.md
            if (albumEntries.includes('project.md')) {
              console.log(`${indent}   📝 Has description (project.md)`);
            }
          }
          
        } catch (error) {
          console.log(`${indent}❌ Error reading directory: ${error.message}`);
        }
      };
      
      for (const entry of entries) {
        if (entry.isDirectory()) {
          await checkDirectory(path.join(photosRoot, entry.name));
        }
      }
      
      if (foundDirectories === 0) {
        console.log('');
        console.log('❌ No album structure found!');
        console.log('💡 Albums can contain:');
        console.log('   - Photos (JPG/PNG files) directly');
        console.log('   - Other album directories (nested structure)');
        console.log('   - Both photos and sub-albums');
      } else {
        console.log('');
        console.log(`✅ Found album structure with ${foundDirectories} directory(ies)!`);
        console.log('');
        console.log('💡 This structure should work with the sync process.');
        console.log('   Try clicking "Sync Photos" in the web interface.');
      }
      
    } catch (error) {
      console.log(`❌ Error reading directory: ${error.message}`);
      return;
    }
    
  } catch (error) {
    console.log(`❌ Debug failed: ${error.message}`);
  }
}

debugSync();
