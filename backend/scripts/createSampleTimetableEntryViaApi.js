const base = 'http://localhost:5000';

async function apiGet(path, headers = {}) {
  const res = await fetch(`${base}${path}`, { headers });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function apiPost(path, body, headers = {}) {
  const res = await fetch(`${base}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...headers
    },
    body: JSON.stringify(body || {})
  });
  const json = await res.json().catch(() => ({}));
  return { status: res.status, json };
}

async function run() {
  const login = await apiPost('/api/auth/login', {
    email: 'admin@school.com',
    password: 'admin123'
  });
  console.log('loginStatus=', login.status);
  if (!login.json?.success) {
    console.log('loginResponse=', JSON.stringify(login.json));
    return;
  }

  const token = login.json?.token || login.json?.data?.token;
  if (!token) {
    console.log('missingToken=', JSON.stringify(login.json));
    return;
  }

  const headers = { Authorization: `Bearer ${token}` };

  const reference = await apiGet('/api/timetables/reference-data', headers);
  console.log('referenceStatus=', reference.status);
  if (!reference.json?.success) {
    console.log('referenceResponse=', JSON.stringify(reference.json));
    return;
  }

  const year = reference.json.activeYear || (reference.json.academicYears || [])[0];
  const term = (reference.json.academicTerms || [])[0];
  const assignment = (reference.json.teacherAssignments || [])[0];

  if (!year || !term || !assignment) {
    console.log('missingRefs=', JSON.stringify({
      hasYear: Boolean(year),
      hasTerm: Boolean(term),
      hasAssignment: Boolean(assignment)
    }));
    return;
  }

  const classId = assignment?.schoolClass?.id;
  const subjectId = assignment?.subject?.id;
  const teacherAssignmentId = assignment?.id;

  if (!classId || !subjectId || !teacherAssignmentId) {
    console.log('assignmentIncomplete=', JSON.stringify(assignment));
    return;
  }

  const configList = await apiGet(
    `/api/timetables/configs?academicYearId=${encodeURIComponent(year.id)}&termId=${encodeURIComponent(term.id)}&classId=${encodeURIComponent(classId)}`,
    headers
  );
  console.log('configListStatus=', configList.status);
  const config = (configList.json?.items || [])[0] || null;

  const entryPayload = {
    academicYearId: year.id,
    termId: term.id,
    classId,
    subjectId,
    teacherAssignmentId,
    configId: config?.id || '',
    dayOfWeek: (config?.daysOfWeek || ['saturday'])[0],
    occurrenceDate: '2026-04-08',
    startTime: '11:00',
    endTime: '11:45',
    room: 'B-12',
    status: 'active'
  };

  const previewBefore = await apiGet(
    `/api/timetables/entries/conflict-preview?${new URLSearchParams({
      teacherAssignmentId: entryPayload.teacherAssignmentId,
      classId: entryPayload.classId,
      dayOfWeek: entryPayload.dayOfWeek,
      occurrenceDate: entryPayload.occurrenceDate,
      startTime: entryPayload.startTime,
      endTime: entryPayload.endTime,
      configId: entryPayload.configId
    }).toString()}`,
    headers
  );
  console.log('previewBeforeStatus=', previewBefore.status);
  console.log('previewBefore=', JSON.stringify(previewBefore.json?.result || previewBefore.json));

  if (previewBefore.json?.result?.hasConflict && Array.isArray(previewBefore.json?.result?.suggestions) && previewBefore.json.result.suggestions.length) {
    const alt = previewBefore.json.result.suggestions[0];
    entryPayload.dayOfWeek = alt.dayOfWeek || entryPayload.dayOfWeek;
    entryPayload.occurrenceDate = alt.occurrenceDate || entryPayload.occurrenceDate;
    entryPayload.startTime = alt.startTime || entryPayload.startTime;
    entryPayload.endTime = alt.endTime || entryPayload.endTime;
    console.log('usingSuggestion=', JSON.stringify(alt));
  }

  const createEntry = await apiPost('/api/timetables/entries', entryPayload, headers);
  console.log('createEntryStatus=', createEntry.status);
  console.log('createdEntry=', JSON.stringify(createEntry.json?.item || createEntry.json));

  if (!createEntry.json?.success) {
    return;
  }

  const previewAfter = await apiGet(
    `/api/timetables/entries/conflict-preview?${new URLSearchParams({
      teacherAssignmentId: entryPayload.teacherAssignmentId,
      classId: entryPayload.classId,
      dayOfWeek: entryPayload.dayOfWeek,
      occurrenceDate: entryPayload.occurrenceDate,
      startTime: entryPayload.startTime,
      endTime: entryPayload.endTime,
      configId: entryPayload.configId
    }).toString()}`,
    headers
  );
  console.log('previewAfterStatus=', previewAfter.status);
  console.log('previewAfter=', JSON.stringify(previewAfter.json?.result || previewAfter.json));
}

run().catch((error) => {
  console.error(error && error.stack ? error.stack : error);
  process.exitCode = 1;
});
