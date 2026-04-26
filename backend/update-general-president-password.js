const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('./models/User');

async function updateGeneralPresidentPassword() {
  try {
    await mongoose.connect('mongodb://127.0.0.1:27017/school_db');
    console.log('Connected to database');

    // Find the general_president user
    const user = await User.findOne({ orgRole: 'general_president' });

    if (!user) {
      console.log('❌ هیچ کاربری با نقش general_president یافت نشد');
      return;
    }

    console.log('✅ کاربر یافت شد:');
    console.log(`   نام: ${user.name}`);
    console.log(`   📧 ایمیل: ${user.email}`);
    console.log(`   👤 نقش: ${user.role}`);
    console.log(`   🏢 نقش سازمانی: ${user.orgRole}`);
    console.log(`   ✅ وضعیت: ${user.status}`);
    console.log('');

    // Prompt for new password (in a real script, you might use process.argv or readline)
    const newPassword = 'newSecurePassword123'; // اینجا رمز جدید را وارد کنید
    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await User.updateOne({ _id: user._id }, { password: hashedPassword });

    console.log('✅ رمز عبور general_president به‌روزرسانی شد');
    console.log(`   🔑 رمز جدید: ${newPassword} (در واقعیت، این را نشان ندهید)`);

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from database');
  }
}

updateGeneralPresidentPassword();