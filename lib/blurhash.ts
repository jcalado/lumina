import { prisma } from '@/lib/prisma'
import { S3Service } from '@/lib/s3'
import sharp from 'sharp'
import { encode } from 'blurhash'
import * as fs from 'fs/promises'
import * as path from 'path'

async function readLocalPhoto(originalPath: string): Promise<Buffer | null> {
  try {
    const photosRoot = process.env.PHOTOS_ROOT_PATH
    if (!photosRoot) return null
    const fullPath = path.isAbsolute(originalPath) ? originalPath : path.join(photosRoot, originalPath)
    await fs.access(fullPath)
    return await fs.readFile(fullPath)
  } catch {
    return null
  }
}

async function downloadFromS3(s3Key: string): Promise<Buffer> {
  const s3 = new S3Service()
  return s3.getObject(s3Key)
}

async function generateBlurhashFromImage(buffer: Buffer): Promise<string> {
  const { data, info } = await sharp(buffer)
    .resize(32, 32, { fit: 'cover' })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  return encode(new Uint8ClampedArray(data), info.width, info.height, 4, 4)
}

export async function processBlurhashForPhoto(job: { photoId: string; originalPath: string; s3Key: string }) {
  const local = await readLocalPhoto(job.originalPath)
  const buffer = local ?? (await downloadFromS3(job.s3Key))
  const blurhash = await generateBlurhashFromImage(buffer)
  await prisma.photo.update({ where: { id: job.photoId }, data: { blurhash } })
  return { success: true }
}

