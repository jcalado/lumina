import ffmpeg from 'fluent-ffmpeg';
import { prisma } from './prisma';
import { S3Service } from './s3';
import { getBatchProcessingSize } from './settings';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

// Video thumbnail sizes (small is square, medium/large maintain aspect ratio)
export const VIDEO_THUMBNAIL_SIZES = {
  SMALL: { width: 300, height: 300, size: 'SMALL' },
  MEDIUM: { width: 800, height: 450, size: 'MEDIUM' },
  LARGE: { width: 1200, height: 675, size: 'LARGE' },
} as const;

interface VideoThumbnailJobData {
  videoId: string;
  originalPath: string;
  s3Key: string;
  albumPath: string;
  filename: string;
  reprocess?: boolean;
}

// Function to extract thumbnail from video using ffmpeg
async function extractVideoFrame(videoPath: string, outputPath: string, timeOffset: string = '00:00:01'): Promise<void> {
  return new Promise((resolve, reject) => {
    // Check if ffmpeg is available
    const ffmpegPath = process.env.FFMPEG_PATH || 'ffmpeg';
    
    console.log(`Extracting frame from: ${videoPath}`);
    console.log(`Output frame to: ${outputPath}`);
    
    ffmpeg(videoPath)
      .setFfmpegPath(ffmpegPath)
      .screenshots({
        timestamps: [timeOffset],
        filename: path.basename(outputPath),
        folder: path.dirname(outputPath),
        // Remove size parameter to preserve original aspect ratio
        // Let FFmpeg extract the frame at original dimensions
      })
      .on('end', () => {
        console.log(`Video frame extracted to: ${outputPath}`);
        resolve();
      })
      .on('error', (err) => {
        console.error('Error extracting video frame:', err);
        reject(new Error(`FFmpeg error: ${err.message}. Please ensure FFmpeg is installed and accessible.`));
      });
  });
}

