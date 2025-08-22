// Debug script to test local album deletion
require('dotenv').config()

const testAlbumDeletion = async () => {
  try {
    console.log('Environment variables:')
    console.log('PHOTOS_ROOT_PATH:', process.env.PHOTOS_ROOT_PATH)
    console.log('DATABASE_URL:', process.env.DATABASE_URL ? 'Set' : 'Not set')
    
    // Get albums that are marked as safe to delete
    const { PrismaClient } = require('@prisma/client')
    const prisma = new PrismaClient()
    
    const safeAlbums = await prisma.album.findMany({
      where: { localFilesSafeDelete: true },
      select: {
        id: true,
        name: true,
        path: true,
        localFilesSafeDelete: true
      }
    })
    
    console.log('\nAlbums marked as safe for local deletion:')
    safeAlbums.forEach(album => {
      console.log(`- ${album.name} (${album.path}) - ID: ${album.id}`)
    })
    
    if (safeAlbums.length === 0) {
      console.log('No albums are marked as safe for local deletion.')
      console.log('You need to run a comparison first to mark albums as safe.')
    }
    
    // Check if PHOTOS_ROOT_PATH exists
    const fs = require('fs/promises')
    const path = require('path')
    
    if (process.env.PHOTOS_ROOT_PATH) {
      try {
        const rootPath = process.env.PHOTOS_ROOT_PATH
        await fs.access(rootPath)
        console.log(`\nPHOTOS_ROOT_PATH exists: ${rootPath}`)
        
        // List some directories in the root path
        const entries = await fs.readdir(rootPath, { withFileTypes: true })
        const directories = entries.filter(entry => entry.isDirectory()).slice(0, 5)
        console.log('Sample directories in PHOTOS_ROOT_PATH:')
        directories.forEach(dir => console.log(`- ${dir.name}`))
        
        // Check if any safe albums actually exist on disk
        for (const album of safeAlbums.slice(0, 3)) {
          const albumPath = path.join(rootPath, album.path)
          try {
            await fs.access(albumPath)
            const stats = await fs.stat(albumPath)
            console.log(`✓ Album directory exists: ${albumPath} (${stats.isDirectory() ? 'directory' : 'file'})`)
            
            // List contents to see if there are files
            const contents = await fs.readdir(albumPath)
            console.log(`  Contains ${contents.length} items: ${contents.slice(0, 3).join(', ')}${contents.length > 3 ? '...' : ''}`)
          } catch {
            console.log(`✗ Album directory NOT found: ${albumPath}`)
          }
        }
        
      } catch (error) {
        console.error(`PHOTOS_ROOT_PATH does not exist or is not accessible: ${process.env.PHOTOS_ROOT_PATH}`)
      }
    } else {
      console.log('PHOTOS_ROOT_PATH environment variable is not set!')
    }
    
    await prisma.$disconnect()
  } catch (error) {
    console.error('Error in test script:', error)
  }
}

testAlbumDeletion()
