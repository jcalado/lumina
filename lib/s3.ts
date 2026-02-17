import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command, HeadObjectCommand } from '@aws-sdk/client-s3';
import { Upload } from '@aws-sdk/lib-storage';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

let s3ClientInstance: S3Client | null = null;

function getS3Client(): S3Client {
  if (!s3ClientInstance) {
    s3ClientInstance = new S3Client({
      endpoint: process.env.S3_ENDPOINT,
      region: process.env.S3_REGION || 'us-east-1',
      credentials: {
        accessKeyId: process.env.S3_ACCESS_KEY || '',
        secretAccessKey: process.env.S3_SECRET_KEY || '',
      },
      forcePathStyle: true, // needed for MinIO and other S3-compatible services
    });
  }
  return s3ClientInstance;
}

export interface S3UploadResult {
  key: string;
  url: string;
  size: number;
}

export class S3Service {
  private bucket: string;
  private bucketInitialized = false;

  constructor() {
    this.bucket = '';
  }

  private initializeBucket() {
    if (!this.bucketInitialized) {
      this.bucket = process.env.S3_BUCKET || '';
      if (!this.bucket) {
        throw new Error('S3_BUCKET environment variable is required');
      }
      this.bucketInitialized = true;
    }
  }

  async uploadFile(
    key: string,
    buffer: Buffer,
    contentType: string = 'application/octet-stream'
  ): Promise<S3UploadResult> {
    this.initializeBucket();
    
    const upload = new Upload({
      client: getS3Client(),
      params: {
        Bucket: this.bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
      },
    });

    const result = await upload.done();
    
    return {
      key,
      url: `${process.env.S3_ENDPOINT}/${this.bucket}/${key}`,
      size: buffer.length,
    };
  }

  async getObject(key: string): Promise<Buffer> {
    this.initializeBucket();
    
    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    const response = await getS3Client().send(command);
    if (!response.Body) {
      throw new Error(`Object not found: ${key}`);
    }

    const chunks: Uint8Array[] = [];
    const stream = response.Body as NodeJS.ReadableStream;
    
    for await (const chunk of stream) {
      chunks.push(chunk as Uint8Array);
    }
    
    return Buffer.concat(chunks);
  }

  async deleteObject(key: string): Promise<void> {
    this.initializeBucket();
    
    const command = new DeleteObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    await getS3Client().send(command);
  }

  async listObjects(prefix: string = ''): Promise<string[]> {
    this.initializeBucket();
    
    const command = new ListObjectsV2Command({
      Bucket: this.bucket,
      Prefix: prefix,
    });

    const response = await getS3Client().send(command);
    return response.Contents?.map((obj: any) => obj.Key || '') || [];
  }

  async objectExists(key: string): Promise<boolean> {
    this.initializeBucket();
    
    try {
      const command = new HeadObjectCommand({
        Bucket: this.bucket,
        Key: key,
      });

      await getS3Client().send(command);
      return true;
    } catch (error: any) {
      // If object doesn't exist, S3 returns NoSuchKey error
      if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) {
        return false;
      }
      // Re-throw other errors (network issues, auth problems, etc.)
      throw error;
    }
  }

  async getObjectMetadata(key: string): Promise<{ size: number; lastModified?: Date; contentType?: string }> {
    this.initializeBucket();
    
    const command = new HeadObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    const response = await getS3Client().send(command);
    
    return {
      size: response.ContentLength || 0,
      lastModified: response.LastModified,
      contentType: response.ContentType,
    };
  }

  async getSignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
    this.initializeBucket();

    const command = new GetObjectCommand({
      Bucket: this.bucket,
      Key: key,
    });

    return await getSignedUrl(getS3Client(), command, { expiresIn });
  }

  async getPresignedUploadUrl(key: string, contentType: string, expiresIn: number = 3600): Promise<string> {
    this.initializeBucket();

    const command = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    });

    return await getSignedUrl(getS3Client(), command, { expiresIn });
  }

  /**
   * Build a direct public URL for an S3 object.
   */
  getPublicUrl(key: string): string {
    this.initializeBucket();
    return `${process.env.S3_ENDPOINT}/${this.bucket}/${key}`;
  }

  generateKey(albumPath: string, filename: string, type: 'original' | 'thumbnail' = 'original'): string {
    // Handle undefined or null parameters
    if (!albumPath || !filename) {
      throw new Error(`Invalid parameters: albumPath=${albumPath}, filename=${filename}`);
    }
    
    // Clean and encode the path and filename properly for S3
    const cleanPath = albumPath.replace(/^\/+|\/+$/g, '').replace(/[<>:"|?*]/g, '_');
    const cleanFilename = filename.replace(/[<>:"|?*]/g, '_');
    
    if (type === 'thumbnail') {
      return `thumbnails/${cleanPath}/${cleanFilename}`;
    }
    
    return `photos/${cleanPath}/${cleanFilename}`;
  }
}

let s3Instance: S3Service | null = null;

export function getS3Service(): S3Service {
  if (!s3Instance) {
    s3Instance = new S3Service();
  }
  return s3Instance;
}

export const s3 = getS3Service();
