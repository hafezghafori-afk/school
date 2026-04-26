const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');

async function createTeacher() {
  try {
    await mongoose.connect('mongodb://127.0.0.1:27017/school_db');
    console.log('Connected to database');
    
    // Create teacher user
    const hashedPassword = await bcrypt.hash('teacher123', 10);
    
    const teacher = new User({
      name: 'معلم ریاضیات',
      email: 'teacher@school.com',
      password: hashedPassword,
      role: 'teacher',
      status: 'active',
      permissions: [
        'view_classes',
        'manage_attendance',
        'manage_homework',
        'manage_grades',
        'view_schedule'
      ]
    });
    
    await teacher.save();
    console.log('✅ معلم ایجاد شد:');
    console.log('   نام: معلم ریاضیات');
    console.log('   📧 ایمیل: teacher@school.com');
    console.log('   🔑 رمز عبور: teacher123');
    console.log('   👤 نقش: teacher');
    console.log('   ✅ وضعیت: فعال');
    console.log('   📚 اجازه‌نامه: مدیریت حضور، کارخانگی، نمرات');
    
    process.exit(0);
  } catch (error) {
    console.error('❌ خطا در ایجاد معلم:', error);
    process.exit(1);
  }
}

createTeacher();
