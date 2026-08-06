require('dotenv').config();
const mongoose = require('mongoose');
const AfghanStudent = require('../models/AfghanStudent');

async function main() {
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 8000 });

  const totalStudents = await AfghanStudent.countDocuments({});

  const duplicates = await AfghanStudent.aggregate([
    {
      $group: {
        _id: '$identification.tazkiraNumber',
        count: { $sum: 1 },
        students: {
          $push: {
            id: '$_id',
            name: { $concat: [{ $ifNull: ['$personalInfo.firstNameDari', ''] }, ' ', { $ifNull: ['$personalInfo.lastNameDari', ''] }] },
            status: '$status',
            asasNumber: '$asasNumber',
            createdAt: '$createdAt'
          }
        }
      }
    },
    { $match: { count: { $gt: 1 } } },
    { $sort: { count: -1 } }
  ]);

  const emptyOrMissing = await AfghanStudent.countDocuments({
    $or: [
      { 'identification.tazkiraNumber': { $exists: false } },
      { 'identification.tazkiraNumber': null },
      { 'identification.tazkiraNumber': '' }
    ]
  });

  console.log('==== نتیجه بررسی شماره‌های تذکره ====');
  console.log('تعداد کل شاگردان:', totalStudents);
  console.log('تعداد گروه‌های تذکرهٔ تکراری (شامل خالی):', duplicates.length);
  console.log('تعداد شاگردانی که شماره تذکره خالی/ثبت‌نشده دارند:', emptyOrMissing);
  console.log('');

  if (duplicates.length === 0) {
    console.log('هیچ شماره تذکرهٔ تکراری پیدا نشد.');
  } else {
    duplicates.forEach((group, index) => {
      const label = group._id === '' || group._id === null || group._id === undefined
        ? '(خالی / ثبت‌نشده)'
        : group._id;
      console.log(`--- گروه ${index + 1} | شماره تذکره: ${label} | تعداد: ${group.count} ---`);
      group.students.forEach((s) => {
        console.log(`   id=${s.id}  نام="${s.name.trim()}"  وضعیت=${s.status}  اساس=${s.asasNumber || '-'}  ایجاد=${s.createdAt ? new Date(s.createdAt).toISOString().slice(0,10) : '-'}`);
      });
      console.log('');
    });
  }

  await mongoose.connection.close();
}

main().catch((err) => {
  console.error('خطا در اجرای بررسی:', err);
  process.exit(1);
});
