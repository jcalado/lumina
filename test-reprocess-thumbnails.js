const { config } = require('dotenv');
config();

// Test the reprocess thumbnails functionality
async function testReprocessThumbnails() {
  try {
    console.log('Testing reprocess thumbnails API endpoint...');
    
    const response = await fetch('http://localhost:3001/api/admin/thumbnails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ action: 'reprocess' }),
    });

    if (response.ok) {
      const result = await response.json();
      console.log('✅ Reprocess thumbnails request successful:', result);
    } else {
      const error = await response.json();
      console.error('❌ Reprocess thumbnails request failed:', error);
    }
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
testReprocessThumbnails();
