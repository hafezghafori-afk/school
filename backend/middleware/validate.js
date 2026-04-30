function getNestedValue(source, path) {
  return String(path || '')
    .split('.')
    .reduce((current, key) => (
      current && Object.prototype.hasOwnProperty.call(current, key) ? current[key] : undefined
    ), source);
}

const FIELD_LABELS = {
  'personalInfo.firstName': 'نام',
  'personalInfo.lastName': 'تخلص',
  'personalInfo.firstNameDari': 'نام دری',
  'personalInfo.lastNameDari': 'تخلص دری',
  'personalInfo.fatherName': 'نام پدر',
  'personalInfo.gender': 'جنسیت',
  'personalInfo.birthDate': 'تاریخ تولد',
  'personalInfo.birthPlace': 'محل تولد',
  'identification.tazkiraNumber': 'شماره تذکره',
  'familyInfo.motherName': 'نام مادر',
  'contactInfo.province': 'ولایت',
  'contactInfo.district': 'ولسوالی/ناحیه',
  'contactInfo.address': 'آدرس',
  'academicInfo.currentSchool': 'مکتب',
  'academicInfo.currentGrade': 'صنف',
  'academicInfo.enrollmentDate': 'تاریخ ثبت‌نام',
  students: 'لیست شاگردان',
  presentDays: 'روزهای حاضر',
  totalDays: 'مجموع روزها'
};

function requireFields(fields) {
  return (req, res, next) => {
    for (const field of fields) {
      const value = getNestedValue(req.body, field);
      if (value === undefined || value === null || value === '') {
        return res.status(400).json({ message: `فیلد ${FIELD_LABELS[field] || field} الزامی است` });
      }
    }
    next();
  };
}

module.exports = {
  requireFields
};
