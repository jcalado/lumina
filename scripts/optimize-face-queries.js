// Performance optimization script for face queries
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function optimizeFaceQueries() {
  console.log('Applying face query optimizations...');

  try {
    // Test the optimized query from delete-single-face-people.js
    console.log('Testing optimized single face people query...');
    const startTime = Date.now();

    const singleFacePeople = await prisma.$queryRaw`
      SELECT
        p.id as personId,
        p.name,
        f.id as faceId
      FROM Person p
      INNER JOIN Face f ON p.id = f.personId
      WHERE p.id IN (
        SELECT personId
        FROM Face
        GROUP BY personId
        HAVING COUNT(*) = 1
      )
    `;

    const queryTime = Date.now() - startTime;
    console.log(`Query completed in ${queryTime}ms, found ${singleFacePeople.length} people`);

    // Test additional optimized queries
    console.log('Testing unassigned faces query...');
    const unassignedStart = Date.now();

    const unassignedFaces = await prisma.face.findMany({
      where: {
        personId: null,
        ignored: false,
      },
      select: {
        id: true,
        confidence: true,
        photoId: true,
      },
      orderBy: {
        confidence: 'desc',
      },
      take: 100,
    });

    const unassignedTime = Date.now() - unassignedStart;
    console.log(`Unassigned faces query completed in ${unassignedTime}ms, found ${unassignedFaces.length} faces`);

    // Test face similarity query pattern
    console.log('Testing face similarity query pattern...');
    const similarityStart = Date.now();

    const highConfidenceFaces = await prisma.face.findMany({
      where: {
        confidence: {
          gte: 0.8,
        },
        personId: null,
        ignored: false,
        embedding: {
          not: null,
        },
      },
      select: {
        id: true,
        confidence: true,
        embedding: true,
      },
      orderBy: {
        confidence: 'desc',
      },
      take: 50,
    });

    const similarityTime = Date.now() - similarityStart;
    console.log(`Similarity query completed in ${similarityTime}ms, found ${highConfidenceFaces.length} faces`);

    console.log('\nOptimization results:');
    console.log(`- Single face people query: ${queryTime}ms`);
    console.log(`- Unassigned faces query: ${unassignedTime}ms`);
    console.log(`- High confidence faces query: ${similarityTime}ms`);

    // Provide recommendations
    if (queryTime > 1000) {
      console.log('\n⚠️  Recommendations:');
      console.log('1. Consider using raw SQL for complex aggregations');
      console.log('2. Implement face clustering for similarity searches');
      console.log('3. Add database-level caching for embeddings');
      console.log('4. Consider partitioning tables for very large datasets');
    } else {
      console.log('\n✅ Query performance looks good!');
    }

  } catch (error) {
    console.error('Error testing optimizations:', error);
  } finally {
    await prisma.$disconnect();
  }
}

// Additional raw SQL optimizations for face similarity
async function createOptimizedSimilarityFunction() {
  console.log('Creating optimized similarity function...');

  try {
    // This would be run directly in MariaDB
    const similarityFunction = `
      DELIMITER $$

      DROP FUNCTION IF EXISTS fast_face_similarity$$

      CREATE FUNCTION fast_face_similarity(
        target_embedding JSON,
        candidate_embedding JSON,
        threshold DECIMAL(3,2)
      )
      RETURNS BOOLEAN
      READS SQL DATA
      DETERMINISTIC
      BEGIN
        DECLARE similarity DECIMAL(10,8) DEFAULT 0;
        DECLARE dot_product DECIMAL(20,10) DEFAULT 0;
        DECLARE magnitude1 DECIMAL(20,10) DEFAULT 0;
        DECLARE magnitude2 DECIMAL(20,10) DEFAULT 0;
        DECLARE i INT DEFAULT 0;
        DECLARE len INT;

        IF target_embedding IS NULL OR candidate_embedding IS NULL THEN
          RETURN FALSE;
        END IF;

        SET len = JSON_LENGTH(target_embedding);

        WHILE i < len DO
          SET dot_product = dot_product + (
            CAST(JSON_EXTRACT(target_embedding, CONCAT('$[', i, ']')) AS DECIMAL(10,8)) *
            CAST(JSON_EXTRACT(candidate_embedding, CONCAT('$[', i, ']')) AS DECIMAL(10,8))
          );
          SET magnitude1 = magnitude1 + POW(CAST(JSON_EXTRACT(target_embedding, CONCAT('$[', i, ']')) AS DECIMAL(10,8)), 2);
          SET magnitude2 = magnitude2 + POW(CAST(JSON_EXTRACT(candidate_embedding, CONCAT('$[', i, ']')) AS DECIMAL(10,8)), 2);
          SET i = i + 1;
        END WHILE;

        SET similarity = dot_product / (SQRT(magnitude1) * SQRT(magnitude2));
        RETURN similarity >= threshold;
      END$$

      DELIMITER ;
    `;

    console.log('Similarity function SQL:');
    console.log(similarityFunction);
    console.log('\nRun this SQL directly in your MariaDB database for optimal performance.');

  } catch (error) {
    console.error('Error creating similarity function:', error);
  }
}

if (require.main === module) {
  optimizeFaceQueries().then(() => {
    console.log('\n' + '='.repeat(50));
    createOptimizedSimilarityFunction();
  });
}

module.exports = { optimizeFaceQueries, createOptimizedSimilarityFunction };
