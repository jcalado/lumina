# Lumina Photo Gallery

A beautiful, modern photo gallery web application built with Next.js 15.5, designed for photographers and photo enthusiasts to organize and share their work.

## Features

### Phase 1 (Current) - Core Infrastructure
- ✅ Next.js 15.5 with TypeScript and App Router
- ✅ SQLite database with Prisma ORM
- ✅ S3-compatible storage integration
- ✅ File system scanner for photo discovery
- ✅ Basic API routes for albums and sync
- ✅ Responsive UI with Tailwind CSS and shadcn/ui

### Planned Features
- Photo lightbox with keyboard navigation
- Album favorites system
- Admin dashboard with authentication
- Background thumbnail generation
- Zip download with progress tracking
- EXIF data display
- Sort and filter options

## Getting Started

### Prerequisites
- Node.js 18+ 
- Redis server (for background jobs)
- S3-compatible storage (AWS S3, MinIO, etc.)

### Installation

1. Clone the repository:
```bash
git clone <repository-url>
cd lumina-photo-gallery
```

2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. Initialize the database:
```bash
npx prisma generate
npx prisma db push
npx prisma db seed
```

5. Start the development server:
```bash
npm run dev
```

Visit `http://localhost:3000` to see the application.

## Environment Variables

Create a `.env` file with the following variables:

```env
# Database
DATABASE_URL="file:./dev.db"

# S3 Configuration
S3_ENDPOINT="https://s3.amazonaws.com"
S3_BUCKET="your-bucket-name"
S3_ACCESS_KEY="your-access-key"
S3_SECRET_KEY="your-secret-key"
S3_REGION="us-east-1"

# Redis (for BullMQ)
REDIS_URL="redis://localhost:6379"

# Authentication
NEXTAUTH_SECRET="generate-a-secure-secret-key"
NEXTAUTH_URL="http://localhost:3000"
ADMIN_EMAIL="admin@yourdomain.com"
ADMIN_PASSWORD="create-a-secure-password"

# File System
PHOTOS_ROOT_PATH="/path/to/your/photos/directory"

# Sync Schedule (cron format)
SYNC_CRON="0 3 * * *"
```

## Project Structure

```
├── app/                    # Next.js App Router
│   ├── api/               # API routes
│   ├── albums/            # Album pages
│   └── page.tsx           # Home page
├── components/            # React components
│   └── ui/               # shadcn/ui components
├── lib/                  # Utility libraries
│   ├── prisma.ts         # Database client
│   ├── s3.ts             # S3 operations
│   ├── filesystem.ts     # Photo scanning
│   └── utils.ts          # Helper functions
├── prisma/               # Database schema and migrations
└── public/               # Static assets
```

## Usage

### Organizing Photos

1. Create folders in your designated photos directory
2. Add photos (JPG, PNG) to these folders
3. Optionally add a `project.md` file in each folder for descriptions
4. Use the "Sync Photos" button to scan for new content

### API Endpoints

- `GET /api/albums` - List all public albums
- `GET /api/albums/[...path]` - Get specific album with photos
- `POST /api/sync` - Trigger photo sync

## Development

### Database Operations

```bash
# Generate Prisma client
npx prisma generate

# Push schema changes
npx prisma db push

# View database
npx prisma studio

# Reset database
npx prisma db push --force-reset
```

### Adding Components

This project uses shadcn/ui for components:

```bash
npx shadcn@latest add [component-name]
```

## License

This project is licensed under the MIT License.

## Contributing

Contributions are welcome! Please read the contributing guidelines before submitting PRs.

## Support

For support and questions, please open an issue in the GitHub repository.
