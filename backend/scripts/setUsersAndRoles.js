const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
require('dotenv').config();
const User = require('../models/User');

const USERS = [
  {
    name: 'hafez',
    email: 'hafezghafori@gmail.com',
    role: 'admin',
    orgRole: 'general_president',
    adminLevel: 'general_president',
    status: 'active'
  },
  { name: 'marya', email: 'maryaasrari1@gmail.com', role: 'instructor', orgRole: 'instructor', adminLevel: '', status: 'active' },
  { name: 'pardis', email: 'pardis@gmail.com', role: 'student', orgRole: 'student', adminLevel: '', status: 'active' }
];

async function run() {
  const password = String(process.env.SEED_PASSWORD || '').trim();
  if (password.length < 8) {
    throw new Error('SEED_PASSWORD is required and must be at least 8 characters');
  }

  await mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/school_db');
  const hashed = await bcrypt.hash(password, 10);
  for (const u of USERS) {
    await User.findOneAndUpdate(
      { email: u.email },
      {
        name: u.name,
        role: u.role,
        orgRole: u.orgRole,
        adminLevel: u.adminLevel,
        status: u.status,
        password: hashed
      },
      { upsert: true, new: true }
    );
    console.log('user set: ' + u.email + ' -> ' + u.orgRole);
  }
  await mongoose.disconnect();
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
