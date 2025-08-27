import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { processPhotoBatch } from '@/lib/face-detection';

// Interface for face data during processing
interface ProcessingFace {
  id: string;
  photoId: string;
  embedding: number[];
  confidence: number;
  boundingBox: any;
}

// Function to generate unique face IDs
function generateFaceId(): string {
  return `face_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// Function to calculate similarity between two face embeddings
function calculateFaceSimilarity(embedding1: number[], embedding2: number[]): number {
  if (embedding1.length !== embedding2.length) return 0;
  
  // Calculate cosine similarity
  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;
  
  for (let i = 0; i < embedding1.length; i++) {
    dotProduct += embedding1[i] * embedding2[i];
    norm1 += embedding1[i] * embedding1[i];
    norm2 += embedding2[i] * embedding2[i];
  }
  
  if (norm1 === 0 || norm2 === 0) return 0;
  
  return dotProduct / (Math.sqrt(norm1) * Math.sqrt(norm2));
}

// Efficient clustering using union-find for large datasets
function performClustering(faces: ProcessingFace[], similarityThreshold: number): Array<{
  faces: ProcessingFace[];
  representativeEmbedding: number[];
}> {
  const n = faces.length;
  if (n === 0) return [];
  
  // Normalize embeddings for faster cosine similarity calculation
  const normalizedFaces = faces.map(face => {
    const embedding = face.embedding;
    let norm = 0;
    for (let i = 0; i < embedding.length; i++) {
      norm += embedding[i] * embedding[i];
    }
    norm = Math.sqrt(norm);
    
    const normalizedEmbedding = norm === 0 ? embedding.slice() : embedding.map(v => v / norm);
    
    return {
      ...face,
      normalizedEmbedding
    };
  });
  
  // Union-Find data structure
  const parent = Array.from({ length: n }, (_, i) => i);
  
  function find(x: number): number {
    if (parent[x] !== x) {
      parent[x] = find(parent[x]);
    }
    return parent[x];
  }
  
  function union(x: number, y: number) {
    const rootX = find(x);
    const rootY = find(y);
    if (rootX !== rootY) {
      parent[rootY] = rootX;
    }
  }
  
  // Find similar faces and union them
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      // Dot product of normalized vectors gives cosine similarity
      let similarity = 0;
      const embA = normalizedFaces[i].normalizedEmbedding;
      const embB = normalizedFaces[j].normalizedEmbedding;
      
      for (let k = 0; k < embA.length; k++) {
        similarity += embA[k] * embB[k];
      }
      
      if (similarity >= similarityThreshold) {
        union(i, j);
      }
    }
  }
  
  // Group faces by their root parent
  const clusters = new Map<number, ProcessingFace[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    if (!clusters.has(root)) {
      clusters.set(root, []);
    }
    clusters.get(root)!.push(faces[i]);
  }
  
  // Create cluster objects with representative embeddings
  return Array.from(clusters.values()).map(clusterFaces => {
    // Calculate average embedding as representative
    const embeddingLength = clusterFaces[0].embedding.length;
    const avgEmbedding = new Array(embeddingLength).fill(0);
    
    for (const face of clusterFaces) {
      for (let i = 0; i < embeddingLength; i++) {
        avgEmbedding[i] += face.embedding[i];
      }
    }
    
    for (let i = 0; i < embeddingLength; i++) {
      avgEmbedding[i] /= clusterFaces.length;
    }
    
    return {
      faces: clusterFaces,
      representativeEmbedding: avgEmbedding
    };
  });
}

// Save clustered faces with temporary person assignments
async function intermediateClusteringAndSave(
  faces: ProcessingFace[],
  similarityThreshold: number,
  jobState: FaceRecognitionJobState
): Promise<void> {
  if (faces.length === 0) return;
  
  jobState.logs.push(`Clustering ${faces.length} faces...`);
  
  // Perform clustering
  const clusters = performClustering(faces, similarityThreshold);
  
  jobState.logs.push(`Created ${clusters.length} face clusters`);
  
  // Save faces to database with temporary person assignments
  for (let i = 0; i < clusters.length; i++) {
    const cluster = clusters[i];
    const tempPersonId = `temp_${Date.now()}_${i}_${Math.random().toString(36).substr(2, 9)}`;
    
    try {
      // Create temporary person
      await prisma.person.create({
        data: {
          id: tempPersonId,
          name: `Processing ${tempPersonId}`,
          confirmed: false
        }
      });

      // Save all faces in cluster
      for (const face of cluster.faces) {
        await prisma.face.create({
          data: {
            id: face.id,
            photoId: face.photoId,
            personId: tempPersonId,
            boundingBox: JSON.stringify(face.boundingBox),
            confidence: face.confidence,
            embedding: JSON.stringify(face.embedding)
          }
        });
      }
      
      // Update matched count (faces are already counted in facesDetected)
      jobState.facesMatched += cluster.faces.length;
      
    } catch (error) {
      console.error(`Error saving cluster ${i}:`, error);
      jobState.errors.push(`Error saving cluster: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

// Find groups of similar persons for consolidation
function findSimilarPersonGroups(
  persons: Array<{ id: string; faces: Array<{ embedding: string | null }> }>,
  similarityThreshold: number
): string[][] {
  const n = persons.length;
  if (n === 0) return [];
  
  // Extract representative embeddings for each person
  const personEmbeddings: Array<{ personId: string; embedding: number[] | null }> = [];
  
  for (const person of persons) {
    let representativeEmbedding: number[] | null = null;
    
    // Use the first valid embedding as representative (could be improved with averaging)
    for (const face of person.faces) {
      if (face.embedding) {
        try {
          representativeEmbedding = JSON.parse(face.embedding) as number[];
          break;
        } catch (e) {
          // Skip invalid embeddings
        }
      }
    }
    
    personEmbeddings.push({
      personId: person.id,
      embedding: representativeEmbedding
    });
  }
  
  // Union-Find for grouping similar persons
  const parent = Array.from({ length: n }, (_, i) => i);
  
  function find(x: number): number {
    if (parent[x] !== x) {
      parent[x] = find(parent[x]);
    }
    return parent[x];
  }
  
  function union(x: number, y: number) {
    const rootX = find(x);
    const rootY = find(y);
    if (rootX !== rootY) {
      parent[rootY] = rootX;
    }
  }
  
  // Compare all pairs of persons
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const embA = personEmbeddings[i].embedding;
      const embB = personEmbeddings[j].embedding;
      
      if (embA && embB) {
        const similarity = calculateFaceSimilarity(embA, embB);
        if (similarity >= similarityThreshold) {
          union(i, j);
        }
      }
    }
  }
  
  // Group person IDs by their root parent
  const groups = new Map<number, string[]>();
  for (let i = 0; i < n; i++) {
    const root = find(i);
    if (!groups.has(root)) {
      groups.set(root, []);
    }
    groups.get(root)!.push(personEmbeddings[i].personId);
  }
  
  // Return only groups with more than one person
  return Array.from(groups.values()).filter(group => group.length > 1);
}

