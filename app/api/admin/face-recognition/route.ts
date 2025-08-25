import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { processPhotoBatch } from '@/lib/face-detection';

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
  
  if (jobState.logs.length > 0) {
    console.log('Latest log:', jobState.logs[jobState.logs.length - 1]);
  }
}

async function processJob(jobId: string) {
  const jobState = activeJobs.get(jobId);
  if (!jobState) return;

  try {
    const settings = await getSettings();
    
    // Get photos that haven't been processed yet using raw SQL
    const photos = await prisma.$queryRaw<Array<{
      id: string;
      filename: string;
      s3Key: string;
    }>>`
      SELECT id, filename, s3Key 
        FROM photos 
        LIMIT ${Math.min(jobState.totalPhotos)}
    `;

    const photoIds = photos.map(p => p.id);
    jobState.totalPhotos = photoIds.length;

    if (photoIds.length === 0) {
      jobState.status = 'COMPLETED';
      jobState.logs.push('No photos found to process');
      await updateJobInDatabase(jobId, jobState);
      return;
    }

    jobState.status = 'RUNNING';
    jobState.logs.push(`Starting to process ${photoIds.length} photos in batches of ${settings.batchSize}`);
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

    if (jobState.status === 'RUNNING') {
      // After processing all photos, group unassigned faces
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
      
      jobState.status = 'COMPLETED';
      jobState.progress = 100;
      jobState.logs.push(`Job completed successfully! Processed ${jobState.processedPhotos} photos, detected ${jobState.facesDetected} faces`);
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

    // Count photos to process using raw SQL
    const photoCountResult = await prisma.$queryRaw<{ count: number }[]>`
      SELECT COUNT(*) as count FROM photos
    `;
  let photoCountRaw = photoCountResult[0]?.count ?? 0;
  const photoCount = typeof photoCountRaw === 'bigint' ? Number(photoCountRaw) : Number(photoCountRaw);

    if (photoCount === 0) {
      return NextResponse.json(
        { error: 'No photos found to process' },
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
  logs: [`Job created to process ${Math.min(photoCount)} photos`],
      errors: [],
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
