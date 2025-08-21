async function testAPI() {
  try {
    const response = await fetch('http://localhost:3000/api/albums/IMPACTO');
    const data = await response.json();
    
    console.log('Album data:', JSON.stringify(data.album, null, 2));
    console.log('Sub-albums data:', JSON.stringify(data.subAlbums, null, 2));
  } catch (error) {
    console.error('Error:', error);
  }
}

testAPI();
