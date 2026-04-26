require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');

const {
  getSessionMarks,
  upsertExamMark
} = require('../services/examEngineService');

function parseArgs(argv = []) {
  const options = {
    apply: false,
    actorUserId: '',
    file: '',
    outputFile: '',
    sessionId: ''
  };

  for (const raw of argv) {
    const arg = String(raw || '').trim();
    if (!arg) continue;

    if (arg === '--apply') {
      options.apply = true;
      continue;
    }

    if (!arg.startsWith('--')) continue;
    const eqIndex = arg.indexOf('=');
    const key = eqIndex >= 0 ? arg.slice(2, eqIndex) : arg.slice(2);
    const value = eqIndex >= 0 ? arg.slice(eqIndex + 1) : 'true';

    if (key === 'session') options.sessionId = value;
    else if (key === 'file') options.file = value;
    else if (key === 'out') options.outputFile = value;
    else if (key === 'actor') options.actorUserId = value;
  }

  return options;
}

function normalizeText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function buildMarkTemplate(markItem) {
  const mark = markItem?.mark || {};
  const result = markItem?.result || {};
  const membership = mark.studentMembership || {};
  const student = mark.student || {};

  return {
    studentMembershipId: normalizeText(membership.id),
    studentId: normalizeText(membership.studentId),
    studentUserId: normalizeText(student.id || membership.studentUserId),
    studentName: normalizeText(student.name),
    studentEmail: normalizeText(student.email),
    currentMarkStatus: normalizeText(mark.markStatus),
    currentObtainedMark: Number(mark.obtainedMark || 0),
    totalMark: Number(mark.totalMark || 0),
    currentResultStatus: normalizeText(result.resultStatus),
    note: ''
  };
}

function summarizeMarks(items = []) {
  const summary = {
    total: items.length,
    recorded: 0,
    pending: 0,
    absent: 0,
    excused: 0
  };

  items.forEach((item) => {
    const status = normalizeText(item?.mark?.markStatus);
    if (status === 'recorded') summary.recorded += 1;
    else if (status === 'pending') summary.pending += 1;
    else if (status === 'absent') summary.absent += 1;
    else if (status === 'excused') summary.excused += 1;
  });

  return summary;
}

function resolveInputFile(filePath) {
  const normalized = normalizeText(filePath);
  if (!normalized) return '';
  return path.isAbsolute(normalized) ? normalized : path.resolve(process.cwd(), normalized);
}

function writeJsonOutput(filePath, payload) {
  const resolved = resolveInputFile(filePath);
  if (!resolved) return '';
  fs.mkdirSync(path.dirname(resolved), { recursive: true });
  fs.writeFileSync(resolved, JSON.stringify(payload, null, 2));
  return resolved;
}

function readEntries(filePath) {
  const resolved = resolveInputFile(filePath);
  if (!resolved) {
    throw new Error('exam_mark_file_required');
  }
  const raw = fs.readFileSync(resolved, 'utf8');
  const parsed = JSON.parse(raw);
  const entries = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.entries) ? parsed.entries : [];
  if (!entries.length) {
    throw new Error('exam_mark_file_empty');
  }
  return { resolved, entries };
}

async function run() {
  const options = parseArgs(process.argv.slice(2));
  if (!normalizeText(options.sessionId)) {
    throw new Error('exam_mark_session_required');
  }

  const mongoUri = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/school_db';
  await mongoose.connect(mongoUri);

  const before = await getSessionMarks(options.sessionId);
  const response = {
    mode: options.apply ? 'apply' : 'preview',
    session: before.session,
    summary: summarizeMarks(before.items),
    entries: before.items.map(buildMarkTemplate)
  };

  if (!options.apply) {
    const outputFile = writeJsonOutput(options.outputFile, response);
    if (outputFile) response.outputFile = outputFile;
    console.log(JSON.stringify(response, null, 2));
    return;
  }

  const input = readEntries(options.file);
  const updates = [];
  for (const entry of input.entries) {
    const studentMembershipId = normalizeText(entry?.studentMembershipId);
    if (!studentMembershipId) {
      throw new Error('exam_mark_entry_missing_membership');
    }

    const payload = {
      sessionId: options.sessionId,
      studentMembershipId,
      markStatus: normalizeText(entry.markStatus || entry.currentMarkStatus || 'recorded'),
      obtainedMark: entry.obtainedMark,
      totalMark: entry.totalMark,
      note: normalizeText(entry.note)
    };
    updates.push(await upsertExamMark(payload, normalizeText(options.actorUserId) || null));
  }

  const after = await getSessionMarks(options.sessionId);
  const finalPayload = {
    ...response,
    inputFile: input.resolved,
    appliedCount: updates.length,
    applied: updates,
    after: {
      session: after.session,
      summary: summarizeMarks(after.items),
      entries: after.items.map(buildMarkTemplate)
    }
  };
  const outputFile = writeJsonOutput(options.outputFile, finalPayload);
  if (outputFile) finalPayload.outputFile = outputFile;
  console.log(JSON.stringify(finalPayload, null, 2));
}

run()
  .catch((error) => {
    console.error(error && error.stack ? error.stack : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
