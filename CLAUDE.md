# Photo Gallery App Development Guide

## Project Overview
Build a public photo gallery web app similar to Pixieset using Next.js 15.5. The app serves photos from S3-compatible storage with nested folder navigation, admin controls, and user-friendly features.

## Key Requirements

### Core Features
- Browse photo gallery albums with nested folder support
- Read album descriptions from `project.md` files
- Download albums as zip files with progress tracking
- Mark albums as favorites (localStorage)
- Admin dashboard for album management
- Lightbox modal with keyboard navigation
- EXIF data display option
- Sort photos by date taken

### Technical Constraints
- **Supported formats**: JPG, PNG (RAW optional)
- **Thumbnail generation**: Pre-generated async tasks (3 sizes: small/medium/large)
- **Access control**: Admin dashboard only, gallery is public
- **Album visibility**: Public (listed) vs Private (direct link only)
- **Storage**: S3-compatible storage
- **Scale**: Hundreds to thousands of photos per album

## Architecture

### Tech Stack
- **Framework**: Next.js 15.5 (App Router) with TypeScript
- **Database**: SQLite with Prisma ORM (PostgreSQL migration ready)
- **Storage**: S3-compatible (AWS S3/MinIO/DigitalOcean Spaces)
- **Image Processing**: Sharp.js
- **Authentication**: NextAuth.js (admin only)
- **Background Jobs**: BullMQ with Redis
- **UI**: Tailwind CSS + shadcn/ui components
- **State Management**: React hooks + Context API

### Database Schema

```typescript
// Album
model Album {
  id          String   @id @default(cuid())
  path        String   @unique // filesystem path
  name        String
  description String?  // from project.md
  status      Status   @default(PUBLIC) // PUBLIC | PRIVATE
  enabled     Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  photos      Photo[]
}

enum Status {
  PUBLIC
  PRIVATE
}

// Photo
model Photo {
  id           String      @id @default(cuid())
  albumId      String
  filename     String
  originalPath String
  s3Key        String
  metadata     Json?       // EXIF data
  fileSize     Int
  takenAt      DateTime?   // from EXIF
  createdAt    DateTime    @default(now())
  album        Album       @relation(fields: [albumId], references: [id])
  thumbnails   Thumbnail[]
}

// Thumbnail
model Thumbnail {
  id      String        @id @default(cuid())
  photoId String
  size    ThumbnailSize
  s3Key   String
  width   Int
  height  Int
  photo   Photo         @relation(fields: [photoId], references: [id])
}

enum ThumbnailSize {
  SMALL   // 300px grid thumbnails
  MEDIUM  // 800px preview
  LARGE   // 1200px lightbox
}

// Background Jobs
model SyncJob {
  id          String    @id @default(cuid())
  status      JobStatus @default(PENDING)
  progress    Int       @default(0)
  startedAt   DateTime?
  completedAt DateTime?
  errors      Json?
}

enum JobStatus {
  PENDING
  RUNNING
  COMPLETED
  FAILED
}
```

### API Routes Structure

```
/api/albums                    - GET: List public albums
/api/albums/[...path]         - GET: Get album with photos by path
/api/photos/[id]              - GET: Photo details with EXIF
/api/photos/[id]/download     - GET: Direct photo download
/api/download/[albumId]       - POST: Start zip generation
/api/download/[albumId]/status - GET: Check zip progress
/api/download/[albumId]/file  - GET: Download completed zip

// Admin routes (protected)
/api/admin/sync               - POST: Trigger manual sync
/api/admin/sync/status        - GET: Get sync job status
/api/admin/albums             - GET: List all albums (including private)
/api/admin/albums/[id]        - PUT: Update album settings
/api/admin/albums/[id]/toggle - PUT: Enable/disable album
```

### Component Structure

```
app/
├── layout.tsx
├── page.tsx                  // Album listing
├── albums/
│   └── [...path]/
│       └── page.tsx          // Album view
├── favorites/
│   └── page.tsx              // Favorites listing
└── admin/
    ├── layout.tsx            // Protected layout
    ├── page.tsx              // Dashboard
    └── albums/
        └── page.tsx          // Album management

components/
├── Gallery/
│   ├── AlbumGrid.tsx         // Grid of album cards
│   ├── PhotoGrid.tsx         // Grid of photos with favorites
│   ├── Lightbox.tsx          // Modal with keyboard nav
│   ├── Breadcrumbs.tsx       // Navigation path
│   └── SortControls.tsx      // Date/name sorting
├── Admin/
│   ├── Dashboard.tsx         // Admin overview
│   ├── SyncStatus.tsx        // Sync job progress
│   ├── AlbumManager.tsx      // Album CRUD operations
│   └── AlbumSettings.tsx     // Public/private toggle
├── Favorites/
│   ├── FavoriteButton.tsx    // Heart icon toggle
│   └── FavoritesList.tsx     // Favorites page
├── Download/
│   ├── DownloadButton.tsx    // Zip download trigger
│   └── ProgressModal.tsx     // Download progress
└── ui/
    ├── button.tsx            // shadcn/ui components
    ├── card.tsx
    ├── dialog.tsx
    ├── input.tsx
    ├── progress.tsx
    └── toast.tsx
```

## Development Phases

### Phase 1: Core Infrastructure (Week 1-2)

**Objectives**: Set up project foundation and basic data flow

**Tasks**:
1. **Project Setup**
   ```bash
   npx create-next-app@latest photo-gallery --typescript --tailwind --eslint --app
   cd photo-gallery
   
   # Install core dependencies
   npm install prisma @prisma/client sharp aws-sdk bullmq redis
   npm install -D @types/node
   
   # Install and setup shadcn/ui
   npx shadcn@latest init
   npx shadcn@latest add button card input dialog progress toast
   ```

