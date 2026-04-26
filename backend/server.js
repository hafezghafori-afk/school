const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
require('dotenv').config();
const { getCorsOptions, getJwtSecret } = require('./utils/env');

const app = express();
const server = http.createServer(app);
const corsOptions = getCorsOptions();

const logger = (req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    console.log(`${req.method} ${req.originalUrl} ${res.statusCode} - ${ms}ms`);
  });
  next();
};

app.use(cors(corsOptions));
app.use(express.json());
app.use(logger);

const rateLimitStore = new Map();
const rateLimit = (key, limit, windowMs) => {
  const now = Date.now();
  const record = rateLimitStore.get(key) || { count: 0, resetAt: now + windowMs };
  if (now > record.resetAt) {
    record.count = 0;
    record.resetAt = now + windowMs;
  }
  record.count += 1;
  rateLimitStore.set(key, record);
  return record.count <= limit;
};

app.use('/api/auth', (req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const ok = rateLimit(ip, 20, 60 * 1000);
  if (!ok) {
    return res.status(429).json({
      success: false,
      message: '\u062a\u0639\u062f\u0627\u062f \u062f\u0631\u062e\u0648\u0627\u0633\u062a \u0632\u06cc\u0627\u062f \u0627\u0633\u062a'
    });
  }
  next();
});

const uploadDir = path.join(__dirname, 'uploads');
const frontendDistDir = path.resolve(__dirname, '../frontend/dist');
const frontendIndexPath = path.join(frontendDistDir, 'index.html');
const hasFrontendBuild = fs.existsSync(frontendIndexPath);
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}
app.use('/uploads', express.static(uploadDir));

mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/school_db')
  .then(async () => {
    console.log('Database connected successfully');
    await repairChatThreadIndexes();
    if (typeof SchoolClass.ensureSchoolClassShiftUniqueIndex === 'function') {
      await SchoolClass.ensureSchoolClassShiftUniqueIndex();
    }
    if (typeof TeacherAssignment.ensureTeacherAssignmentLegacyIndex === 'function') {
      await TeacherAssignment.ensureTeacherAssignmentLegacyIndex();
    }
  })
  .catch((err) => console.error('Database connection error:', err));