// Merge multiple persons into a single person
async function mergePersons(personIds: string[], jobState: FaceRecognitionJobState): Promise<void> {
  if (personIds.length <= 1) return;
  
  try {
    // Keep the first person as the target
    const targetPersonId = personIds[0];
    const sourcePersonIds = personIds.slice(1);
    
    jobState.logs.push(`Merging ${sourcePersonIds.length} persons into ${targetPersonId}`);
    
    // Move all faces from source persons to target person
    for (const sourcePersonId of sourcePersonIds) {
      await prisma.face.updateMany({
        where: { personId: sourcePersonId },
        data: { personId: targetPersonId }
      });
    }
    
    // Delete the source persons
    await prisma.person.deleteMany({
      where: { id: { in: sourcePersonIds } }
    });
    
    jobState.logs.push(`Successfully merged ${sourcePersonIds.length} persons`);
    
  } catch (error) {
    console.error(`Error merging persons:`, error);
    jobState.errors.push(`Error merging persons: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Final person consolidation pass
async function consolidatePersons(similarityThreshold: number, jobState: FaceRecognitionJobState): Promise<void> {
  jobState.logs.push("Starting final person consolidation...");
  
  try {
    // Get all persons with their face embeddings (limit faces for performance)
    const persons = await prisma.person.findMany({
      include: {
        faces: {
          where: { embedding: { not: null } },
          take: 3, // Sample a few faces for comparison
          select: { embedding: true }
        }
      }
    });

    if (persons.length === 0) {
      jobState.logs.push("No persons found for consolidation");
      return;
    }

    // Find similar person groups
    const personGroups = findSimilarPersonGroups(persons, similarityThreshold);
    
    jobState.logs.push(`Found ${personGroups.length} groups of similar persons to merge`);
    
    // Merge persons in each group
    for (const group of personGroups) {
      await mergePersons(group, jobState);
    }

    // Update person names to be more descriptive
    const finalPersons = await prisma.person.findMany({
      include: { _count: { select: { faces: true } } }
    });
    
    for (const person of finalPersons) {
      if (person.name && (person.name.startsWith('Processing ') || person.name.startsWith('Person '))) {
        const newName = `Person ${person.id.slice(-8)} (${person._count.faces} faces)`;
        await prisma.person.update({
          where: { id: person.id },
          data: { name: newName }
        });
      }
    }
    
    jobState.logs.push(`Person consolidation completed. Final count: ${finalPersons.length} persons`);
    
  } catch (error) {
    console.error('Error in person consolidation:', error);
    jobState.errors.push(`Person consolidation error: ${error instanceof Error ? error.message : String(error)}`);
  }
}

// Function to group unassigned faces into people
async function groupUnassignedFaces(similarityThreshold: number, jobState: FaceRecognitionJobState): Promise<{
  newPeopleCreated: number;
  facesGrouped: number;
  groups: Array<{ personId: string; faceCount: number; }>;
}> {
  console.log('Starting unassigned face grouping...');
  
  // Get all unassigned faces with their embeddings using raw SQL
  const unassignedFaces = await prisma.$queryRaw<Array<{
    id: string;
    embedding: string;
    boundingBox: string;
    confidence: number;
    photoId: string;
  }>>`
  SELECT id, embedding, boundingBox, confidence, photoId 
  FROM faces 
  WHERE personId IS NULL AND embedding IS NOT NULL
  ORDER BY confidence DESC
  `;
  
  console.log(`Found ${unassignedFaces.length} unassigned faces to group`);
  
  if (unassignedFaces.length === 0) {
    return { newPeopleCreated: 0, facesGrouped: 0, groups: [] };
  }

  // Get all existing people with their face embeddings using a JOIN and build map
  const personFaceRows = await prisma.$queryRaw<Array<{
    personId: string | null;
    name: string | null;
    confirmed: number | null;
    faceId: string | null;
    embedding: string | null;
  }>>`
    SELECT p.id as personId, p.name as name, p.confirmed as confirmed, f.id as faceId, f.embedding as embedding
    FROM people p
    LEFT JOIN faces f ON f.personId = p.id AND f.embedding IS NOT NULL
    ORDER BY p.id
  `;

  const peopleMap = new Map<string, any>();
  for (const row of personFaceRows) {
    if (!row.personId) continue;
    if (!peopleMap.has(row.personId)) {
      peopleMap.set(row.personId, { id: row.personId, name: row.name, confirmed: !!row.confirmed, faces: [] });
    }
    if (row.faceId && row.embedding) {
      try {
        const emb = JSON.parse(row.embedding) as number[];
        peopleMap.get(row.personId).faces.push({ id: row.faceId, embeddingArray: emb });
      } catch (e) {
        // skip malformed embedding
      }
    }
  }

  const existingPeopleWithEmbeddings = Array.from(peopleMap.values());
  console.log(`Found ${existingPeopleWithEmbeddings.length} existing people to check against`);

  // Parse embeddings for unassigned faces
  const facesWithEmbeddings = unassignedFaces.map((face: any) => ({
    ...face,
    embeddingArray: JSON.parse(face.embedding) as number[]
  }));
  
  let newPeopleCreated = 0;
  let facesGrouped = 0;
  const createdGroups: Array<{ personId: string; faceCount: number }> = [];
  const remainingFaces = [...facesWithEmbeddings];
  
  // First, try to match unassigned faces to existing people
  for (const face of facesWithEmbeddings) {
    let bestMatchPersonId: string | null = null;
    let bestSimilarity = 0;
    
    // Check against all existing people
    for (const person of existingPeopleWithEmbeddings) {
      for (const existingFace of person.faces) {
        if (!existingFace) continue;
        const similarity = calculateFaceSimilarity(face.embeddingArray, existingFace.embeddingArray);
        
        if (similarity >= similarityThreshold && similarity > bestSimilarity) {
          bestSimilarity = similarity;
          bestMatchPersonId = person.id;
        }
      }
    }
    
    // If we found a match, assign the face to that person
    if (bestMatchPersonId) {
      try {
        await prisma.$executeRaw`
          UPDATE faces SET personId = ${bestMatchPersonId} WHERE id = ${face.id}
        `;
        
        facesGrouped++;
        
        // Update or add to groups list
        const existingGroup = createdGroups.find(g => g.personId === bestMatchPersonId);
        if (existingGroup) {
          existingGroup.faceCount++;
        } else {
          createdGroups.push({ personId: bestMatchPersonId, faceCount: 1 });
        }
        
        console.log(`Assigned face ${face.id} to existing person ${bestMatchPersonId} (similarity: ${bestSimilarity.toFixed(3)})`);
        
        // Remove from remaining faces
        const index = remainingFaces.findIndex(f => f.id === face.id);
        if (index > -1) {
          remainingFaces.splice(index, 1);
        }
      } catch (error) {
        console.error(`Error assigning face ${face.id} to person ${bestMatchPersonId}:`, error);
      }
    }
  }
  
  // Now group remaining unassigned faces among themselves using connected components (union-find)
  // Normalize embeddings first
  function normalize(vec: number[]) {
    const n = vec.length;
    let norm = 0;
    for (let i = 0; i < n; i++) norm += vec[i] * vec[i];
    norm = Math.sqrt(norm);
    if (norm === 0) return vec.slice();
    return vec.map(v => v / norm);
  }

  const rem = remainingFaces.map((f: any) => ({ ...f, embeddingNorm: normalize(f.embeddingArray) }));
  const m = rem.length;
  const parent: number[] = Array.from({ length: m }, (_, i) => i);
  function find(a: number): number { return parent[a] === a ? a : (parent[a] = find(parent[a])); }
  function union(a: number, b: number) { const ra = find(a), rb = find(b); if (ra !== rb) parent[rb] = ra; }

  for (let i = 0; i < m; i++) {
    for (let j = i + 1; j < m; j++) {
      // cosine similarity of normalized vectors is dot product
      let dot = 0;
      const a = rem[i].embeddingNorm, b = rem[j].embeddingNorm;
      for (let k = 0; k < a.length; k++) dot += a[k] * b[k];
      if (dot >= similarityThreshold) union(i, j);
    }
  }

  const clusters = new Map<number, any[]>();
  for (let i = 0; i < m; i++) {
    const r = find(i);
  if (!clusters.has(r)) clusters.set(r, []);
  const arr = clusters.get(r);
  if (arr) arr.push(rem[i]);
  }

  const groups: Array<{ faces: any[]; representativeFace: any }> = [];
  for (const cluster of clusters.values()) {
    // apply same rule: require multiple faces or high-confidence single
    if (cluster.length > 1) {
      groups.push({ faces: cluster, representativeFace: cluster[0] });
    }
  }
  
  console.log(`Created ${groups.length} new face groups from remaining unassigned faces`);
  
  // Create new people for each group
  for (let i = 0; i < groups.length; i++) {
    const group = groups[i];
    
    try {
      // Create person using raw SQL
      const personId = `person_${Date.now()}_${i + 1}`;
      const nowIso = new Date().toISOString();
      await prisma.$executeRaw`
        INSERT INTO people (id, name, confirmed, createdAt, updatedAt) 
        VALUES (${personId}, ${`Person ${Date.now()}-${i + 1}`}, false, ${nowIso}, ${nowIso})
      `;
      
      // Assign all faces in the group to this person
      const faceIds = group.faces.map((f: any) => f.id);
      for (const faceId of faceIds) {
        await prisma.$executeRaw`
          UPDATE faces SET personId = ${personId} WHERE id = ${faceId}
        `;
      }
      
      newPeopleCreated++;
      facesGrouped += group.faces.length;
      createdGroups.push({ personId: personId, faceCount: group.faces.length });
      
      console.log(`Created new person ${personId} with ${group.faces.length} faces`);
      
    } catch (error) {
      console.error(`Error creating group ${i + 1}:`, error);
      jobState.errors.push(`Error creating group ${i + 1}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  
  console.log(`Face grouping complete: ${facesGrouped} faces grouped, ${newPeopleCreated} new people created`);
  return { newPeopleCreated, facesGrouped, groups: createdGroups };
}

interface FaceRecognitionJobState {
  id: string;
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED' | 'PAUSED';
  progress: number;
  totalPhotos: number;
  processedPhotos: number;
  facesDetected: number;
  facesMatched: number;
  currentBatch?: string[];
  batchSize: number;
  logs: string[];
  errors: string[];
  startedAt?: Date;
  mode?: 'new_only' | 'reprocess_all'; // Processing mode
}

// In-memory job state management
const activeJobs = new Map<string, FaceRecognitionJobState>();

async function getSettings() {
  const settings = await prisma.siteSettings.findMany({
    where: {
      key: {
        in: [
          'faceRecognitionEnabled',
          'faceRecognitionBatchSize',
          'faceRecognitionConfidenceThreshold',
          'faceRecognitionSimilarityThreshold',
        ],
      },
    },
  });

  const settingsMap = settings.reduce((acc, setting) => {
    acc[setting.key] = setting.value;
    return acc;
  }, {} as Record<string, string>);

  return {
    enabled: settingsMap.faceRecognitionEnabled === 'true',
    batchSize: parseInt(settingsMap.faceRecognitionBatchSize || '4'),
    confidenceThreshold: parseFloat(settingsMap.faceRecognitionConfidenceThreshold || '0.5'),
    similarityThreshold: parseFloat(settingsMap.faceRecognitionSimilarityThreshold || '0.7'),
  };
}

async function updateJobInDatabase(jobId: string, jobState: FaceRecognitionJobState) {
  console.log(`Job ${jobId} status: ${jobState.status}, progress: ${jobState.progress}%`);
  console.log(`Processed: ${jobState.processedPhotos}/${jobState.totalPhotos} photos`);
  console.log(`Faces detected: ${jobState.facesDetected}, matched: ${jobState.facesMatched}`);
  
  // Calculate elapsed time and estimated time to finish
  if (jobState.startedAt) {
    const now = new Date();
    const elapsedMs = now.getTime() - jobState.startedAt.getTime();
    const elapsedSeconds = Math.floor(elapsedMs / 1000);
    const elapsedMinutes = Math.floor(elapsedSeconds / 60);
    const elapsedHours = Math.floor(elapsedMinutes / 60);
    
    let elapsedTimeStr = '';
    if (elapsedHours > 0) {
      elapsedTimeStr = `${elapsedHours}h ${elapsedMinutes % 60}m ${elapsedSeconds % 60}s`;
    } else if (elapsedMinutes > 0) {
      elapsedTimeStr = `${elapsedMinutes}m ${elapsedSeconds % 60}s`;
    } else {
      elapsedTimeStr = `${elapsedSeconds}s`;
    }
    
    console.log(`Elapsed time: ${elapsedTimeStr}`);
    
    // Calculate estimated time to finish (only if we have meaningful progress)
    if (jobState.progress > 0 && jobState.status === 'RUNNING') {
      const progressRatio = jobState.progress / 100;
      const estimatedTotalMs = elapsedMs / progressRatio;
      const remainingMs = estimatedTotalMs - elapsedMs;
      
      if (remainingMs > 0) {
        const remainingSeconds = Math.floor(remainingMs / 1000);
        const remainingMinutes = Math.floor(remainingSeconds / 60);
        const remainingHours = Math.floor(remainingMinutes / 60);
        
        let estimatedTimeStr = '';
        if (remainingHours > 0) {
          estimatedTimeStr = `${remainingHours}h ${remainingMinutes % 60}m ${remainingSeconds % 60}s`;
        } else if (remainingMinutes > 0) {
          estimatedTimeStr = `${remainingMinutes}m ${remainingSeconds % 60}s`;
        } else {
          estimatedTimeStr = `${remainingSeconds}s`;
        }
        
        console.log(`Estimated time to finish: ${estimatedTimeStr}`);
      }
    }
  }
  
  if (jobState.logs.length > 0) {
    console.log('Latest log:', jobState.logs[jobState.logs.length - 1]);
  }
}

// Process photos for face detection only (no person matching)
async function processPhotoBatchDetectionOnly(
  photoIds: string[],
  minConfidence: number
): Promise<Array<{
  photoId: string;
  faces: Array<{
    embedding: number[];
    confidence: number;
    boundingBox: any;
  }>;
  error?: string;
}>> {
  // Import the detection functions directly
  const { detectFacesInPhotoBatch, getImageBuffer } = await import('@/lib/face-detection');
  
  const detectionResults: Array<{
    photoId: string;
    faces: Array<{
      embedding: number[];
      confidence: number;
      boundingBox: any;
    }>;
    error?: string;
  }> = [];

  // Get photo data for the batch
  const photos = await Promise.all(
    photoIds.map(async (photoId) => {
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
          return { photoId, error: 'Photo not found' };
        }

        const imageBuffer = await getImageBuffer(photo.originalPath, photo.s3Key, photo.filename);
        return {
          photoId: photo.id,
          imageBuffer,
          filename: photo.filename
        };
      } catch (error) {
        return {
          photoId,
          error: error instanceof Error ? error.message : String(error)
        };
      }
    })
  );

  // Filter out failed photos and prepare for batch detection
  const validPhotos = photos.filter((photo): photo is { photoId: string; imageBuffer: Buffer; filename: string } => 
    'imageBuffer' in photo
  );

  if (validPhotos.length === 0) {
    return photoIds.map(photoId => ({ photoId, faces: [], error: 'No valid photos to process' }));
  }

  try {
    // Use the batch detection function directly
    const batchResults = await detectFacesInPhotoBatch(validPhotos, minConfidence);
    
    // Convert results to the expected format
    for (const result of batchResults) {
      if (result.error) {
        detectionResults.push({
          photoId: result.photoId,
          faces: [],
          error: result.error
        });
      } else {
        detectionResults.push({
          photoId: result.photoId,
          faces: result.faces.map(face => ({
            embedding: face.embedding,
            confidence: face.confidence,
            boundingBox: face.boundingBox
          }))
        });
      }
    }

    // Add any photos that failed during data retrieval
    for (const photo of photos) {
      if ('error' in photo) {
        detectionResults.push({
          photoId: photo.photoId,
          faces: [],
          error: photo.error
        });
      }
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return photoIds.map(photoId => ({
      photoId,
      faces: [],
      error: errorMessage
    }));
  }

  return detectionResults;
}

async function processJob(jobId: string) {
  const jobState = activeJobs.get(jobId);
  if (!jobState) return;

  try {
    const settings = await getSettings();
    
    // Get photos based on processing mode
    let photos: Array<{
      id: string;
      filename: string;
      s3Key: string;
    }>;
    
    if (jobState.mode === 'reprocess_all') {
      // If reprocessing all, delete existing faces first and reset face processing timestamps
      jobState.logs.push('Reprocessing all photos: clearing existing face data...');
      await prisma.face.deleteMany({});
      await prisma.photo.updateMany({
        data: { faceProcessedAt: null }
      });
      
      photos = await prisma.$queryRaw<Array<{
        id: string;
        filename: string;
        s3Key: string;
      }>>`
        SELECT id, filename, s3Key 
          FROM photos 
          LIMIT ${Math.min(jobState.totalPhotos)}
      `;
    } else {
      // Default: only process photos that haven't been processed yet
      photos = await prisma.$queryRaw<Array<{
        id: string;
        filename: string;
        s3Key: string;
      }>>`
        SELECT id, filename, s3Key 
          FROM photos 
          WHERE faceProcessedAt IS NULL
          LIMIT ${Math.min(jobState.totalPhotos)}
      `;
    }

    const photoIds = photos.map(p => p.id);
    jobState.totalPhotos = photoIds.length;

    if (photoIds.length === 0) {
      jobState.status = 'COMPLETED';
      jobState.logs.push('No photos found to process');
      await updateJobInDatabase(jobId, jobState);
      return;
    }

    jobState.status = 'RUNNING';
    jobState.startedAt = new Date();
    
    const LARGE_JOB_THRESHOLD = 1000;
    const CHECKPOINT_INTERVAL = 500;

    if (photoIds.length > LARGE_JOB_THRESHOLD) {
      // Use optimized approach for large jobs
      jobState.logs.push(`Large job detected (${photoIds.length} photos). Using optimized processing with checkpoints every ${CHECKPOINT_INTERVAL} photos.`);
      await updateJobInDatabase(jobId, jobState);
      
      // Store all face embeddings in memory for efficient clustering
      const allDetectedFaces: ProcessingFace[] = [];

      // Process photos in batches but don't create persons yet
      for (let i = 0; i < photoIds.length; i += settings.batchSize) {
        // Check if job was cancelled or paused
        const currentState = activeJobs.get(jobId);
        if (!currentState || currentState.status !== 'RUNNING') {
          jobState.logs.push('Job was stopped or paused');
          break;
        }

        const batch = photoIds.slice(i, i + settings.batchSize);
        jobState.currentBatch = batch;

        try {
          jobState.logs.push(`Processing detection batch ${Math.floor(i / settings.batchSize) + 1} with ${batch.length} photos`);
          
          // Detect faces only (no person matching yet)
          const detectionResults = await processPhotoBatchDetectionOnly(
            batch,
            settings.confidenceThreshold
          );

          // Store embeddings in memory and mark photos as processed
          for (const photoResult of detectionResults) {
            if (photoResult.error) {
              jobState.errors.push(`${photoResult.photoId}: ${photoResult.error}`);
              // Mark photo as processed even if it failed (to avoid reprocessing)
              await prisma.photo.update({
                where: { id: photoResult.photoId },
                data: { faceProcessedAt: new Date() }
              });
              continue;
            }
            
            for (const face of photoResult.faces) {
              if (face.embedding.length > 0) {
                allDetectedFaces.push({
                  id: generateFaceId(),
                  photoId: photoResult.photoId,
                  embedding: face.embedding,
                  confidence: face.confidence,
                  boundingBox: face.boundingBox
                });
                
                // Update face count immediately
                jobState.facesDetected++;
              }
            }
            
            // Mark photo as processed
            await prisma.photo.update({
              where: { id: photoResult.photoId },
              data: { faceProcessedAt: new Date() }
            });
          }

          jobState.processedPhotos += batch.length;
          
          // Log detection results for this batch
          const batchFaceCount = detectionResults.reduce((total, result) => total + result.faces.length, 0);
          jobState.logs.push(`Batch detected ${batchFaceCount} faces in ${batch.length} photos`);

          // Checkpoint: Every CHECKPOINT_INTERVAL photos, do intermediate clustering to manage memory
          if ((i + settings.batchSize) % CHECKPOINT_INTERVAL === 0 || i + settings.batchSize >= photoIds.length) {
            if (allDetectedFaces.length > 0) {
              jobState.logs.push(`Checkpoint reached. Clustering ${allDetectedFaces.length} faces...`);
              await intermediateClusteringAndSave(allDetectedFaces, settings.similarityThreshold, jobState);
              allDetectedFaces.length = 0; // Clear memory
            }
          }

          // Update progress
          jobState.progress = Math.round(((i + batch.length) / photoIds.length) * 80); // Reserve 20% for consolidation
          await updateJobInDatabase(jobId, jobState);

        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          jobState.errors.push(`Batch processing error: ${errorMessage}`);
          jobState.logs.push(`Error in batch ${Math.floor(i / settings.batchSize) + 1}: ${errorMessage}`);
          console.error(`Error processing batch for job ${jobId}:`, error);
        }
      }

      // Final clustering for any remaining faces
      if (allDetectedFaces.length > 0) {
        jobState.logs.push(`Final clustering of ${allDetectedFaces.length} remaining faces...`);
        await intermediateClusteringAndSave(allDetectedFaces, settings.similarityThreshold, jobState);
      }

      // Final person consolidation pass
      if (jobState.status === 'RUNNING') {
        jobState.logs.push('Starting final person consolidation...');
        jobState.progress = 85;
        await updateJobInDatabase(jobId, jobState);
        
        try {
          await consolidatePersons(settings.similarityThreshold, jobState);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          jobState.logs.push(`Person consolidation error: ${errorMessage}`);
          jobState.errors.push(`Person consolidation failed: ${errorMessage}`);
        }
      }

    } else {
      // Use existing logic for smaller jobs
      jobState.logs.push(`Standard job processing ${photoIds.length} photos in batches of ${settings.batchSize}`);
      await updateJobInDatabase(jobId, jobState);

      // Process photos in batches
      for (let i = 0; i < photoIds.length; i += settings.batchSize) {
        // Check if job was cancelled or paused
        const currentState = activeJobs.get(jobId);
        if (!currentState || currentState.status !== 'RUNNING') {
          jobState.logs.push('Job was stopped or paused');
          break;
        }

        const batch = photoIds.slice(i, i + settings.batchSize);
        jobState.currentBatch = batch;

        try {
          jobState.logs.push(`Processing batch ${Math.floor(i / settings.batchSize) + 1} with ${batch.length} photos`);
          
          const result = await processPhotoBatch(
            batch,
            settings.confidenceThreshold,
            settings.similarityThreshold,
            (processed, total) => {
              // Update progress for current batch
              const batchProgress = processed / total;
              const overallProgress = (i + (batchProgress * batch.length)) / photoIds.length;
              jobState.progress = Math.round(overallProgress * 100);
            }
          );

          jobState.processedPhotos += result.processed;
          jobState.errors.push(...result.errors);

          // Count actual faces detected for this batch using raw SQL
          const placeholders = batch.map(() => '?').join(',');
          const facesDetectedResult = await prisma.$queryRawUnsafe(
            `SELECT COUNT(*) as count FROM faces WHERE photoId IN (${placeholders})`,
            ...batch
          ) as { count: number }[];
          let facesDetectedRaw = facesDetectedResult[0]?.count ?? 0;
          const facesDetectedCount = typeof facesDetectedRaw === 'bigint' ? Number(facesDetectedRaw) : Number(facesDetectedRaw || 0);
          
          const facesMatchedResult = await prisma.$queryRawUnsafe(
            `SELECT COUNT(*) as count FROM faces WHERE photoId IN (${placeholders}) AND personId IS NOT NULL`,
            ...batch
          ) as { count: number }[];
          let facesMatchedRaw = facesMatchedResult[0]?.count ?? 0;
          const facesMatchedCount = typeof facesMatchedRaw === 'bigint' ? Number(facesMatchedRaw) : Number(facesMatchedRaw || 0);

          jobState.facesDetected += facesDetectedCount;
          jobState.facesMatched += facesMatchedCount;

          // Mark all photos in this batch as processed
          for (const photoId of batch) {
            try {
              await prisma.$executeRaw`
                UPDATE photos SET faceProcessedAt = ${new Date().toISOString()} WHERE id = ${photoId}
              `;
            } catch (error) {
              console.error(`Error marking photo ${photoId} as processed:`, error);
            }
          }

          jobState.logs.push(
            `Batch ${Math.floor(i / settings.batchSize) + 1} completed: ${result.processed}/${batch.length} photos processed`
          );
          
          jobState.logs.push(
            `Detected ${facesDetectedCount} faces, matched ${facesMatchedCount} faces in this batch`
          );

          if (result.errors.length > 0) {
            jobState.logs.push(`Batch had ${result.errors.length} errors`);
          }

          // Update progress
          jobState.progress = Math.round(((i + batch.length) / photoIds.length) * 100);
          await updateJobInDatabase(jobId, jobState);

        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          jobState.errors.push(`Batch processing error: ${errorMessage}`);
          jobState.logs.push(`Error in batch ${Math.floor(i / settings.batchSize) + 1}: ${errorMessage}`);
          console.error(`Error processing batch for job ${jobId}:`, error);
        }
      }

      // For smaller jobs, still do the traditional grouping
      if (jobState.status === 'RUNNING') {
        jobState.logs.push('Starting automatic face grouping...');
        await updateJobInDatabase(jobId, jobState);
        
        try {
          const groupingResult = await groupUnassignedFaces(settings.similarityThreshold, jobState);
          jobState.logs.push(`Face grouping completed: ${groupingResult.newPeopleCreated} new people created from ${groupingResult.facesGrouped} faces`);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          jobState.logs.push(`Face grouping error: ${errorMessage}`);
          jobState.errors.push(`Face grouping failed: ${errorMessage}`);
        }
      }
    }

    if (jobState.status === 'RUNNING') {
      jobState.status = 'COMPLETED';
      jobState.progress = 100;
      jobState.logs.push(`Job completed successfully! Processed ${jobState.processedPhotos} photos, detected ${jobState.facesDetected} faces, matched ${jobState.facesMatched} faces`);
    }

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    jobState.status = 'FAILED';
    jobState.errors.push(errorMessage);
    jobState.logs.push(`Job failed: ${errorMessage}`);
    console.error(`Job ${jobId} failed:`, error);
  } finally {
    jobState.currentBatch = undefined;
    await updateJobInDatabase(jobId, jobState);
  }
}

// GET: Get job status
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const jobId = searchParams.get('jobId');

    if (jobId) {
      // Get specific job status
      const jobState = activeJobs.get(jobId);
      
      if (!jobState) {
        return NextResponse.json({ error: 'Job not found' }, { status: 404 });
      }
      
      // Calculate elapsed time and estimated time for the response
      let elapsedTimeMs = 0;
      let estimatedTimeRemainingMs = 0;
      
      if (jobState.startedAt) {
        const now = new Date();
        elapsedTimeMs = now.getTime() - jobState.startedAt.getTime();
        
        if (jobState.progress > 0 && jobState.status === 'RUNNING') {
          const progressRatio = jobState.progress / 100;
          const estimatedTotalMs = elapsedTimeMs / progressRatio;
          estimatedTimeRemainingMs = Math.max(0, estimatedTotalMs - elapsedTimeMs);
        }
      }
      
      return NextResponse.json({
        id: jobState.id,
        status: jobState.status,
        progress: jobState.progress,
        totalPhotos: jobState.totalPhotos,
        processedPhotos: jobState.processedPhotos,
        facesDetected: jobState.facesDetected,
        facesMatched: jobState.facesMatched,
        logs: jobState.logs,
        errors: jobState.errors,
        currentBatch: jobState.currentBatch,
        elapsedTimeMs,
        estimatedTimeRemainingMs,
        startedAt: jobState.startedAt,
      });
    } else {
      // Get overall status
      const settings = await getSettings();
      const runningJobs = Array.from(activeJobs.values()).filter(job => 
        job.status === 'RUNNING' || job.status === 'PENDING'
      );
      
      return NextResponse.json({
        enabled: settings.enabled,
        status: runningJobs.length > 0 ? 'running' : 'ready',
        activeJobs: runningJobs.length,
        jobs: Array.from(activeJobs.values()).slice(-5), // Last 5 jobs
      });
    }
  } catch (error) {
    console.error('Error fetching face recognition status:', error);
    return NextResponse.json(
      { error: 'Failed to fetch status', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

// POST: Start new job
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const { mode = 'new_only' } = body; // 'new_only' | 'reprocess_all'
    
    const settings = await getSettings();
    
    if (!settings.enabled) {
      return NextResponse.json(
        { error: 'Face recognition is disabled' },
        { status: 403 }
      );
    }

    // Check if there's already a running job
    const runningJob = Array.from(activeJobs.values()).find(job => 
      job.status === 'RUNNING' || job.status === 'PENDING'
    );

    if (runningJob) {
      return NextResponse.json(
        { error: 'A face recognition job is already running', jobId: runningJob.id },
        { status: 409 }
      );
    }

    // Count photos to process based on mode
    let photoCountResult: { count: number }[];
    if (mode === 'reprocess_all') {
      photoCountResult = await prisma.$queryRaw<{ count: number }[]>`
        SELECT COUNT(*) as count FROM photos
      `;
    } else {
      // Default: only process photos that haven't been processed yet
      photoCountResult = await prisma.$queryRaw<{ count: number }[]>`
        SELECT COUNT(*) as count FROM photos WHERE faceProcessedAt IS NULL
      `;
    }
  let photoCountRaw = photoCountResult[0]?.count ?? 0;
  const photoCount = typeof photoCountRaw === 'bigint' ? Number(photoCountRaw) : Number(photoCountRaw);

    if (photoCount === 0) {
      const errorMessage = mode === 'reprocess_all' 
        ? 'No photos found to process' 
        : 'No unprocessed photos found. All photos have already been processed for faces.';
      return NextResponse.json(
        { error: errorMessage },
        { status: 400 }
      );
    }

    // Create job ID
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Initialize job state
    const jobState: FaceRecognitionJobState = {
      id: jobId,
      status: 'PENDING',
      progress: 0,
      totalPhotos: Math.min(photoCount), // Limit for testing
      processedPhotos: 0,
      facesDetected: 0,
      facesMatched: 0,
      batchSize: settings.batchSize,
      logs: [`Job created to ${mode === 'reprocess_all' ? 'reprocess all' : 'process new'} ${Math.min(photoCount)} photos`],
      errors: [],
      mode: mode, // Store mode in job state
    };

    activeJobs.set(jobId, jobState);

    // Start processing in background
    processJob(jobId).catch(console.error);

    return NextResponse.json({ 
      jobId: jobId, 
      totalPhotos: jobState.totalPhotos,
      message: 'Face recognition job started successfully'
    });
  } catch (error) {
    console.error('Error starting face recognition job:', error);
    return NextResponse.json(
      { error: 'Failed to start job', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}

// PATCH: Pause/Resume/Cancel job
export async function PATCH(request: NextRequest) {
  try {
    const { action, jobId } = await request.json();

    if (!jobId || !['pause', 'resume', 'cancel'].includes(action)) {
      return NextResponse.json(
        { error: 'Invalid action or missing jobId' },
        { status: 400 }
      );
    }

    const jobState = activeJobs.get(jobId);
    if (!jobState) {
      return NextResponse.json({ error: 'Job not found' }, { status: 404 });
    }

    switch (action) {
      case 'pause':
        if (jobState.status === 'RUNNING') {
          jobState.status = 'PAUSED';
          jobState.logs.push('Job paused by user');
          await updateJobInDatabase(jobId, jobState);
        }
        break;

      case 'resume':
        if (jobState.status === 'PAUSED') {
          jobState.status = 'RUNNING';
          jobState.logs.push('Job resumed by user');
          await updateJobInDatabase(jobId, jobState);
          processJob(jobId).catch(console.error);
        }
        break;

      case 'cancel':
        jobState.status = 'CANCELLED';
        jobState.logs.push('Job cancelled by user');
        await updateJobInDatabase(jobId, jobState);
        activeJobs.delete(jobId);
        break;
    }

    return NextResponse.json({ success: true, status: jobState.status });
  } catch (error) {
    console.error('Error updating job:', error);
    return NextResponse.json(
      { error: 'Failed to update job', details: error instanceof Error ? error.message : String(error) },
      { status: 500 }
    );
  }
}