2. **Database Setup**
   - Initialize Prisma with SQLite
   - Create schema as defined above
   - Set up migrations and seed data

3. **S3 Integration**
   - Configure AWS SDK or compatible client
   - Create upload/download utilities
   - Set up environment variables

4. **File System Scanner**
   - Create utility to recursively scan photo directories
   - Parse `project.md` files for descriptions
   - Extract EXIF data using Sharp.js

5. **Basic API Routes**
   - `/api/albums` - List albums
   - `/api/albums/[...path]` - Get album details
   - `/api/sync` - Trigger folder sync

**Deliverables**:
- Working Next.js project with database
- S3 file operations
- Basic folder sync functionality
- Simple API endpoints

### Phase 2: Gallery Frontend (Week 2-3)

**Objectives**: Build user-facing gallery interface

**Tasks**:
1. **Album Navigation**
   - Create album grid component
   - Implement breadcrumb navigation
   - Handle nested folder structure

2. **Photo Display**
   - Build responsive photo grid
   - Implement lazy loading
   - Add photo metadata display

3. **Lightbox Modal**
   - Create modal component with Sharp UI
   - Add keyboard navigation (arrow keys, ESC)
   - Implement swipe gestures for mobile

4. **Responsive Design**
   - Mobile-first approach
   - Grid layouts that adapt to screen size
   - Touch-friendly interactions

**Deliverables**:
- Functional photo gallery
- Working lightbox with navigation
- Mobile-responsive design
- Basic album browsing

### Phase 3: Advanced Features (Week 3-4)

**Objectives**: Add admin functionality and user features

**Tasks**:
1. **Admin Authentication**
   - Set up NextAuth.js with credentials
   - Create protected admin routes
   - Build admin layout component

2. **Thumbnail Generation**
   - Implement BullMQ job queue
   - Create thumbnail generation worker
   - Generate multiple sizes (small/medium/large)

3. **Zip Download System**
   - Create zip generation job
   - Implement progress tracking
   - Stream files from S3 to zip

4. **Favorites System**
   - LocalStorage integration
   - Favorite button component
   - Favorites listing page

5. **Album Management**
   - Admin dashboard for album settings
   - Public/private toggle
   - Enable/disable functionality

**Deliverables**:
- Working admin dashboard
- Async thumbnail generation
- Zip download with progress
- Favorites functionality

### Phase 4: Polish & Optimization (Week 4-5)

**Objectives**: Performance optimization and UX improvements

**Tasks**:
1. **EXIF Data Display**
   - Create metadata viewer component
   - Format camera settings, dates, etc.
   - Toggle visibility option

2. **Sorting & Filtering**
   - Sort by date taken, filename
   - Filter by date ranges
   - Search functionality (future enhancement)

3. **Performance Optimization**
   - Implement proper caching strategies
   - Optimize database queries
   - Add loading states and skeletons

4. **Error Handling**
   - Graceful error boundaries
   - User-friendly error messages
   - Retry mechanisms for failed operations

5. **Background Jobs**
   - Scheduled sync at 3AM
   - Job monitoring and logging
   - Failed job retry logic

**Deliverables**:
- Complete feature set
- Optimized performance
- Production-ready application
- Comprehensive error handling

## Environment Variables

```env
# Database
DATABASE_URL="file:./dev.db"

# S3 Configuration
S3_ENDPOINT="https://s3.amazonaws.com"
S3_BUCKET="photo-gallery"
S3_ACCESS_KEY=""
S3_SECRET_KEY=""
S3_REGION="us-east-1"

# Redis (for BullMQ)
REDIS_URL="redis://localhost:6379"

# Authentication
NEXTAUTH_SECRET="your-secret-key"
NEXTAUTH_URL="http://localhost:3000"
ADMIN_EMAIL="admin@example.com"
ADMIN_PASSWORD="secure-password"

# File System
PHOTOS_ROOT_PATH="/path/to/photos"

# Sync Schedule
SYNC_CRON="0 3 * * *"  # 3AM daily
```

## Development Guidelines

### Code Style
- Use TypeScript strictly
- Follow Next.js 15.5 App Router patterns
- Use shadcn/ui components for consistent UI
- Follow shadcn/ui naming conventions (lowercase files)
- Implement proper error boundaries
- Write meaningful commit messages

### Performance Considerations
- Implement proper image lazy loading
- Use Next.js Image component
- Cache database queries appropriately
- Optimize S3 operations with multipart uploads
- Use proper loading states

### Security
- Validate all user inputs
- Sanitize file paths
- Implement proper CORS policies
- Use environment variables for secrets
- Secure admin routes properly

### Testing Strategy
- Unit tests for utilities and helpers
- Integration tests for API routes
- E2E tests for critical user flows
- Performance testing for large albums

## Deployment Considerations

### Infrastructure Requirements
- Node.js runtime
- Redis instance for job queue
- S3-compatible storage
- SQLite file or PostgreSQL database

### Scaling Strategy
- Database migration path to PostgreSQL
- CDN integration for image delivery
- Horizontal scaling for background jobs
- Caching layer (Redis/Memcached)

## Future Enhancements

### Phase 5+ Features
- **Search functionality**: Full-text search across descriptions and metadata
- **Social sharing**: Direct links to photos and albums
- **Bulk operations**: Mass photo management tools
- **Analytics**: View counts and popular albums
- **API versioning**: RESTful API for external integrations
- **Mobile app**: React Native companion app
- **Watermarking**: Automatic watermark application
- **User accounts**: Multi-user support with permissions
- **Comments**: User feedback on photos/albums
- **Slideshow mode**: Automatic photo progression
