import { PrismaClient } from '@prisma/client';
import { createPrismaClient } from './prisma-client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

const prismaInstance: PrismaClient = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prismaInstance;

export const prisma = prismaInstance;
export { createPrismaClient };
