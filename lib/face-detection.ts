import {
  prisma
} from '@/lib/prisma';
import {
  S3Client,
  GetObjectCommand
} from '@aws-sdk/client-s3';
import {
  Readable
} from 'stream';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  execFileSync
} from 'child_process';

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

    const out = execFileSync('python', [scriptPath, imgPath], {
      encoding: 'utf8',
      maxBuffer: 10 * 1024 * 1024
    });

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
          confidence: score,
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
            WHERE embedding IS NOT NULL AND "personId" IS NOT NULL
          `
  ;
  let best = null;
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
    let personId = null;
    if (face.embedding.length > 0) {
      const match = await findSimilarFaces(face.embedding, similarityThreshold);
      if (match) {
        personId = match.personId;
      }
    }
    await prisma.face.create({
      data: {
        photoId,
        personId,
        boundingBox: JSON.stringify(face.boundingBox),
        confidence: face.confidence,
        embedding: JSON.stringify(face.embedding),
      },
    });
  }
}

export async function processPhotoBatch(
  photoIds: string[],
  minConfidence: number = 0.5,
  similarityThreshold: number = 0.7,
  onProgress ? : (processed: number, total: number) => void,
): Promise < {
  processed: number;
  errors: string[];
} > {
  const errors: string[] = [];
  let processed = 0;
  for (const photoId of photoIds) {
    try {
      const photo = await prisma.photo.findUnique({
        where: {
          id: photoId
        },
        select: {
          id: true,
          s3Key: true,
          filename: true
        }
      });
      if (!photo) {
        errors.push(`Photo not found: ${photoId}`);
        continue;
      }
      const imageBuffer = await getImageFromS3(photo.s3Key);
      const result = await detectFacesInPhoto(photoId, imageBuffer, minConfidence);
      if (result.error) {
        errors.push(`${photo.filename}: ${result.error}`);
        continue;
      }
      await saveFaceDetections(photoId, result.faces, similarityThreshold);
      processed++;
      if (onProgress) {
        onProgress(processed, photoIds.length);
      }
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      errors.push(`${photoId}: ${msg}`);
    }
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