// Direct video thumbnail generation function
export async function generateVideoThumbnails(jobData: VideoThumbnailJobData): Promise<{ thumbnailsCreated: number }> {
  const { videoId, originalPath, s3Key, albumPath, filename, reprocess } = jobData;
  
  try {
    console.log(`Processing video thumbnails for: ${filename}`);
    
    const s3Service = new S3Service();

    // If reprocessing, delete existing video thumbnails first
    if (reprocess) {
      try {
        const existing = await prisma.videoThumbnail.findMany({ where: { videoId } })
        for (const t of existing) {
          try { await s3Service.deleteObject(t.s3Key) } catch { /* ignore */ }
        }
        if (existing.length > 0) {
          await prisma.videoThumbnail.deleteMany({ where: { videoId } })
        }
      } catch (e) {
        console.warn('Failed to cleanup old video thumbnails', e)
      }
    }
    const tempDir = os.tmpdir();
    const tempVideoPath = path.join(tempDir, `temp_video_${videoId}_${Date.now()}_${filename}`);
    const tempFramePath = path.join(tempDir, `temp_frame_${videoId}_${Date.now()}.jpg`);
    
    let videoBuffer: Buffer;
    
    // Try to read from local file first, fall back to S3
    try {
      await fs.access(originalPath);
      videoBuffer = await fs.readFile(originalPath);
      console.log(`Reading video from local path: ${originalPath}`);
    } catch (error) {
      console.log(`Local file not found, fetching from S3: ${s3Key}`);
      try {
        videoBuffer = await s3Service.getObject(s3Key);
      } catch (s3Error) {
        throw new Error(`Failed to read video from both local and S3: ${error} | ${s3Error}`);
      }
    }
    
    // Write video to temporary file for ffmpeg processing
    await fs.writeFile(tempVideoPath, videoBuffer);
    
    const thumbnailsCreated: any[] = [];
    
    try {
      // Extract frame from video at 1 second mark
      await extractVideoFrame(tempVideoPath, tempFramePath);
      
      // Check if frame was created
      await fs.access(tempFramePath);
      const frameBuffer = await fs.readFile(tempFramePath);
      console.log(`Frame extracted: ${frameBuffer.length} bytes from ${filename}`);
      
      // Use Sharp to process the extracted frame like we do for photos
      const sharp = require('sharp');
      
      // Generate thumbnails for each size
      for (const [sizeName, config] of Object.entries(VIDEO_THUMBNAIL_SIZES)) {
        try {
          // Process frame image
          let processedImage = sharp(frameBuffer, { 
            failOnError: false,
            limitInputPixels: false
          });
          
          // Get original dimensions
          const metadata = await processedImage.metadata();
          
          // Calculate dimensions and cropping strategy based on thumbnail size
          const { width: targetWidth, height: targetHeight } = config;
          let thumbnailBuffer: Buffer;
          let finalWidth: number;
          let finalHeight: number;
          
          if (sizeName === 'SMALL') {
            // For small thumbnails, create perfect squares using Sharp's cover mode
            const squareSize = 300; // Always 300x300 for small
            
            // Let Sharp handle all the math - it's designed for this
            thumbnailBuffer = await processedImage
              .resize(squareSize, squareSize, {
                fit: 'cover', // Crop to fill the entire square
                position: 'attention', // Smart positioning for subjects
                withoutEnlargement: false
              })
              .sharpen()
              .jpeg({ quality: 90 })
              .toBuffer();
            
            finalWidth = squareSize;
            finalHeight = squareSize;
          } else {
            // For medium and large thumbnails, preserve aspect ratio
            // Use Sharp's 'inside' fit to ensure the image fits within bounds without cropping
            thumbnailBuffer = await processedImage
              .resize(targetWidth, targetHeight, {
                fit: 'inside', // Preserve aspect ratio, no cropping
                withoutEnlargement: false
              })
              .jpeg({ quality: 85 })
              .toBuffer();
            
            // Get actual dimensions after resize
            const resizedMetadata = await require('sharp')(thumbnailBuffer).metadata();
            finalWidth = resizedMetadata.width || targetWidth;
            finalHeight = resizedMetadata.height || targetHeight;
          }
          
          // Generate S3 key for video thumbnail (include video ID for uniqueness)
          const baseKey = s3Service.generateKey(albumPath, filename, 'thumbnail');
          const thumbnailS3Key = `videos/thumbnails/${videoId}_${baseKey.split('/').pop()}_${sizeName.toLowerCase()}`;
          
          // Upload to S3
          await s3Service.uploadFile(thumbnailS3Key, thumbnailBuffer, 'image/jpeg');
          
          // Create video thumbnail record in database
          const videoThumbnail = await prisma.videoThumbnail.create({
            data: {
              videoId,
              size: config.size,
              s3Key: thumbnailS3Key,
              width: finalWidth,
              height: finalHeight,
            },
          });
          
          thumbnailsCreated.push(videoThumbnail);
          console.log(`Created ${sizeName} video thumbnail: ${finalWidth}x${finalHeight}`);
          
        } catch (error) {
          console.error(`Error creating ${sizeName} video thumbnail:`, error);
          // Continue with other sizes even if one fails
        }
      }
      
    } finally {
      // Cleanup temporary files
      try {
        await fs.unlink(tempVideoPath);
        await fs.unlink(tempFramePath);
      } catch (cleanupError) {
        console.warn('Failed to cleanup temporary files:', cleanupError);
      }
    }
    
    console.log(`Completed video thumbnail generation for ${filename}: ${thumbnailsCreated.length} thumbnails created`);
    
    return {
      thumbnailsCreated: thumbnailsCreated.length,
    };
    
  } catch (error) {
    console.error(`Video thumbnail generation failed for ${filename}:`, error);
    throw error;
  }
}