const authRoutes = require('./routes/authRoutes');
const courseRoutes = require('./routes/courseRoutes');
const commentRoutes = require('./routes/commentRoutes');
const resultRoutes = require('./routes/resultRoutes');
const adminRoutes = require('./routes/adminRoutes');
const moduleRoutes = require('./routes/moduleRoutes');
const paymentRoutes = require('./routes/paymentRoutes');
const lessonRoutes = require('./routes/lessonRoutes');
const notifyRoutes = require('./routes/notifyRoutes');
const userRoutes = require('./routes/userRoutes');
const quizRoutes = require('./routes/quizRoutes');
const settingsRoutes = require('./routes/settingsRoutes');
const gradeRoutes = require('./routes/gradeRoutes');
const attendanceRoutes = require('./routes/attendanceRoutes');
const homeworkRoutes = require('./routes/homeworkRoutes');
const chatRoutes = require('./routes/chatRoutes');
const scheduleRoutes = require('./routes/scheduleRoutes');
const newsRoutes = require('./routes/newsRoutes');
const galleryRoutes = require('./routes/galleryRoutes');
const contactRoutes = require('./routes/contactRoutes');
const enrollmentRoutes = require('./routes/enrollmentRoutes');
const adminLogRoutes = require('./routes/adminLogRoutes');
const recordingRoutes = require('./routes/recordingRoutes');
const virtualClassRoutes = require('./routes/virtualClassRoutes');
const financeRoutes = require('./routes/financeRoutes');
const educationRoutes = require('./routes/educationRoutes');
const studentProfileRoutes = require('./routes/studentProfileRoutes');
const examRoutes = require('./routes/examRoutes');
const resultTableRoutes = require('./routes/resultTableRoutes');
const promotionRoutes = require('./routes/promotionRoutes');
const studentFinanceRoutes = require('./routes/studentFinanceRoutes');
const timetableRoutes = require('./routes/timetableRoutes');
const reportRoutes = require('./routes/reportRoutes');
const sheetTemplateRoutes = require('./routes/sheetTemplateRoutes');
const loginSettingsRoutes = require('./routes/loginSettingsRoutesSimple');
const afghanSchoolRoutes = require('./routes/afghanSchoolRoutes');
const afghanStudentRoutes = require('./routes/afghanStudentRoutes');
const studentRegistrationRoutes = require('./routes/studentRegistrationRoutes');
const afghanTeacherRoutes = require('./routes/afghanTeacherRoutes');
const academicYearRoutes = require('./routes/academicYearRoutes');
const academicTermRoutes = require('./routes/academicTermRoutes');
const schoolShiftRoutes = require('./routes/schoolShiftRoutes');
const schoolWeekConfigRoutes = require('./routes/schoolWeekConfigRoutes');
const shiftRoutes = require('./routes/shiftRoutes');
const timetableConfigurationRoutes = require('./routes/timetableConfigurationRoutes');
const curriculumRuleRoutes = require('./routes/curriculumRuleRoutes');
const teacherAssignmentRoutes = require('./routes/teacherAssignmentRoutes');
const teacherAvailabilityRoutes = require('./routes/teacherAvailabilityRoutes');
const timetableLegacyRoutes = require('./routes/timetableLegacyRoutes');
const schoolClassLegacyRoutes = require('./routes/schoolClassLegacyRoutes');
const subjectLegacyRoutes = require('./routes/subjectLegacyRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const errorHandler = require('./middleware/errorHandler');
const { getDatabaseStatus, requireDatabase } = require('./middleware/requireDatabase');
const ChatThread = require('./models/ChatThread');
const ChatMessage = require('./models/ChatMessage');
const SchoolClass = require('./models/SchoolClass');
const TeacherAssignment = require('./models/TeacherAssignment');
const { canAccessCourse } = require('./utils/courseAccess');
const { startSlaAutomation } = require('./services/slaAutomation');
const { startFinanceDeliveryCampaignAutomation } = require('./services/financeDeliveryService');
const { startFinanceReminderAutomation } = require('./services/financeReminderAutomation');
const { repairChatThreadIndexes } = require('./utils/repairChatThreadIndexes');

app.get('/api/health', (req, res) => {
  const database = getDatabaseStatus();
  const healthy = database.connected;

  res
    .status(healthy ? 200 : 503)
    .type('application/json; charset=utf-8')
    .json({
      status: healthy ? 'OK' : 'DEGRADED',
      message: healthy ? 'سرور و دیتابیس فعال هستند' : 'سرور فعال است اما دیتابیس در دسترس نیست',
      database
    });
});

app.use('/api', requireDatabase);

app.use('/api/auth', authRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/comments', commentRoutes);
app.use('/api/results', resultRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/modules', moduleRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/lessons', lessonRoutes);
app.use('/api/notify', notifyRoutes);
app.use('/api/users', userRoutes);
app.use('/api/quizzes', quizRoutes);
app.use('/api/login-settings', loginSettingsRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/grades', gradeRoutes);
app.use('/api/attendance', attendanceRoutes);
app.use('/api/homeworks', homeworkRoutes);
app.use('/api/chats', chatRoutes);
app.use('/api/schedules', scheduleRoutes);
app.use('/api/news', newsRoutes);
app.use('/api/gallery', galleryRoutes);
app.use('/api/contact', contactRoutes);
app.use('/api/enrollments', enrollmentRoutes);
app.use('/api/admin-logs', adminLogRoutes);
app.use('/api/recordings', recordingRoutes);
app.use('/api/virtual-classes', virtualClassRoutes);
app.use('/api/finance', financeRoutes);
app.use('/api/education', educationRoutes);
app.use('/api/student-profiles', studentProfileRoutes);
app.use('/api/exams', examRoutes);
app.use('/api/result-tables', resultTableRoutes);
app.use('/api/promotions', promotionRoutes);
app.use('/api/student-finance', studentFinanceRoutes);
app.use('/api/timetables', timetableRoutes);
app.use('/api/reports', reportRoutes);
app.use('/api/sheet-templates', sheetTemplateRoutes);
app.use('/api/afghan-schools', afghanSchoolRoutes);
app.use('/api/afghan-students', afghanStudentRoutes);
app.use('/api/students', studentRegistrationRoutes);
app.use('/api/afghan-teachers', afghanTeacherRoutes);
app.use('/api/academic-years', academicYearRoutes);
app.use('/api/academic-terms', academicTermRoutes);
app.use('/api/school-shifts', schoolShiftRoutes);
app.use('/api/school-week-config', schoolWeekConfigRoutes);
app.use('/api/shifts', shiftRoutes);
app.use('/api/timetable-configuration', timetableConfigurationRoutes);
app.use('/api/curriculum-rules', curriculumRuleRoutes);
app.use('/api/teacher-assignments', teacherAssignmentRoutes);
app.use('/api/teacher-availability', teacherAvailabilityRoutes);
app.use('/api/timetable', timetableLegacyRoutes);
app.use('/api/school-classes', schoolClassLegacyRoutes);
app.use('/api/subjects', subjectLegacyRoutes);
app.use('/api/dashboard', dashboardRoutes);

if (hasFrontendBuild) {
  app.use(express.static(frontendDistDir));

  app.get(/.*/, (req, res, next) => {
    if (req.method !== 'GET') return next();
    if (req.path.startsWith('/api') || req.path.startsWith('/uploads') || req.path.startsWith('/socket.io')) {
      return next();
    }
    if (!req.accepts('html') || path.extname(req.path)) return next();
    return res.sendFile(frontendIndexPath);
  });
}

app.use(errorHandler);

const { Server } = require('socket.io');
const io = new Server(server, {
  cors: corsOptions
});
app.set('io', io);

const JWT_SECRET = getJwtSecret();

const onlineUsers = new Map();
const broadcastPresence = () => {
  io.emit('presence:update', Array.from(onlineUsers.keys()));
};

const getTokenFromHandshake = (handshake) => {
  const authToken = handshake?.auth?.token;
  if (authToken) return authToken;
  const header = handshake?.headers?.authorization || '';
  if (header.startsWith('Bearer ')) return header.slice(7);
  return null;
};

const membershipAccessOptions = Object.freeze({});

const canAccessThread = async (user, thread) => {
  if (thread.type === 'direct') {
    return thread.participants.some(p => String(p) === String(user.id));
  }
  if (thread.type === 'group') {
    return canAccessCourse(user, thread.course, membershipAccessOptions);
  }
  return false;
};

io.use(async (socket, next) => {
  try {
    const token = getTokenFromHandshake(socket.handshake);
    if (!token) return next(new Error('Unauthorized'));
    const payload = jwt.verify(token, JWT_SECRET);
    socket.user = { id: payload.id, role: payload.role, name: payload.name };
    next();
  } catch (err) {
    next(new Error('Unauthorized'));
  }
});

io.on('connection', (socket) => {
  const userId = socket.user?.id;
  if (userId) {
    socket.join(`user:${userId}`);
    const count = onlineUsers.get(userId) || 0;
    onlineUsers.set(userId, count + 1);
    broadcastPresence();
  }

  socket.on('chat:join', async (threadId, cb) => {
    try {
      if (!threadId) return cb?.({ ok: false });
      const thread = await ChatThread.findById(threadId);
      if (!thread) return cb?.({ ok: false });
      const ok = await canAccessThread(socket.user, thread);
      if (!ok) return cb?.({ ok: false });
      const room = `thread:${threadId}`;
      socket.join(room);
      await ChatMessage.updateMany(
        { thread: threadId, seenBy: { $ne: socket.user.id } },
        { $addToSet: { seenBy: socket.user.id } }
      );
      io.to(room).emit('chat:seen', { threadId, userId: socket.user.id });
      cb?.({ ok: true });
    } catch (error) {
      cb?.({ ok: false });
    }
  });

  socket.on('chat:typing', async ({ threadId, typing }) => {
    try {
      if (!threadId) return;
      const thread = await ChatThread.findById(threadId).select('type participants course');
      if (!thread) return;
      const ok = await canAccessThread(socket.user, thread);
      if (!ok) return;
      socket.to(`thread:${threadId}`).emit('chat:typing', {
        threadId,
        userId: socket.user.id,
        typing: !!typing
      });
    } catch (error) {
      // Ignore transient realtime errors and keep the socket session alive.
    }
  });

  socket.on('chat:seen', async ({ threadId }) => {
    try {
      if (!threadId) return;
      const thread = await ChatThread.findById(threadId).select('type participants course');
      if (!thread) return;
      const ok = await canAccessThread(socket.user, thread);
      if (!ok) return;
      await ChatMessage.updateMany(
        { thread: threadId, seenBy: { $ne: socket.user.id } },
        { $addToSet: { seenBy: socket.user.id } }
      );
      io.to(`thread:${threadId}`).emit('chat:seen', { threadId, userId: socket.user.id });
    } catch (error) {
      // Ignore transient realtime errors and keep the socket session alive.
    }
  });

  socket.on('disconnect', () => {
    if (!userId) return;
    const count = onlineUsers.get(userId) || 0;
    if (count <= 1) {
      onlineUsers.delete(userId);
    } else {
      onlineUsers.set(userId, count - 1);
    }
    broadcastPresence();
  });
});

const PORT = process.env.PORT || 5001;
server.listen(PORT, () => {
  const frontendMessage = hasFrontendBuild
    ? `   Frontend App:  http://localhost:${PORT}`
    : '   Frontend App:  frontend/dist not found (run `npm run build` inside frontend)';
  console.log(`
==================================================
   Server is running on: http://localhost:${PORT}
${frontendMessage}
   Health Check: http://localhost:${PORT}/api/health
==================================================
  `);
});

const slaRuntime = startSlaAutomation(app);
if (slaRuntime?.enabled) {
  console.log(`[SLA] automation enabled, interval=${slaRuntime.intervalMinutes}m`);
}

const financeReminderRuntime = startFinanceReminderAutomation(app);
if (financeReminderRuntime?.enabled) {
  console.log(`[FinanceReminder] automation enabled, interval=${financeReminderRuntime.intervalMinutes}m`);
}

const financeDeliveryRuntime = startFinanceDeliveryCampaignAutomation(app);
if (financeDeliveryRuntime?.enabled) {
  console.log(`[FinanceDelivery] automation enabled, interval=${financeDeliveryRuntime.intervalMinutes}m`);
}
