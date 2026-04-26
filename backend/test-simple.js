const LoginSettings = require('./models/LoginSettings');

async function testSimple() {
  try {
    console.log('Testing simple save...');
    
    const settings = new LoginSettings({
      title: 'Test Title',
      subtitle: 'Test Subtitle'
    });
    
    console.log('Settings object:', settings);
    console.log('Settings _id:', settings._id);
    
    const result = await settings.save();
    console.log('Save result:', result);
    
    process.exit(0);
  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
}

testSimple();
