// Test script for create person API
const testData = {
  name: "Test Person",
  faceIds: ["cmeq4t5bh0003iw08ygykvzhc"]
};

fetch('http://localhost:3000/api/admin/people/create-from-faces', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify(testData)
})
.then(response => response.json())
.then(data => {
  console.log('Success:', data);
})
.catch(error => {
  console.error('Error:', error);
});
