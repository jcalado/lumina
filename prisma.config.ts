import 'dotenv/config';
import path from 'node:path';
import { defineConfig } from 'prisma/config';

// Prisma 7 no longer auto-loads .env for the CLI and no longer reads the
// datasource URL from schema.prisma at runtime — configuration lives here.
export default defineConfig({
  schema: path.join('prisma', 'schema.prisma'),
  migrations: {
    path: path.join('prisma', 'migrations'),
  },
  datasource: {
    url: process.env.DATABASE_URL,
  },
});
