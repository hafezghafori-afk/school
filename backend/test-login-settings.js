const mongoose = require('mongoose');
const LoginSettings = require('./models/LoginSettings');

// Connect to database
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/school-project');

async function testLoginSettings() {
  try {
    console.log('Testing LoginSettings model...');
    
    // Try to find existing settings
    let settings = await LoginSettings.findOne({ isActive: true });
    
    if (!settings) {
      console.log('No settings found, creating default...');
      settings = new LoginSettings();
      await settings.save();
      console.log('Default settings created:', settings);
    } else {
      console.log('Existing settings found:', settings);
    }
    
    console.log('Test completed successfully!');
    process.exit(0);
  } catch (error) {
    console.error('Test failed:', error);
    process.exit(1);
  }
}

testLoginSettings();
