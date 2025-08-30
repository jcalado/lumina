import {
  prisma
} from '@/lib/prisma';
import { normalizeVector, toPgvectorLiteral } from '@/lib/vector-utils';
import {
  S3Client,
  GetObjectCommand
} from '@aws-sdk/client-s3';
import {
  Readable
} from 'stream';
import fs from 'fs';
import { promises as fsPromises } from 'fs';
import os from 'os';
import path from 'path';
import {
  execFileSync,
  spawn
} from 'child_process';
import { promisify } from 'util';

/**
 * Face detection result returned from the Python helper, mapped to our types.
 */
export interface FaceDetectionResult {
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  confidence: number;
  embedding: number[];
}

export interface ProcessPhotoResult {
  photoId: string;
  faces: FaceDetectionResult[];
  error?: string;
}

/**
 * Calibrate confidence score to be more meaningful for face recognition
 * InsightFace confidence scores can be quite high, this function adjusts them
 * to be more representative of actual face recognition quality
 */
export function calibrateConfidenceScore(rawConfidence: number): number {
  // InsightFace typically returns very high confidence scores (>0.9) for detected faces
  // We calibrate this to a more meaningful scale for face recognition
  if (rawConfidence >= 0.95) return Math.min(rawConfidence * 1.1, 1.0); // Boost very high confidence
  if (rawConfidence >= 0.85) return rawConfidence * 0.95; // Slight boost for good confidence
  if (rawConfidence >= 0.7) return rawConfidence * 0.9; // Moderate reduction
  if (rawConfidence >= 0.5) return rawConfidence * 0.8; // Significant reduction
  return rawConfidence * 0.7; // Heavy reduction for low confidence
}

export async function detectFacesInPhotoBatch(
  photos: Array<{ photoId: string; imageBuffer: Buffer; filename: string }>,
  minConfidence: number = 0.5
): Promise<ProcessPhotoResult[]> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumina-face-batch-'));
  
  try {
    // Write all images to temp directory
    const batchConfig = {
      files: [] as Array<{ photoId: string; filename: string }>
    };

    for (const photo of photos) {
      const imgPath = path.join(tmpDir, `${photo.photoId}.jpg`);
      fs.writeFileSync(imgPath, photo.imageBuffer);
      batchConfig.files.push({
        photoId: photo.photoId,
        filename: `${photo.photoId}.jpg`
      });
    }

    // Write batch configuration
    const batchConfigPath = path.join(tmpDir, 'batch.json');
    fs.writeFileSync(batchConfigPath, JSON.stringify(batchConfig, null, 2));

    const scriptPath = path.join(process.cwd(), 'scripts', 'face_detect_insightface_batch.py');
    if (!fs.existsSync(scriptPath)) {
      return photos.map(photo => ({
        photoId: photo.photoId,
        faces: [],
        error: 'InsightFace batch helper not found'
      }));
    }

    let out: string;
    try {
      // Use async spawn instead of sync execFileSync to prevent blocking
      out = await new Promise<string>((resolve, reject) => {
        const child = spawn('python', [scriptPath, tmpDir], {
          stdio: ['pipe', 'pipe', 'pipe']
        });
        
        let stdout = '';
        let stderr = '';
        
        child.stdout.on('data', (data) => {
          stdout += data.toString();
        });
        
        child.stderr.on('data', (data) => {
          stderr += data.toString();
        });
        
        child.on('close', (code) => {
          if (code === 0) {
            resolve(stdout);
          } else {
            reject(new Error(`Python script failed with code ${code}: ${stderr}`));
          }
        });
        
        child.on('error', (error) => {
          reject(error);
        });
        
        // Set timeout to prevent hanging
        const timeout = setTimeout(() => {
          child.kill('SIGTERM');
          reject(new Error('Face detection timeout'));
        }, 60000); // 60 second timeout
        
        child.on('close', () => {
          clearTimeout(timeout);
        });
      });
    } catch (subprocessError) {
      const error = subprocessError instanceof Error ? subprocessError.message : String(subprocessError);
      return photos.map(photo => ({
        photoId: photo.photoId,
        faces: [],
        error
      }));
    }

    const parsed = JSON.parse(out);
    if (parsed.error) {
      return photos.map(photo => ({
        photoId: photo.photoId,
        faces: [],
        error: parsed.error
      }));
    }

    // Process results and apply confidence filtering
    const results: ProcessPhotoResult[] = [];
    for (const result of parsed.results || []) {
      const faces: FaceDetectionResult[] = [];
      
      for (const f of result.faces || []) {
        const box = f.box || f.bbox;
        if (!box || box.length < 4) {
          continue;
        }

        const x1 = Math.max(0, box[0]);
        const y1 = Math.max(0, box[1]);
        const x2 = Math.max(x1, box[2]);
        const y2 = Math.max(y1, box[3]);

        const boundingBox = {
          x: x1,
          y: y1,
          width: x2 - x1,
          height: y2 - y1
        };

        const score = typeof f.score === 'number' ? f.score : (f.det_score || 0);
        const embedding = Array.isArray(f.embedding) ? f.embedding.map((n: any) => Number(n)) : [];

        if (score >= minConfidence) {
          faces.push({
            boundingBox,
            confidence: calibrateConfidenceScore(score),
            embedding
          });
        }
      }

      results.push({
        photoId: result.photoId,
        faces,
        error: result.error
      });
    }

    return results;

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    return photos.map(photo => ({
      photoId: photo.photoId,
      faces: [],
      error: errorMsg
    }));
  } finally {
    // Cleanup temp directory
    try {
      const files = fs.readdirSync(tmpDir);
      for (const file of files) {
        fs.unlinkSync(path.join(tmpDir, file));
      }
      fs.rmdirSync(tmpDir);
    } catch (e) {
      // ignore cleanup errors
    }
  }
}

