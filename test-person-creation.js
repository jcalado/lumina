const { PrismaClient } = require('@prisma/client');
const crypto = require('crypto');

async function testPersonCreation() {
  const prisma = new PrismaClient();
  
  try {
    console.log('Testing person creation...');
    
    // Test 1: Check table structure
    const tables = await prisma.$queryRaw`
      SHOW TABLES
    `;
    console.log('Available tables:', tables);
    
    // Test 2: Check people table structure
    const peopleSchema = await prisma.$queryRaw`
      DESCRIBE people
    `;
    console.log('People table schema:', peopleSchema);
    
    // Test 3: Try creating a person with a simpler approach
    const testName = 'Test Person ' + Date.now();
    
    try {
      // MariaDB doesn't support RETURNING, so we need to do a separate query
      const personId = crypto.randomUUID();
      await prisma.$executeRaw`
        INSERT INTO people (id, name, confirmed, createdAt, updatedAt) 
        VALUES (
          ${personId},
          ${testName}, 
          0, 
          NOW(), 
          NOW()
        )
      `;
      
      const person = await prisma.$queryRaw`
        SELECT * FROM people WHERE id = ${personId}
      `;
      console.log('Person created:', person);
    } catch (error) {
      console.log('Insert failed, trying alternative approach...');
      
      // Alternative: Use the working createPerson helper
      const { createPersonFromFaces } = require('./person-creation-helper.js');
      const result = await createPersonFromFaces(testName, ['cmeq4t5bh0003iw08ygykvzhc']);
      console.log('Created with helper:', result);
    }
    
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

testPersonCreation();
