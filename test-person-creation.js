const { PrismaClient } = require('@prisma/client');

async function testPersonCreation() {
  const prisma = new PrismaClient();
  
  try {
    console.log('Testing person creation...');
    
    // Test 1: Check table structure
    const tables = await prisma.$queryRaw`
      SELECT name FROM sqlite_master WHERE type='table' ORDER BY name
    `;
    console.log('Available tables:', tables);
    
    // Test 2: Check people table structure
    const peopleSchema = await prisma.$queryRaw`
      PRAGMA table_info(people)
    `;
    console.log('People table schema:', peopleSchema);
    
    // Test 3: Try creating a person with a simpler approach
    const testName = 'Test Person ' + Date.now();
    
    try {
      const person = await prisma.$queryRaw`
        INSERT INTO people (id, name, confirmed, createdAt, updatedAt) 
        VALUES (
          'test-' || cast(random() as text),
          ${testName}, 
          0, 
          datetime('now'), 
          datetime('now')
        ) RETURNING *
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
