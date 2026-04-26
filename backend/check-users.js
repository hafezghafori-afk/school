const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');

async function checkUsers() {
  try {
    await mongoose.connect('mongodb://127.0.0.1:27017/school_db');
    console.log('Connected to database');
    
    // Check existing users
    const users = await User.find({});
    console.log('Total users:', users.length);
    
    if (users.length === 0) {
      console.log('No users found. Creating default admin user...');
      
      const hashedPassword = await bcrypt.hash('admin123', 10);
      
      const admin = new User({
        name: 'Admin User',
        email: 'admin@school.com',
        password: hashedPassword,
        role: 'admin',
        status: 'active'
      });
      
      await admin.save();
      console.log('✅ Default admin created:');
      console.log('   Email: admin@school.com');
      console.log('   Password: admin123');
      console.log('   Role: admin');
    } else {
      console.log('Existing users:');
      users.forEach(user => {
        console.log(`- ${user.name} (${user.email}) - Role: ${user.role} - Status: ${user.status}`);
      });
    }
    
    process.exit(0);
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  }
}

checkUsers();