// Helper function to generate thumbnails for existing videos without them
export async function generateMissingVideoThumbnails(): Promise<{ processed: number; total: number }> {
  try {
    // Get batch size from settings
    const batchSize = await getBatchProcessingSize();
    console.log(`Using batch processing size for videos: ${batchSize}`);

    // Find all videos that don't have thumbnails yet
    const videosWithoutThumbnails = await prisma.video.findMany({
      where: {
        thumbnails: {
          none: {},
        },
      },
      select: {
        id: true,
        filename: true,
        originalPath: true,
        s3Key: true,
        album: {
          select: {
            path: true,
          },
        },
      },
    });

    console.log(`Found ${videosWithoutThumbnails.length} videos without thumbnails`);

    // Process thumbnails for each video in batches
    let processed = 0;
    
    const processSingleVideo = async (video: {
      id: string;
      filename: string;
      originalPath: string;
      s3Key: string;
      album: { path: string };
    }) => {
      try {
        await generateVideoThumbnails({
          videoId: video.id,
          originalPath: video.originalPath,
          s3Key: video.s3Key,
          albumPath: video.album.path,
          filename: video.filename,
        });
        return { success: true, filename: video.filename };
      } catch (error) {
        console.error(`Failed to generate video thumbnails for ${video.filename}:`, error);
        return { success: false, filename: video.filename, error };
      }
    };

    // Process videos in batches
    for (let i = 0; i < videosWithoutThumbnails.length; i += batchSize) {
      const batch = videosWithoutThumbnails.slice(i, i + batchSize);
      console.log(`Processing video batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(videosWithoutThumbnails.length / batchSize)} (${batch.length} videos)`);

      // Process batch concurrently
      const batchResults = await Promise.all(
        batch.map((video: { id: string; filename: string; originalPath: string; s3Key: string; album: { path: string }; }) => processSingleVideo(video))
      );

      // Count successful thumbnail generations
      const successfulInBatch = batchResults.filter((result: { success: boolean }) => result.success).length;
      processed += successfulInBatch;

      console.log(`Video batch completed: ${processed}/${videosWithoutThumbnails.length} videos processed`);

      // Small delay between batches to prevent overwhelming the system
      if (i + batchSize < videosWithoutThumbnails.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    return {
      processed,
      total: videosWithoutThumbnails.length,
    };
  } catch (error) {
    console.error('Error generating missing video thumbnails:', error);
    throw error;
  }
}

// Function to delete all existing video thumbnails and regenerate them
export async function reprocessAllVideoThumbnails(): Promise<{ processed: number; total: number; deleted: number }> {
  try {
    console.log('Starting reprocessing of all video thumbnails...');
    const s3Service = new S3Service();

    // Get all videos with their thumbnails
    const allVideos = await prisma.video.findMany({
      select: {
        id: true,
        filename: true,
        originalPath: true,
        s3Key: true,
        thumbnails: {
          select: {
            id: true,
            s3Key: true,
          },
        },
        album: {
          select: {
            path: true,
          },
        },
      },
    });

    console.log(`Found ${allVideos.length} videos to reprocess`);

    // Delete all existing video thumbnails
    let deletedCount = 0;
    for (const video of allVideos) {
      if (video.thumbnails.length > 0) {
        // Delete thumbnail files from S3
        for (const thumbnail of video.thumbnails) {
          try {
            await s3Service.deleteObject(thumbnail.s3Key);
            deletedCount++;
          } catch (error) {
            console.error(`Failed to delete video thumbnail from S3: ${thumbnail.s3Key}`, error);
          }
        }

        // Delete thumbnail records from database
        await prisma.videoThumbnail.deleteMany({
          where: { videoId: video.id },
        });
      }
    }

    console.log(`Deleted ${deletedCount} video thumbnail files from S3 and database`);

    // Get batch size from settings
    const batchSize = await getBatchProcessingSize();
    console.log(`Using batch processing size: ${batchSize}`);

    // Regenerate video thumbnails for all videos in batches
    let processed = 0;

    const processSingleVideo = async (video: {
      id: string;
      filename: string;
      originalPath: string;
      s3Key: string;
      album: { path: string };
    }) => {
      try {
        await generateVideoThumbnails({
          videoId: video.id,
          originalPath: video.originalPath,
          s3Key: video.s3Key,
          albumPath: video.album.path,
          filename: video.filename,
        });

        processed++;
        console.log(`Regenerated video thumbnails for ${video.filename} (${processed}/${allVideos.length})`);
      } catch (error) {
        console.error(`Failed to regenerate video thumbnails for ${video.filename}:`, error);
      }
    };

    // Process videos in batches
    for (let i = 0; i < allVideos.length; i += batchSize) {
      const batch = allVideos.slice(i, i + batchSize);
      console.log(`Processing video batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(allVideos.length / batchSize)}: ${batch.length} videos`);

      // Process all videos in the current batch concurrently
      await Promise.all(batch.map(processSingleVideo));

      // Small delay between batches to prevent overwhelming the system
      if (i + batchSize < allVideos.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    console.log(`Video reprocessing completed: ${processed} videos processed, ${deletedCount} old thumbnails deleted`);

    return {
      processed,
      total: allVideos.length,
      deleted: deletedCount,
    };
  } catch (error) {
    console.error('Error reprocessing all video thumbnails:', error);
    throw error;
  }
}
