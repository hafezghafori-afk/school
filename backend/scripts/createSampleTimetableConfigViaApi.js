const base = 'http://localhost:5000';

async function run() {
  const loginRes = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@school.com', password: 'admin123' })
  });
  const loginJson = await loginRes.json();
  console.log('loginStatus=', loginRes.status);
  if (!loginJson?.success) {
    console.log('loginResponse=', JSON.stringify(loginJson));
    return;
  }

  const token = loginJson?.token || loginJson?.data?.token;
  if (!token) {
    console.log('loginResponse=', JSON.stringify(loginJson));
    return;
  }

  const headers = { Authorization: `Bearer ${token}` };

  const refRes = await fetch(`${base}/api/timetables/reference-data`, { headers });
  const refJson = await refRes.json();
  console.log('referenceStatus=', refRes.status);
  if (!refJson?.success) {
    console.log('referenceResponse=', JSON.stringify(refJson));
    return;
  }

  const term = (refJson.academicTerms || [])[0];
  const schoolClass = (refJson.classes || [])[0];
  const year = refJson.activeYear || (refJson.academicYears || [])[0];

  if (!term || !schoolClass || !year) {
    console.log('missingRefs=', JSON.stringify({
      hasTerm: Boolean(term),
      hasClass: Boolean(schoolClass),
      hasYear: Boolean(year)
    }));
    return;
  }

  const payload = {
    academicYearId: year.id,
    termId: term.id,
    classId: schoolClass.id,
    name: `Config Auto ${Date.now()}`,
    code: `CFG-${Date.now()}`,
    dayStartTime: '07:30',
    dayEndTime: '12:30',
    slotDurationMinutes: 45,
    daysOfWeek: ['saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday']
  };

  const createRes = await fetch(`${base}/api/timetables/configs`, {
    method: 'POST',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  const createJson = await createRes.json();
  console.log('createConfigStatus=', createRes.status);
  console.log('createdConfig=', JSON.stringify(createJson?.item || createJson));

  const query = new URLSearchParams({
    academicYearId: year.id,
    termId: term.id,
    classId: schoolClass.id
  });

  const listRes = await fetch(`${base}/api/timetables/configs?${query.toString()}`, { headers });
  const listJson = await listRes.json();
  console.log('listStatus=', listRes.status);

  const count = Array.isArray(listJson?.items) ? listJson.items.length : 0;
  console.log('listCount=', count);
  if (count) {
    console.log('latestConfig=', JSON.stringify(listJson.items[0]));
  }
}

run().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