export async function detectFacesInPhoto(photoId: string, imageBuffer: Buffer, minConfidence: number = 0.5): Promise<ProcessPhotoResult> {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'lumina-face-'));
  const imgPath = path.join(tmpDir, `${photoId}.jpg`);
  try {
    fs.writeFileSync(imgPath, imageBuffer);

    const scriptPath = path.join(process.cwd(), 'scripts', 'face_detect_insightface.py');
    if (!fs.existsSync(scriptPath)) {
      return {
        photoId,
        faces: [],
        error: 'InsightFace helper not found'
      };
    }

    let out: string;
    try {
      out = execFileSync('python', [scriptPath, imgPath], {
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024
      });
    } catch (subprocessError) {
      return {
        photoId,
        faces: [],
        error: subprocessError instanceof Error ? subprocessError.message : String(subprocessError)
      };
    }

    const parsed = JSON.parse(out);
    if (parsed.error) {
      return {
        photoId,
        faces: [],
        error: parsed.error
      };
    }

    const faces: FaceDetectionResult[] = [];
    for (const f of parsed.faces || []) {
      const box = f.box || f.bbox;
      if (!box || box.length < 4) {
        continue;
      }

      const x1 = Math.max(0, box[0]);
      const y1 = Math.max(0, box[1]);
      const x2 = Math.max(x1, box[2]);
      const y2 = Math.max(y1, box[3]);

      const boundingBox = {
        x: x1,
        y: y1,
        width: x2 - x1,
        height: y2 - y1
      };

      const score = typeof f.score === 'number' ? f.score : (f.det_score || 0);
      const embedding = Array.isArray(f.embedding) ? f.embedding.map((n: any) => Number(n)) : [];

      if (score >= minConfidence) {
        faces.push({
          boundingBox,
          confidence: calibrateConfidenceScore(score),
          embedding
        });
      }
    }

    return {
      photoId,
      faces
    };
  } catch (error) {
    return {
      photoId,
      faces: [],
      error: error instanceof Error ? error.message : String(error)
    };
  } finally {
    try {
      if (fs.existsSync(imgPath)) {
        fs.unlinkSync(imgPath);
      }
      if (fs.existsSync(tmpDir)) {
        fs.rmdirSync(tmpDir);
      }
    } catch (e) {
      // ignore
    }
  }
}

