const mongoose = require('mongoose');
const User = require('./models/User');

async function listUsers() {
  try {
    await mongoose.connect('mongodb://127.0.0.1:27017/school_db');
    console.log('=== لیست کاربران سیستم ===');
    
    const users = await User.find({}).select('name email role status lastLoginAt createdAt');
    
    if (users.length === 0) {
      console.log('❌ هیچ کاربری در سیستم وجود ندارد');
    } else {
      console.log('✅ تعداد کل کاربران:', users.length);
      console.log('');
      
      users.forEach((user, index) => {
        console.log(`${index + 1}. ${user.name}`);
        console.log(`   📧 ایمیل: ${user.email}`);
        console.log(`   👤 نقش: ${user.role}`);
        console.log(`   ✅ وضعیت: ${user.status}`);
        console.log(`   📅 آخرین ورود: ${user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString('fa-AF-u-ca-persian') : 'هرگز وارد نشده'}`);
        console.log(`   📆 تاریخ ایجاد: ${new Date(user.createdAt).toLocaleString('fa-AF-u-ca-persian')}`);
        console.log('');
      });
    }
    
    process.exit(0);
  } catch (error) {
    console.error('❌ خطا در اتصال به دیتابیس:', error);
    process.exit(1);
  }
}

listUsers();
