const mongoose = require('mongoose');
require('dotenv').config();
const User = require('../models/User');

const TARGETS = [
  {
    email: 'hafezghafori@gmail.com',
    role: 'admin',
    orgRole: 'general_president',
    adminLevel: 'general_president',
    status: 'active'
  },
  { email: 'maryaasrari1@gmail.com', role: 'instructor', orgRole: 'instructor', adminLevel: '', status: 'active' },
  { email: 'pardis@gmail.com', role: 'student', orgRole: 'student', adminLevel: '', status: 'active' }
];

async function run() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/school_db');
  for (const t of TARGETS) {
    await User.findOneAndUpdate(
      { email: t.email },
      {
        role: t.role,
        orgRole: t.orgRole,
        adminLevel: t.adminLevel,
        status: t.status
      },
      { new: true }
    );
    console.log('role set: ' + t.email + ' -> ' + t.orgRole);
  }
  await mongoose.disconnect();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