export async function getImageFromS3(s3Key: string): Promise<Buffer> {
  const bucketName = process.env.S3_BUCKET_NAME || process.env.S3_BUCKET;
  const accessKey = process.env.AWS_ACCESS_KEY_ID || process.env.S3_ACCESS_KEY || process.env.S3_ACCESS_KEY_ID;
  const secretKey = process.env.AWS_SECRET_ACCESS_KEY || process.env.S3_SECRET_KEY || process.env.S3_SECRET_ACCESS_KEY;
  const region = process.env.AWS_REGION || process.env.S3_REGION || 'us-east-1';
  const endpoint = process.env.S3_ENDPOINT || undefined;

  if (!bucketName) {
    throw new Error('S3 bucket name is not set.');
  }

  const clientOptions: any = {
    region
  };
  if (accessKey && secretKey) {
    clientOptions.credentials = {
      accessKeyId: accessKey,
      secretAccessKey: secretKey
    };
  }
  if (endpoint) {
    clientOptions.endpoint = endpoint;
    clientOptions.forcePathStyle = true;
  }

  const s3Client = new S3Client(clientOptions as any);
  const command = new GetObjectCommand({
    Bucket: bucketName,
    Key: s3Key
  });
  const response = await s3Client.send(command);

  if (!response.Body) {
    throw new Error('No image data received from S3');
  }

  const stream = response.Body as Readable;
  const chunks: Buffer[] = [];
  return await new Promise((resolve, reject) => {
    stream.on('data', (c) => chunks.push(c));
    stream.on('error', reject);
    stream.on('end', () => resolve(Buffer.concat(chunks)));
  });
}

export async function getImageBuffer(originalPath: string, s3Key: string, filename: string): Promise<Buffer> {
  // Try to read from local file first, fall back to S3
  try {
    await fsPromises.access(originalPath);
    const imageBuffer = await fsPromises.readFile(originalPath);
    console.log(`Reading image from local path: ${originalPath}`);
    return imageBuffer;
  } catch (error) {
    console.log(`Local file not found for ${filename}, fetching from S3: ${s3Key}`);
    try {
      return await getImageFromS3(s3Key);
    } catch (s3Error) {
      throw new Error(`Failed to read image from both local and S3: ${error} | ${s3Error}`);
    }
  }
}

export function calculateSimilarity(embedding1: number[], embedding2: number[]): number {
  if (embedding1.length !== embedding2.length) {
    return 0;
  }
  let dot = 0,
    n1 = 0,
    n2 = 0;
  for (let i = 0; i < embedding1.length; i++) {
    dot += embedding1[i] * embedding2[i];
    n1 += embedding1[i] * embedding1[i];
    n2 += embedding2[i] * embedding2[i];
  }
  if (n1 === 0 || n2 === 0) {
    return 0;
  }
  return dot / (Math.sqrt(n1) * Math.sqrt(n2));
}

export async function findSimilarFaces(
  newEmbedding: number[],
  similarityThreshold: number = 0.7,
): Promise < {
  personId: string;
  similarity: number;
} | null > {
  const existingFaces = await prisma.$queryRaw < Array < {
    id: string;
    personId: string;
    embedding: string;
  } >> 
  `
            SELECT id, "personId", embedding 
            FROM "faces" 
            WHERE "hasEmbedding" = true AND "personId" IS NOT NULL
          `
  ;
  let best: { personId: string; similarity: number } | null = null;
  let bestScore = 0;
  for (const face of existingFaces) {
    if (!face.embedding || !face.personId) {
      continue;
    }
    try {
      const emb = JSON.parse(face.embedding);
      const sim = calculateSimilarity(newEmbedding, emb);
      if (sim > bestScore && sim >= similarityThreshold) {
        bestScore = sim;
        best = {
          personId: face.personId,
          similarity: sim
        };
      }
    } catch (e) {}
  }
  return best;
}

export async function saveFaceDetections(
  photoId: string,
  faces: FaceDetectionResult[],
  similarityThreshold: number = 0.7,
): Promise < void > {
  await prisma.face.deleteMany({
    where: {
      photoId
    }
  });
  for (const face of faces) {
    let personId: string | null = null;
    if (face.embedding.length > 0) {
      const match = await findSimilarFaces(face.embedding, similarityThreshold);
      if (match) {
        personId = match.personId;
      }
    }
    const created = await prisma.face.create({
      data: {
        photoId,
        personId,
        boundingBox: JSON.stringify(face.boundingBox),
        confidence: face.confidence,
        embedding: JSON.stringify(face.embedding),
        hasEmbedding: face.embedding.length > 0
      },
      select: { id: true }
    });
  }
}

