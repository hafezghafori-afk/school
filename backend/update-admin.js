const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');

async function createAdmin() {
  try {
    await mongoose.connect('mongodb://127.0.0.1:27017/school_db');
    console.log('Connected to database');
    
    // Get current admin user
    const currentAdmin = await User.findOne({ role: 'admin' });
    
    if (currentAdmin) {
      console.log('✅ ادمین فعلی:');
      console.log(`   نام: ${currentAdmin.name}`);
      console.log(`   📧 ایمیل: ${currentAdmin.email}`);
      console.log(`   👤 نقش: ${currentAdmin.role}`);
      console.log(`   ✅ وضعیت: ${currentAdmin.status}`);
      console.log('');
      console.log('🔄 به‌روزرسانی اطلاعات ادمین...');
      
      // Update with your information
      const updates = {
        name: 'محمد احمدی', // اینجا نام خود را وارد کنید
        email: 'mohammad.ahmadi@example.com', // اینجا ایمیل خود را وارد کنید
        role: 'admin',
        status: 'active'
      };
      
      // Only update password if you want to change it
      const newPassword = await bcrypt.hash('yourPassword123', 10);
      updates.password = newPassword;
      
      await User.updateOne({ _id: currentAdmin._id }, updates);
      
      console.log('✅ ادمین به‌روزرسانی شد:');
      console.log(`   نام: ${updates.name}`);
      console.log(`   📧 ایمیل: ${updates.email}`);
      console.log(`   👤 نقش: ${updates.role}`);
      console.log(`   ✅ وضعیت: ${updates.status}`);
      
      if (updates.password) {
        console.log(`   🔑 رمز عبور: رمز جدید شما`);
      } else {
        console.log(`   🔑 رمز عبور: بدون تغییر (رمز قبلی)`);
      }
      
    } else {
      console.log('❌ هیچ ادمینی یافت نشد');
      console.log('🔄 ایجاد ادمین جدید با اطلاعات شما...');
      
      const hashedPassword = await bcrypt.hash('رمز شما', 10); // اینجا رمز خود را وارد کنید
      
      const admin = new User({
        name: 'نام شما', // اینجا نام خود را وارد کنید
        email: 'ایمیل شما@example.com', // اینجا ایمیل خود را وارد کنید
        password: hashedPassword,
        role: 'admin',
        status: 'active',
        permissions: [
          'manage_users',
          'manage_content',
          'manage_finance',
          'view_reports',
          'manage_schedule',
          'manage_settings'
        ]
      });
      
      await admin.save();
      
      console.log('✅ ادمین جدید ایجاد شد:');
      console.log(`   نام: ${admin.name}`);
      console.log(`   📧 ایمیل: ${admin.email}`);
      console.log(`   👤 نقش: ${admin.role}`);
      console.log(`   ✅ وضعیت: ${admin.status}`);
      console.log(`   🔑 رمز عبور: رمز شما`);
    }
    
    console.log('');
    console.log('📝 نکتهای مهم:');
    console.log('1. فایل را باز کرده و اطلاعات خود را جایگزین کنید');
    console.log('2. رمز عبور خود را در خط hashedPassword تغییر دهید');
    console.log('3. پس از تغییرات، فایل را دوباره اجرا کنید');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ خطا:', error);
    process.exit(1);
  }
}

createAdmin();
