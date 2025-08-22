// Test script to make a direct API call to delete local files
require('dotenv').config()

const testDeleteAPI = async () => {
  try {
    // First, get an album that's marked as safe to delete
    const { PrismaClient } = require('@prisma/client')
    const prisma = new PrismaClient()
    
    const safeAlbum = await prisma.album.findFirst({
      where: { localFilesSafeDelete: true },
      select: {
        id: true,
        name: true,
        path: true,
        localFilesSafeDelete: true
      }
    })
    
    if (!safeAlbum) {
      console.log('No albums marked as safe for deletion found.')
      await prisma.$disconnect()
      return
    }
    
    console.log(`Found safe album: ${safeAlbum.name} (${safeAlbum.path}) - ID: ${safeAlbum.id}`)
    
    // Check if the directory exists before deletion
    const fs = require('fs/promises')
    const path = require('path')
    const albumPath = path.join(process.env.PHOTOS_ROOT_PATH, safeAlbum.path)
    
    try {
      await fs.access(albumPath)
      const contents = await fs.readdir(albumPath)
      console.log(`Directory exists with ${contents.length} items before deletion`)
    } catch {
      console.log('Directory does not exist before deletion attempt')
    }
    
    // Make the API call
    console.log('\nMaking DELETE API call...')
    const response = await fetch(`http://localhost:3000/api/admin/albums/${safeAlbum.id}/delete-local`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      }
    })
    
    console.log(`Response status: ${response.status}`)
    
    if (response.ok) {
      const data = await response.json()
      console.log('Success response:', data)
    } else {
      const errorData = await response.text()
      console.log('Error response:', errorData)
    }
    
    // Check if the directory still exists after deletion
    try {
      await fs.access(albumPath)
      const contents = await fs.readdir(albumPath)
      console.log(`Directory still exists with ${contents.length} items after deletion`)
    } catch {
      console.log('Directory no longer exists after deletion - SUCCESS!')
    }
    
    await prisma.$disconnect()
  } catch (error) {
    console.error('Error in test script:', error)
  }
}

console.log('Testing delete API...')
testDeleteAPI()