export async function processPhotoBatch(
  photoIds: string[],
  minConfidence: number = 0.5,
  similarityThreshold: number = 0.7,
  onProgress ? : (processed: number, total: number) => void,
  batchSize: number = 10 // New parameter for batch size
): Promise < {
  processed: number;
  errors: string[];
} > {
  const errors: string[] = [];
  let processed = 0;

  // Process photos in batches to optimize model loading
  for (let i = 0; i < photoIds.length; i += batchSize) {
    const batchIds = photoIds.slice(i, i + batchSize);
    
    try {
      // Fetch all photos in the batch
      const photos = await Promise.all(
        batchIds.map(async (photoId) => {
          try {
            const photo = await prisma.photo.findUnique({
              where: { id: photoId },
              select: {
                id: true,
                s3Key: true,
                filename: true,
                originalPath: true
              }
            });

            if (!photo) {
              errors.push(`Photo not found: ${photoId}`);
              return null;
            }

            const imageBuffer = await getImageBuffer(photo.originalPath, photo.s3Key, photo.filename);
            return {
              photoId: photo.id,
              imageBuffer,
              filename: photo.filename
            };
          } catch (error) {
            const msg = error instanceof Error ? error.message : String(error);
            errors.push(`${photoId}: ${msg}`);
            return null;
          }
        })
      );

      // Filter out failed photos
      const validPhotos = photos.filter((photo): photo is NonNullable<typeof photo> => photo !== null);

      if (validPhotos.length === 0) {
        continue;
      }

      // Process the entire batch with a single model load
      const results = await detectFacesInPhotoBatch(validPhotos, minConfidence);

      // Save face detections for each photo in the batch
      for (const result of results) {
        try {
          if (result.error) {
            const photo = validPhotos.find((p: { photoId: string; filename: string }) => p.photoId === result.photoId);
            errors.push(`${photo?.filename || result.photoId}: ${result.error}`);
            continue;
          }

          await saveFaceDetections(result.photoId, result.faces, similarityThreshold);
          processed++;
          
          if (onProgress) {
            onProgress(processed, photoIds.length);
          }
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          const photo = validPhotos.find((p: { photoId: string; filename: string }) => p.photoId === result.photoId);
          errors.push(`${photo?.filename || result.photoId}: ${msg}`);
        }
      }

    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      errors.push(`Batch processing error: ${msg}`);
    }
  }

  return {
    processed,
    errors
  };
}

// Keep the original single-photo function for backward compatibility
export async function processPhotoSingle(
  photoId: string,
  minConfidence: number = 0.5,
  similarityThreshold: number = 0.7
): Promise < {
  processed: number;
  errors: string[];
} > {
  const errors: string[] = [];
  let processed = 0;
  
  try {
    const photo = await prisma.photo.findUnique({
      where: {
        id: photoId
      },
      select: {
        id: true,
        s3Key: true,
        filename: true,
        originalPath: true
      }
    });
    if (!photo) {
      errors.push(`Photo not found: ${photoId}`);
      return { processed, errors };
    }
    const imageBuffer = await getImageBuffer(photo.originalPath, photo.s3Key, photo.filename);
    const result = await detectFacesInPhoto(photoId, imageBuffer, minConfidence);
    if (result.error) {
      errors.push(`${photo.filename}: ${result.error}`);
      return { processed, errors };
    }
    await saveFaceDetections(photoId, result.faces, similarityThreshold);
    processed++;
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    errors.push(`${photoId}: ${msg}`);
  }
  
  return {
    processed,
    errors
  };
}

export async function scaleCoordinates(
  boundingBox: {
    x: number;
    y: number;
    width: number;
    height: number;
  },
  originalSize: {
    width: number;
    height: number;
  },
  targetSize: {
    width: number;
    height: number;
  },
): Promise < {
  x: number;
  y: number;
  width: number;
  height: number;
} > {
  const scaleX = targetSize.width / originalSize.width;
  const scaleY = targetSize.height / originalSize.height;
  return {
    x: Math.round(boundingBox.x * scaleX),
    y: Math.round(boundingBox.y * scaleY),
    width: Math.round(boundingBox.width * scaleX),
    height: Math.round(boundingBox.height * scaleY),
  };
}

export async function cleanup(): Promise < void > {
  /* no-op for Python backend */
}
