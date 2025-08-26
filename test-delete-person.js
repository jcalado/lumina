// Test script for person deletion API
const fs = require('fs');

async function testDeletePerson() {
  try {
    // First, get all people to see what we have
    console.log('1. Fetching all people...');
    const peopleResponse = await fetch('http://localhost:3000/api/admin/people');
    const people = await peopleResponse.json();
    
    console.log('Current people:', people.map(p => ({
      id: p.id,
      name: p.name,
      faceCount: p.faceCount
    })));

    if (people.length === 0) {
      console.log('No people found to delete');
      return;
    }

    // Pick the first person to delete
    const personToDelete = people[0];
    console.log(`\n2. Deleting person: ${personToDelete.name} (ID: ${personToDelete.id})`);

    const deleteResponse = await fetch(`http://localhost:3000/api/admin/people/${personToDelete.id}`, {
      method: 'DELETE',
    });

    if (deleteResponse.ok) {
      const result = await deleteResponse.json();
      console.log('Delete successful:', result);
    } else {
      const error = await deleteResponse.json();
      console.log('Delete failed:', error);
    }

    // Check people again
    console.log('\n3. Fetching people after deletion...');
    const updatedPeopleResponse = await fetch('http://localhost:3000/api/admin/people');
    const updatedPeople = await updatedPeopleResponse.json();
    
    console.log('Updated people:', updatedPeople.map(p => ({
      id: p.id,
      name: p.name,
      faceCount: p.faceCount
    })));

    // Check unassigned faces
    console.log('\n4. Checking unassigned faces...');
    const unassignedResponse = await fetch('http://localhost:3000/api/admin/people/unassigned');
    const unassignedFaces = await unassignedResponse.json();
    
    console.log(`Unassigned faces count: ${unassignedFaces.length}`);

  } catch (error) {
    console.error('Test failed:', error);
  }
}

// Run the test
testDeletePerson();
