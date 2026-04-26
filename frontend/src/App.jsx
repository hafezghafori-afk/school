import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, NavLink, Navigate, useLocation, useNavigate } from 'react-router-dom';

import './App.css';
import './pages/TimetableSharedRedesign.css';
import Footer from './components/Footer';
import AccessDenied from './components/AccessDenied';
import { ToastProvider } from './components/ui/toast';
import useSiteSettings from './hooks/useSiteSettings';
import { API_BASE, API_ORIGIN } from './config/api';
import { formatAfghanDate, formatAfghanDateTime, formatAfghanTime } from './utils/afghanDate';

const Register = lazy(() => import('./pages/Register'));
const Login = lazy(() => import('./pages/LoginNew'));
const AfghanSchoolDashboard = lazy(() => import('./pages/AfghanSchoolDashboard'));
const AfghanSchoolMap = lazy(() => import('./pages/AfghanSchoolMap'));
const AfghanSchoolManagement = lazy(() => import('./pages/AfghanSchoolManagement'));
const AfghanReports = lazy(() => import('./pages/AfghanReports'));
const CourseList = lazy(() => import('./pages/CourseList'));
const AddCourse = lazy(() => import('./pages/AddCourse'));
const Home = lazy(() => import('./pages/Home'));
const Payment = lazy(() => import('./pages/Payment'));
const SubmitReceipt = lazy(() => import('./pages/SubmitReceipt'));
const AdminPanel = lazy(() => import('./pages/AdminPanel'));
const Quiz = lazy(() => import('./pages/Quiz'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const AdminReports = lazy(() => import('./pages/AdminReports'));
const CourseDetails = lazy(() => import('./pages/CourseDetails'));
const InstructorPanel = lazy(() => import('./pages/InstructorPanel'));
const InstructorPanelInline = lazy(() => import('./pages/InstructorPanelInline'));
const AdminNotifications = lazy(() => import('./pages/AdminNotifications'));
const Profile = lazy(() => import('./pages/Profile'));
const QuizBuilder = lazy(() => import('./pages/QuizBuilder'));
const GradeDetails = lazy(() => import('./pages/GradeDetails'));
const InstructorDashboard = lazy(() => import('./pages/InstructorDashboard'));
const AdminUsers = lazy(() => import('./pages/AdminUsers'));
const StudentReport = lazy(() => import('./pages/StudentReport'));
const InstructorAddStudent = lazy(() => import('./pages/InstructorAddStudent'));
const AdminInstructorReport = lazy(() => import('./pages/AdminInstructorReport'));
const AdminSettings = lazy(() => import('./pages/AdminSettings'));
const MenuContent = lazy(() => import('./pages/MenuContent'));
const MyGrades = lazy(() => import('./pages/MyGrades'));
const GradeManager = lazy(() => import('./pages/GradeManager'));
const AttendanceManager = lazy(() => import('./pages/AttendanceManager'));
const MyAttendance = lazy(() => import('./pages/MyAttendance'));
const HomeworkManager = lazy(() => import('./pages/HomeworkManager'));
const MyHomework = lazy(() => import('./pages/MyHomework'));
const ChatPage = lazy(() => import('./pages/ChatPage'));
const SchedulePage = lazy(() => import('./pages/SchedulePage'));
const News = lazy(() => import('./pages/News'));
const NewsDetail = lazy(() => import('./pages/NewsDetail'));
const NewsArchive = lazy(() => import('./pages/NewsArchive'));
const NewsCategory = lazy(() => import('./pages/NewsCategory'));
const Gallery = lazy(() => import('./pages/Gallery'));
const FAQ = lazy(() => import('./pages/FAQ'));
const Terms = lazy(() => import('./pages/Terms'));
const About = lazy(() => import('./pages/About'));
const Contact = lazy(() => import('./pages/Contact'));
const AdminNews = lazy(() => import('./pages/AdminNews'));
const AdminGallery = lazy(() => import('./pages/AdminGallery'));
const AdminContact = lazy(() => import('./pages/AdminContact'));
const AdminEnrollments = lazy(() => import('./pages/AdminEnrollments'));
const AdminEnrollmentDetail = lazy(() => import('./pages/AdminEnrollmentDetail'));
const AdminEnrollmentPrint = lazy(() => import('./pages/AdminEnrollmentPrint'));
const AdminLogs = lazy(() => import('./pages/AdminLogs'));
const RecordingsPage = lazy(() => import('./pages/RecordingsPage'));
const AdminFinance = lazy(() => import('./pages/AdminFinance'));
const AdminFinanceProfile = lazy(() => import('./pages/AdminFinanceProfile'));
const AdminFinancialMemberships = lazy(() => import('./pages/AdminFinancialMemberships'));
const AdminGovernmentFinance = lazy(() => import('./pages/AdminGovernmentFinance'));
const AdminEducationCore = lazy(() => import('./pages/AdminEducationCore'));
const StudentFinance = lazy(() => import('./pages/StudentFinance'));
const TimetableHub = lazy(() => import('./pages/TimetableHub'));
const TimetableConfiguration = lazy(() => import('./pages/TimetableConfiguration'));
const ShiftManagement = lazy(() => import('./pages/ShiftManagement'));
const TeacherAssignmentManagement = lazy(() => import('./pages/TeacherAssignmentManagement'));
const TeacherAvailabilityManagement = lazy(() => import('./pages/TeacherAvailabilityManagement'));
const CurriculumManagement = lazy(() => import('./pages/CurriculumManagement'));
const TimableViewer = lazy(() => import('./pages/TimableViewer'));
const TimetableEditor = lazy(() => import('./pages/TimetableEditor'));
const TimetableOperations = lazy(() => import('./pages/TimetableOperations'));
const TeacherTimetableView = lazy(() => import('./pages/TeacherTimetableView'));
const StudentTimetableView = lazy(() => import('./pages/StudentTimetableView'));
const TimetableReports = lazy(() => import('./pages/TimetableReports'));
const TimetableConflictManager = lazy(() => import('./pages/TimetableConflictManager'));
const TimetableChangeLog = lazy(() => import('./pages/TimetableChangeLog'));
const AdminPromotions = lazy(() => import('./pages/AdminPromotions'));
const AdminResultTables = lazy(() => import('./pages/AdminResultTables'));
const AdminSheetTemplates = lazy(() => import('./pages/AdminSheetTemplates'));
const AdminExamsDashboard = lazy(() => import('./pages/AdminExamsDashboard'));
const ParentDashboard = lazy(() => import('./pages/ParentDashboard'));
const StudentRegistration = lazy(() => import('./pages/StudentRegistration'));
const OnlineRegistrations = lazy(() => import('./pages/OnlineRegistrations'));
const StudentManagement = lazy(() => import('./pages/StudentManagement'));

const routePrefetchers = {
  courses: () => import('./pages/CourseList'),
  chat: () => import('./pages/ChatPage'),
  studentDashboard: () => import('./pages/Dashboard'),
  instructorDashboard: () => import('./pages/InstructorDashboard'),
  adminDashboard: () => import('./pages/AdminPanel'),
  profile: () => import('./pages/Profile'),
  news: () => import('./pages/News'),
  newsDetail: () => import('./pages/NewsDetail'),
  newsArchive: () => import('./pages/NewsArchive'),
  gallery: () => import('./pages/Gallery'),
  recordings: () => import('./pages/RecordingsPage'),
  schedule: () => import('./pages/SchedulePage'),
  myGrades: () => import('./pages/MyGrades'),
  myAttendance: () => import('./pages/MyAttendance'),
  myHomework: () => import('./pages/MyHomework'),
  homeworkManager: () => import('./pages/HomeworkManager'),
  attendanceManager: () => import('./pages/AttendanceManager'),
  gradeManager: () => import('./pages/GradeManager'),
  quizBuilder: () => import('./pages/QuizBuilder'),
  register: () => import('./pages/Register'),
  login: () => import('./pages/Login'),
  faq: () => import('./pages/FAQ'),
  contact: () => import('./pages/Contact'),
  about: () => import('./pages/About'),
  terms: () => import('./pages/Terms'),
  adminSettings: () => import('./pages/AdminSettings'),
  adminUsers: () => import('./pages/AdminUsers'),
  adminNews: () => import('./pages/AdminNews'),
  adminGallery: () => import('./pages/AdminGallery'),
  adminContact: () => import('./pages/AdminContact'),
  adminEnrollments: () => import('./pages/AdminEnrollments'),
  adminStats: () => import('./pages/AdminStats'),
  adminReports: () => import('./pages/AdminReports'),
  adminPromotions: () => import('./pages/AdminPromotions'),
  adminResultTables: () => import('./pages/AdminResultTables'),
  adminSheetTemplates: () => import('./pages/AdminSheetTemplates'),
  adminLogs: () => import('./pages/AdminLogs'),
  adminFinance: () => import('./pages/AdminFinance'),
  adminGovernmentFinance: () => import('./pages/AdminGovernmentFinance'),
  adminEducation: () => import('./pages/AdminEducationCore'),
  timetableConfig: () => import('./pages/TimetableConfiguration'),
  shiftManagement: () => import('./pages/ShiftManagement'),
  timetableAssignments: () => import('./pages/TeacherAssignmentManagement'),
  timetableAvailability: () => import('./pages/TeacherAvailabilityManagement'),
  timetableCurriculum: () => import('./pages/CurriculumManagement'),
  timetableViewer: () => import('./pages/TimableViewer'),
  timetableEditor: () => import('./pages/TimetableEditor'),
  timetableOperations: () => import('./pages/TimetableOperations'),
  timetableTeacherView: () => import('./pages/TeacherTimetableView'),
  timetableStudentView: () => import('./pages/StudentTimetableView'),
  timetableReports: () => import('./pages/TimetableReports'),
  timetableConflicts: () => import('./pages/TimetableConflictManager'),
    timetableHistory: () => import('./pages/TimetableChangeLog'),
    adminExamsDashboard: () => import('./pages/AdminExamsDashboard'),
    parentDashboard: () => import('./pages/ParentDashboard'),
    myFinance: () => import('./pages/StudentFinance'),
  studentRegistration: () => import('./pages/StudentRegistration'),
  onlineRegistrations: () => import('./pages/OnlineRegistrations'),
  studentManagement: () => import('./pages/StudentManagement')
};

const routePrefetchersByPath = {
  '/': () => import('./pages/Home'),
  '/courses': routePrefetchers.courses,
  '/chat': routePrefetchers.chat,
  '/profile': routePrefetchers.profile,
  '/news': routePrefetchers.news,
  '/news/archive': routePrefetchers.newsArchive,
  '/gallery': routePrefetchers.gallery,
  '/recordings': routePrefetchers.recordings,
  '/schedule': routePrefetchers.schedule,
  '/my-grades': routePrefetchers.myGrades,
  '/my-attendance': routePrefetchers.myAttendance,
  '/my-homework': routePrefetchers.myHomework,
  '/homework-manager': routePrefetchers.homeworkManager,
  '/attendance-manager': routePrefetchers.attendanceManager,
  '/grade-manager': routePrefetchers.gradeManager,
  '/quiz-builder': routePrefetchers.quizBuilder,
  '/register': routePrefetchers.register,
  '/login': routePrefetchers.login,
  '/instructor-login': routePrefetchers.login,
  '/admin-login': routePrefetchers.login,
  '/faq': routePrefetchers.faq,
  '/contact': routePrefetchers.contact,
  '/about': routePrefetchers.about,
  '/terms': routePrefetchers.terms,
  '/admin-settings': routePrefetchers.adminSettings,
  '/admin-users': routePrefetchers.adminUsers,
  '/admin-news': routePrefetchers.adminNews,
  '/admin-gallery': routePrefetchers.adminGallery,
  '/admin-contact': routePrefetchers.adminContact,
  '/admin-enrollments': routePrefetchers.adminEnrollments,
  '/admin-stats': routePrefetchers.adminReports,
  '/admin-reports': routePrefetchers.adminReports,
  '/admin-promotions': routePrefetchers.adminPromotions,
  '/admin-result-tables': routePrefetchers.adminResultTables,
  '/admin-sheet-templates': routePrefetchers.adminSheetTemplates,
  '/admin-logs': routePrefetchers.adminLogs,
  '/admin-finance': routePrefetchers.adminFinance,
  '/admin-government-finance': routePrefetchers.adminGovernmentFinance,
  '/admin-education': routePrefetchers.adminEducation,
  '/timetable': routePrefetchers.timetableConfig,
  '/timetable/timetable-configurations/index': routePrefetchers.timetableConfig,
  '/timetable/shift-management': routePrefetchers.shiftManagement,
  '/timetable/teacher-timetable-configurations': routePrefetchers.timetableAssignments,
  '/timetable/teacher-availability': routePrefetchers.timetableAvailability,
  '/timetable/curriculum': routePrefetchers.timetableCurriculum,
  '/timetable/generation': routePrefetchers.timetableViewer,
  '/timetable/viewer': routePrefetchers.timetableViewer,
  '/timetable/editor': routePrefetchers.timetableEditor,
  '/timetable/operations': routePrefetchers.timetableOperations,
  '/timetable/my-teacher-view': routePrefetchers.timetableTeacherView,
  '/timetable/student-view': routePrefetchers.timetableStudentView,
  '/timetable/reports': routePrefetchers.timetableReports,
  '/timetable/conflicts': routePrefetchers.timetableConflicts,
  '/timetable/history': routePrefetchers.timetableHistory,
  '/admin-exams-dashboard': routePrefetchers.adminExamsDashboard,
  '/parent-dashboard': routePrefetchers.parentDashboard,
  '/my-finance': routePrefetchers.myFinance,
  '/student-registration': routePrefetchers.studentRegistration,
  '/online-registrations': routePrefetchers.onlineRegistrations,
  '/student-management': routePrefetchers.studentManagement
};

const routePrefetchersByPrefix = [
  { prefix: '/courses/', key: '/courses/:id', load: () => import('./pages/CourseDetails') },
  { prefix: '/news/category/', key: '/news/category/:category', load: () => import('./pages/NewsCategory') },
  { prefix: '/news/', key: '/news/:id', load: routePrefetchers.newsDetail },
  { prefix: '/quiz/', key: '/quiz/:courseId', load: () => import('./pages/Quiz') },
  { prefix: '/grades/', key: '/grades/:grade', load: () => import('./pages/GradeDetails') },
  { prefix: '/admin-enrollments/', key: '/admin-enrollments/:id', load: routePrefetchers.adminEnrollmentDetail }
];

const LOGIN_ROUTE_PATHS = ['/login'];
const REGISTER_ROUTE_PATH = '/register';
const NEWS_SEARCH_CATEGORY_LABELS = {
  news: '\u062E\u0628\u0631',
  announcement: '\u0627\u0639\u0644\u0627\u0646',
  event: '\u0631\u0648\u06CC\u062F\u0627\u062F'
};
const QUICK_SEARCH_SECTION_META = {
  course: { label: '\u0635\u0646\u0641\u200C\u0647\u0627\u06CC \u0622\u0645\u0648\u0632\u0634\u06CC', icon: 'fa-graduation-cap' },
  news: { label: '\u0627\u062E\u0628\u0627\u0631 \u0648 \u0627\u0639\u0644\u0627\u0646\u0627\u062A', icon: 'fa-newspaper' },
  gallery: { label: '\u06AF\u0627\u0644\u0631\u06CC \u062A\u0635\u0627\u0648\u06CC\u0631', icon: 'fa-images' },
  nav: { label: '\u0645\u0646\u0648\u0647\u0627 \u0648 \u0644\u06CC\u0646\u06A9\u200C\u0647\u0627', icon: 'fa-compass' }
};
const REMOTE_SEARCH_CACHE_TTL_MS = 5 * 60 * 1000;
const RECENT_SEARCHES_STORAGE_KEY = 'school_quick_search_recent_v1';
const MAX_RECENT_SEARCHES = 6;
const API_HEALTH_POLL_MS = 30 * 1000;
const MENU_NEWS_SEEN_AT_STORAGE_KEY = 'school_menu_seen_news_at_v1';
const MENU_CHAT_SEEN_AT_STORAGE_KEY = 'school_menu_seen_chat_at_v1';
const MENU_ACTIVITY_POLL_MS = 60 * 1000;
const MEGA_MENU_CLOSE_DELAY_MS = 180;
const MEGA_MENU_BLUEPRINTS = {
  home: {
    tone: 'home',
    watermark: 'HOME',
    label: 'راهنمای سریع',
    summary: 'به مهم‌ترین مسیرهای سایت دسترسی سریع داشته باشید.',
    points: ['شروع سریع ثبت‌نام', 'ورود به صنف‌های آموزشی', 'دسترسی مستقیم به اخبار و گالری'],
    actions: [
      { title: 'صفحه خانه', href: '/' },
      { title: 'ثبت‌نام آنلاین', href: '/register' }
    ],
    sectionOrder: ['خدمات', 'آموزش', 'محتوا', 'راهنما', 'بیشتر']
  },
  education: {
    tone: 'education',
    watermark: 'EDU',
    label: 'مسیر آموزشی',
    summary: 'صنف‌ها، تقسیم اوقات، کارخانگی، آزمون و کارنامه را یکجا مدیریت کنید.',
    points: ['مرتب‌سازی بر اساس مضمون', 'دسترسی سریع به تقسیم اوقات', 'پیگیری نمرات و کارخانگی'],
    actions: [
      { title: 'مشاهده صنف‌ها', href: '/courses' },
      { title: 'تقسیم اوقات', href: '/schedule' }
    ],
    sectionOrder: ['آموزش', 'خدمات', 'راهنما', 'بیشتر']
  },
  virtual: {
    tone: 'virtual',
    watermark: 'LIVE',
    label: 'کلاس مجازی',
    summary: 'ورود سریع به صنف‌های آنلاین، جلسات زمان‌بندی‌شده، آرشیف ضبط و راهنمای استفاده.',
    points: ['صنف‌های آنلاین', 'جلسات با زمان‌بندی', 'آرشیف ضبط جلسات'],
    actions: [
      { title: 'صنف‌های آنلاین', href: '/chat?tab=live' },
      { title: 'آرشیف ضبط جلسات', href: '/recordings' }
    ],
    sectionOrder: ['آموزش', 'خدمات', 'راهنما', 'بیشتر']
  },
  news: {
    tone: 'content',
    watermark: 'NEWS',
    label: 'بخش محتوا',
    summary: 'آخرین اخبار، اعلانات و رویدادهای مدرسه را از همین منو دنبال کنید.',
    points: ['اخبار تازه', 'اعلانات رسمی', 'آرشیو رویدادها'],
    actions: [
      { title: 'همه اخبار', href: '/news' },
      { title: 'گالری تصاویر', href: '/gallery' }
    ],
    sectionOrder: ['محتوا', 'راهنما', 'بیشتر']
  },
  gallery: {
    tone: 'content',
    watermark: 'MEDIA',
    label: 'گالری',
    summary: 'تصاویر رویدادها، فعالیت‌های آموزشی و فضای مدرسه را ببینید.',
    points: ['گالری رویدادها', 'دسته‌بندی منظم تصاویر', 'دسترسی ساده از موبایل'],
    actions: [
      { title: 'نمایش گالری', href: '/gallery' },
      { title: 'اخبار مرتبط', href: '/news' }
    ],
    sectionOrder: ['محتوا', 'راهنما', 'بیشتر']
  },
  about: {
    tone: 'about',
    watermark: 'ABOUT',
    label: 'آشنایی با مدرسه',
    summary: 'معرفی مدرسه، تیم آموزشی و قوانین کلیدی را در یک نمای منظم ببینید.',
    points: ['معرفی مدرسه', 'تیم آموزشی', 'قوانین و مقررات'],
    actions: [
      { title: 'درباره ما', href: '/about' },
      { title: 'قوانین', href: '/terms' }
    ],
    sectionOrder: ['راهنما', 'خدمات', 'بیشتر']
  },
  contact: {
    tone: 'contact',
    watermark: 'HELP',
    label: 'ارتباط و پشتیبانی',
    summary: 'راه‌های ارتباط با مدرسه و کانال‌های پشتیبانی سریع در دسترس شماست.',
    points: ['شماره تماس و آدرس', 'ارسال پیام پشتیبانی', 'راهنمای خدمات'],
    actions: [
      { title: 'تماس با ما', href: '/contact' },
      { title: 'سوالات متداول', href: '/faq' }
    ],
    sectionOrder: ['راهنما', 'خدمات', 'بیشتر']
  },
  auth: {
    tone: 'services',
    watermark: 'ACCESS',
    label: 'ورود و خدمات',
    summary: 'ورود همه نقش‌ها از یک صفحه عمومی و یکپارچه انجام می‌شود.',
    points: ['ورود عمومی', 'دسترسی یکپارچه نقش‌ها', 'ثبت‌نام آنلاین'],
    actions: [
      { title: 'ورود عمومی', href: '/login' },
      { title: 'ثبت‌نام آنلاین', href: '/register' }
    ],
    sectionOrder: ['خدمات', 'راهنما', 'بیشتر']
  },
  generic: {
    tone: 'default',
    watermark: 'IMAN',
    label: 'میانبر سریع',
    summary: 'دسترسی سریع و منظم به زیرمنوهای این بخش.',
    points: ['نمایش مسیرهای مهم', 'دسترسی سریع با یک کلیک', 'طراحی یکسان در همه منوها'],
    actions: [
      { title: 'مشاهده بخش', href: '/' },
      { title: 'پشتیبانی', href: '/contact' }
    ],
    sectionOrder: ['خدمات', 'آموزش', 'محتوا', 'راهنما', 'بیشتر']
  }
};

const QUICK_LINKS = [
  { title: 'خانه', href: '/', icon: 'fa-house', group: 'عمومی' },
  { title: 'صنف‌ها', href: '/courses', icon: 'fa-graduation-cap', group: 'آموزش' },
  { title: 'اخبار', href: '/news', icon: 'fa-newspaper', group: 'محتوا' },
  { title: 'گالری', href: '/gallery', icon: 'fa-images', group: 'محتوا' },
  { title: 'درباره ما', href: '/about', icon: 'fa-circle-nodes', group: 'عمومی' },
  { title: 'تماس با ما', href: '/contact', icon: 'fa-phone', group: 'عمومی' },
  { title: 'ثبت‌نام آنلاین', href: '/register', icon: 'fa-user-plus', group: 'ورود / ثبت‌نام' },
  { title: 'ورود عمومی', href: '/login', icon: 'fa-right-to-bracket', group: 'ورود / ثبت‌نام' }
];

const getTokenClaims = () => {
  const token = localStorage.getItem('token');
  if (!token || !token.includes('.')) return {};
  try {
    const payload = token.split('.')[1];
    const decoded = JSON.parse(atob(payload.replace(/-/g, '+').replace(/_/g, '/')));
    return decoded || {};
  } catch {
    return {};
  }
};

const getTokenRole = () => String(getTokenClaims()?.role || '').trim();

const getRole = () => localStorage.getItem('role') || getTokenRole();
const isAdmin = () => getRole() === 'admin';
const isParent = () => getRole() === 'parent';
const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};
const isAuthed = () => {
  const token = localStorage.getItem('token');
  const userId = localStorage.getItem('userId');
  const role = localStorage.getItem('role');
  return !!token || !!userId || !!role;
};
const isInstructor = () => ['admin', 'instructor'].includes(getRole());
const isStudent = () => getRole() === 'student';
const getStoredOrgRole = () => String(localStorage.getItem('orgRole') || getTokenClaims()?.orgRole || '').trim().toLowerCase();
const getStoredAdminLevel = () => String(localStorage.getItem('adminLevel') || getTokenClaims()?.adminLevel || '').trim().toLowerCase();
const isGeneralPresidentAdminSession = () => {
  const role = getRole();
  const adminLevel = getStoredAdminLevel();
  const orgRole = getStoredOrgRole();
  return role === 'admin' && (adminLevel === 'general_president' || orgRole === 'general_president');
};
const getStoredEffectivePermissions = () => {
  const isGeneralPresident = isGeneralPresidentAdminSession();
  try {
    const raw = localStorage.getItem('effectivePermissions');
    if (!raw) {
      if (isGeneralPresident) {
        return ['manage_users', 'manage_enrollments', 'manage_memberships', 'manage_finance', 'manage_content', 'view_reports', 'view_schedule', 'manage_schedule', 'access_school_manager', 'access_head_teacher'];
      }
      return [];
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      if (isGeneralPresident) {
        return ['manage_users', 'manage_enrollments', 'manage_memberships', 'manage_finance', 'manage_content', 'view_reports', 'view_schedule', 'manage_schedule', 'access_school_manager', 'access_head_teacher'];
      }
      return [];
    }
    if (isGeneralPresident) {
      return Array.from(new Set([
        'manage_users',
        'manage_enrollments',
        'manage_memberships',
        'manage_finance',
        'manage_content',
        'view_reports',
        'view_schedule',
        'manage_schedule',
        'access_school_manager',
        'access_head_teacher',
        ...parsed
      ]));
    }
    return parsed;
  } catch {
    if (isGeneralPresident) {
      return ['manage_users', 'manage_enrollments', 'manage_memberships', 'manage_finance', 'manage_content', 'view_reports', 'view_schedule', 'manage_schedule', 'access_school_manager', 'access_head_teacher'];
    }
    return [];
  }
};
const normalizePermissionList = (permission) => (
  Array.isArray(permission)
    ? permission.map((item) => String(item || '').trim()).filter(Boolean)
    : [String(permission || '').trim()].filter(Boolean)
);
const hasEffectivePermission = (permission) => {
  const expected = normalizePermissionList(permission);
  if (!expected.length) return true;
  const permissions = getStoredEffectivePermissions();
  return expected.some((item) => permissions.includes(item));
};

const logout = () => {
  localStorage.removeItem('token');
  localStorage.removeItem('userId');
  localStorage.removeItem('userName');
  localStorage.removeItem('role');
  localStorage.removeItem('orgRole');
  localStorage.removeItem('status');
  localStorage.removeItem('adminLevel');
  localStorage.removeItem('avatarUrl');
  localStorage.removeItem('effectivePermissions');
  localStorage.removeItem('lastLoginAt');
  window.location.href = '/';
};

const pathOnly = (href = '') => String(href || '').split('#')[0].split('?')[0];
const getRoutePrefetchJob = (href = '', role = '') => {
  const cleanPath = pathOnly(href);
  if (!cleanPath || cleanPath === '#') return { key: '', load: null };

  if (cleanPath === '/dashboard') {
    if (role === 'admin') return { key: '/dashboard:admin', load: routePrefetchers.adminDashboard };
    if (role === 'parent') return { key: '/dashboard:parent', load: routePrefetchers.parentDashboard };
    if (role === 'instructor') return { key: '/dashboard:instructor', load: routePrefetchers.instructorDashboard };
    return { key: '/dashboard:student', load: routePrefetchers.studentDashboard };
  }

  if (cleanPath.startsWith('/admin-enrollments/') && cleanPath.endsWith('/print')) {
    return { key: '/admin-enrollments/:id/print', load: routePrefetchers.adminEnrollmentPrint };
  }

  const directLoader = routePrefetchersByPath[cleanPath];
  if (directLoader) return { key: cleanPath, load: directLoader };

  const prefixMatch = routePrefetchersByPrefix.find((item) => cleanPath.startsWith(item.prefix));
  if (prefixMatch) return { key: prefixMatch.key, load: prefixMatch.load };

  return { key: cleanPath, load: null };
};

const resolveAssetUrl = (url = '') => {
  const value = String(url || '');
  if (!value) return '';
  if (value.startsWith('http')) return value;
  return `${API_BASE}/${value.replace(/^\//, '')}`;
};
const escapeRegExp = (value = '') => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const readStoredTimestamp = (key) => {
  try {
    const raw = localStorage.getItem(key);
    const num = Number(raw);
    return Number.isFinite(num) && num > 0 ? num : 0;
  } catch {
    return 0;
  }
};
const writeStoredTimestamp = (key, value) => {
  const num = Number(value);
  if (!Number.isFinite(num) || num <= 0) return;
  try {
    localStorage.setItem(key, String(num));
  } catch {
    // ignore storage errors
  }
};

const MENU_KIND_TEXT_MATCHERS = {
  auth: /(\/login|\/register|\/admin-login|\/instructor-login|ورود|عمومی|ثبت.?نام|login|register|auth)/i,
  news: /(\/news|اخبار|اعلان|رویداد|news|announcement|event)/i,
  gallery: /(\/gallery|گالری|gallery|media|photo|image)/i,
  about: /(\/about|\/terms|درباره|معرفی|قوانین|about|terms|team)/i,
  contact: /(\/contact|\/faq|تماس|پشتیبانی|راهنما|help|support|contact|faq)/i,
  virtual: /(مجازی|آنلاین|سیستم\s*مجازی|virtual|online|jitsi|meet|live|\/chat|\/recordings|record)/i,
  education: /(آموزش|صنف|مضمون|دروس|course|class|lesson|\/courses|\/schedule|\/my-homework|\/my-grades)/i
};

const resolveMenuBlueprintKind = (item = {}) => {
  const href = pathOnly(item?.href || '');
  const childPaths = (item?.children || [])
    .filter((child) => child && child.enabled !== false)
    .map((child) => pathOnly(child?.href || ''))
    .join(' ');
  const text = `${item?.title || ''} ${href} ${childPaths}`.toLowerCase();

  if (href === '/') return 'home';
  if (MENU_KIND_TEXT_MATCHERS.auth.test(text)) return 'auth';
  if (MENU_KIND_TEXT_MATCHERS.news.test(text)) return 'news';
  if (MENU_KIND_TEXT_MATCHERS.gallery.test(text)) return 'gallery';
  if (MENU_KIND_TEXT_MATCHERS.about.test(text)) return 'about';
  if (MENU_KIND_TEXT_MATCHERS.contact.test(text)) return 'contact';
  if (MENU_KIND_TEXT_MATCHERS.virtual.test(text)) return 'virtual';
  if (MENU_KIND_TEXT_MATCHERS.education.test(text)) return 'education';
  return 'generic';
};

const getDefaultMegaSectionByKind = (kind = 'generic') => {
  if (kind === 'education' || kind === 'virtual') return 'آموزش';
  if (kind === 'news' || kind === 'gallery') return 'محتوا';
  if (kind === 'about' || kind === 'contact') return 'راهنما';
  if (kind === 'auth') return 'خدمات';
  return 'بیشتر';
};

const buildMenuBlueprintLibrary = (rawBlueprints) => {
  const merged = { ...MEGA_MENU_BLUEPRINTS };
  if (!rawBlueprints || typeof rawBlueprints !== 'object' || Array.isArray(rawBlueprints)) return merged;

  Object.entries(rawBlueprints).forEach(([key, value]) => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return;
    const base = merged[key] || {};
    const next = { ...base, ...value };

    if (Array.isArray(value.points)) {
      next.points = value.points.map((point) => String(point || '').trim()).filter(Boolean).slice(0, 5);
    } else if (!Array.isArray(base.points)) {
      next.points = [];
    }

    if (Array.isArray(value.actions)) {
      next.actions = value.actions
        .map((action) => ({
          title: String(action?.title || '').trim(),
          href: String(action?.href || '').trim()
        }))
        .filter((action) => action.title && action.href);
    } else if (!Array.isArray(base.actions)) {
      next.actions = [];
    }

    if (Array.isArray(value.sectionOrder)) {
      next.sectionOrder = value.sectionOrder.map((section) => String(section || '').trim()).filter(Boolean);
    } else if (!Array.isArray(base.sectionOrder)) {
      next.sectionOrder = [];
    }

    merged[key] = next;
  });

  return merged;
};

const resolveMenuBlueprint = (item = {}, children = [], blueprintLibrary = MEGA_MENU_BLUEPRINTS) => {
  const kind = resolveMenuBlueprintKind(item);
  const base = blueprintLibrary[kind] || blueprintLibrary.generic || MEGA_MENU_BLUEPRINTS.generic;
  const activeChildren = (children || []).filter((child) => child && child.enabled !== false);

  const resolveActionHref = (preferredHref = '') => {
    const preferredPath = pathOnly(preferredHref);
    const exactChild = activeChildren.find((child) => pathOnly(child?.href || '') === preferredPath);
    if (exactChild?.href) return exactChild.href;
    if (preferredPath && preferredPath !== '#') return preferredHref;
    return activeChildren[0]?.href || item?.href || '/';
  };

  const actions = (base.actions || [])
    .map((action) => ({
      title: String(action?.title || '').trim(),
      href: resolveActionHref(action?.href || '')
    }))
    .filter((action) => action.title && action.href && action.href !== '#');

  return {
    ...base,
    kind,
    actions,
    sectionOrder: Array.isArray(base.sectionOrder) && base.sectionOrder.length
      ? base.sectionOrder
      : ((blueprintLibrary.generic && blueprintLibrary.generic.sectionOrder) || MEGA_MENU_BLUEPRINTS.generic.sectionOrder || [])
  };
};

const isLoginMenuItem = (item) => {
  if (!item) return false;
  const title = String(item.title || '');
  if (title.includes('ورود') || LOGIN_ROUTE_PATHS.includes(pathOnly(item.href || ''))) return true;
  return (item.children || []).some((child) => {
    if (!child || child.enabled === false) return false;
    return LOGIN_ROUTE_PATHS.includes(pathOnly(child.href || ''));
  });
};

const isRegisterMenuItem = (item) => {
  if (!item) return false;
  const title = String(item.title || '').toLowerCase();
  if (title.includes('register') || title.includes('ثبت') || pathOnly(item.href || '') === REGISTER_ROUTE_PATH) return true;
  return (item.children || []).some((child) => {
    if (!child || child.enabled === false) return false;
    return pathOnly(child.href || '') === REGISTER_ROUTE_PATH;
  });
};

const isAuthMenuItem = (item) => isLoginMenuItem(item) || isRegisterMenuItem(item);

const getMegaChildUiMeta = (child, parentTitle = '', menuKind = 'generic') => {
  const href = pathOnly(child?.href || '');
  const title = String(child?.title || '');
  const text = `${title} ${href}`.toLowerCase();

  let section = getDefaultMegaSectionByKind(menuKind);
  if (/courses|grade|quiz|attendance|homework|schedule|class/.test(text)) section = '\u0622\u0645\u0648\u0632\u0634\u06CC';
  else if (/news|gallery|archive|category/.test(text)) section = '\u0645\u062D\u062A\u0648\u0627\u06CC \u0622\u0645\u0648\u0632\u0634\u06CC \u0628\u0631\u0627\u06CC \u0627\u06cc\u0646 \u062d\u0633\u0627\u0628 \u0641\u0639\u0627\u0644 \u0646\u06cc\u0633\u062a';
  else if (/contact|about|faq|terms|help/.test(text)) section = '\u0631\u0627\u0647\u0646\u0645\u0627';
  else if (/register|login|payment|receipt/.test(text)) section = '\u062E\u062F\u0645\u0627\u062A';

  let badge = '';
  let badgeTone = 'info';
  if (/chat|online|live/.test(text)) {
    badge = '\u0632\u0646\u062F\u0647';
    badgeTone = 'live';
  } else if (/register|payment|receipt|admin/.test(text)) {
    badge = '\u0645\u0647\u0645';
    badgeTone = 'warn';
  } else if (/news|announcement|event/.test(text)) {
    badge = '\u062C\u062F\u06CC\u062F';
    badgeTone = 'info';
  } else if (/faq|terms|about|contact/.test(text)) {
    badge = '\u0631\u0627\u0647\u0646\u0645\u0627';
    badgeTone = 'muted';
  } else if (/courses|grade|quiz|attendance|homework|schedule/.test(text)) {
    badge = '\u0645\u062D\u0628\u0648\u0628';
    badgeTone = 'success';
  }

  let description = `\u062F\u0633\u062A\u0631\u0633\u06CC \u0645\u0633\u062A\u0642\u06CC\u0645 \u0628\u0647 ${title || parentTitle || '\u0627\u06CC\u0646 \u0628\u062E\u0634'}`;
  if (/courses|class/.test(text)) description = '\u0645\u0634\u0627\u0647\u062F\u0647 \u0648 \u062F\u0633\u062A\u0631\u0633\u06CC \u0628\u0647 \u0635\u0646\u0641\u200C\u0647\u0627 \u0648 \u0645\u062D\u062A\u0648\u0627\u06CC \u0622\u0645\u0648\u0632\u0634\u06CC \u0628\u0631\u0627\u06CC \u0627\u06cc\u0646 \u062d\u0633\u0627\u0628 \u0641\u0639\u0627\u0644 \u0646\u06cc\u0633\u062a';
  else if (/grade/.test(text)) description = '\u0628\u062E\u0634 \u0646\u0645\u0631\u0627\u062A \u0648 \u06A9\u0627\u0631\u0646\u0627\u0645\u0647 \u0628\u0627 \u062F\u0633\u062A\u0631\u0633\u06CC \u0633\u0631\u06CC\u0639';
  else if (/attendance/.test(text)) description = '\u0645\u062F\u06CC\u0631\u06CC\u062A \u06CC\u0627 \u0645\u0634\u0627\u0647\u062F\u0647 \u062D\u0636\u0648\u0631 \u0648 \u063A\u06CC\u0627\u0628 \u0628\u0627 \u0646\u0645\u0627\u06CC\u0634 \u0645\u0646\u0638\u0645';
  else if (/homework/.test(text)) description = '\u062B\u0628\u062A \u0648 \u067E\u06CC\u06AF\u06CC\u0631\u06CC \u06A9\u0627\u0631\u062E\u0627\u0646\u06AF\u06CC \u0648 \u062A\u062D\u0648\u06CC\u0644\u200C\u0647\u0627';
  else if (/quiz/.test(text)) description = '\u0633\u0627\u062E\u062A \u0622\u0632\u0645\u0648\u0646 \u06CC\u0627 \u0634\u0631\u06A9\u062A \u062F\u0631 \u0622\u0632\u0645\u0648\u0646\u200C\u0647\u0627\u06CC \u0622\u0646\u0644\u0627\u06CC\u0646';
  else if (/record/.test(text)) description = '\u0622\u0631\u0634\u06CC\u0641 \u0636\u0628\u0637 \u062C\u0644\u0633\u0627\u062A \u0628\u0631\u0627\u06CC \u0628\u0627\u0632\u0628\u06CC\u0646\u06CC \u0648 \u062F\u0627\u0646\u0644\u0648\u062F';
  else if (/schedule/.test(text)) description = '\u0645\u0634\u0627\u0647\u062F\u0647 \u062A\u0642\u0633\u06CC\u0645 \u0627\u0648\u0642\u0627\u062A \u0648 \u0628\u0631\u0646\u0627\u0645\u0647 \u0631\u0648\u0632\u0627\u0646\u0647';
  else if (/news/.test(text)) description = '\u0622\u062E\u0631\u06CC\u0646 \u0627\u062E\u0628\u0627\u0631 \u0648 \u0627\u0639\u0644\u0627\u0646\u0627\u062A \u0645\u062F\u0631\u0633\u0647 \u062F\u0631 \u06CC\u06A9 \u062C\u0627';
  else if (/gallery/.test(text)) description = '\u0645\u0634\u0627\u0647\u062F\u0647 \u062A\u0635\u0627\u0648\u06CC\u0631 \u0648 \u0631\u0648\u06CC\u062F\u0627\u062F\u0647\u0627 \u0628\u0627 \u06AF\u0627\u0644\u0631\u06CC \u0645\u062F\u0631\u0646';
  else if (/contact|about|faq|terms/.test(text)) description = '\u0631\u0627\u0647\u0646\u0645\u0627\u06CC \u0627\u0633\u062A\u0641\u0627\u062F\u0647 \u0648 \u0627\u0631\u062A\u0628\u0627\u0637 \u0628\u0627 \u0645\u062F\u0631\u0633\u0647';
  else if (/register|login|payment/.test(text)) description = '\u062F\u0633\u062A\u0631\u0633\u06CC \u0633\u0631\u06CC\u0639 \u0628\u0647 \u062E\u062F\u0645\u0627\u062A \u0648\u0631\u0648\u062F \u0648 \u062B\u0628\u062A\u200C\u0646\u0627\u0645';

  return { section, badge, badgeTone, description };
};

function RouteLoading() {
  return (
    <div className="route-loading" role="status" aria-live="polite">
      <span>در حال بارگذاری...</span>
    </div>
  );
}

function RoleDashboard() {
  if (isAdmin()) return <AdminPanel />;
  if (isParent()) return <ParentDashboard />;
  if (isInstructor()) return <InstructorDashboard />;
  return <Dashboard />;
}

function PermissionAccessGuard({
  roles = ['admin'],
  permission = '',
  deniedMessage = '',
  children
}) {
  const role = getRole();
  const token = localStorage.getItem('token');
  const roleKey = Array.isArray(roles) ? roles.join('|') : '';
  const allowedRoles = Array.isArray(roles) && roles.length ? roles : ['admin'];
  const hasRole = allowedRoles.includes(role);
  const permissionList = normalizePermissionList(permission);
  const permissionKey = permissionList.join('|');
  const primaryPermission = permissionList[0] || '';
  const requiresPermission = permissionList.length > 0;
  const [loading, setLoading] = useState(requiresPermission);
  const [allowed, setAllowed] = useState(!requiresPermission);
  const [requestLoading, setRequestLoading] = useState(false);
  const [requestFeedback, setRequestFeedback] = useState({ tone: 'info', message: '' });
  const deniedAction = role === 'admin'
    ? {
      href: '/dashboard',
      label: '\u0628\u0627\u0632\u06AF\u0634\u062A \u0628\u0647 \u067E\u0646\u0644 \u0645\u062F\u06CC\u0631\u06CC\u062A'
    }
    : role === 'instructor'
      ? {
        href: '/dashboard',
        label: '\u0628\u0627\u0632\u06AF\u0634\u062A \u0628\u0647 \u062F\u0627\u0634\u0628\u0648\u0631\u062F \u0627\u0633\u062A\u0627\u062F'
      }
      : role === 'parent'
        ? {
          href: '/dashboard',
          label: '\u0628\u0627\u0632\u06AF\u0634\u062A \u0628\u0647 \u062F\u0627\u0634\u0628\u0648\u0631\u062F \u0648\u0627\u0644\u062F/\u0633\u0631\u067E\u0631\u0633\u062A'
        }
      : role === 'student'
        ? {
          href: '/dashboard',
          label: '\u0628\u0627\u0632\u06AF\u0634\u062A \u0628\u0647 \u062F\u0627\u0634\u0628\u0648\u0631\u062F \u0634\u0627\u06AF\u0631\u062F'
        }
        : {
          href: '/',
          label: '\u0628\u0627\u0632\u06AF\u0634\u062A \u0628\u0647 \u0635\u0641\u062D\u0647 \u062E\u0627\u0646\u0647'
        };

  const submitAccessRequest = useCallback(async () => {
    if (!requiresPermission || requestLoading) return;
    setRequestLoading(true);
    setRequestFeedback({ tone: 'info', message: '' });

    try {
      const routePath = window.location.pathname || '';
      const res = await fetch(`${API_BASE}/api/users/me/access-request`, {
        method: 'POST',
        headers: {
          ...getAuthHeaders(),
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ permission: primaryPermission, route: routePath })
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data?.success) {
        setRequestFeedback({
          tone: 'error',
          message: data?.message || '\u062b\u0628\u062a \u062f\u0631\u062e\u0648\u0627\u0633\u062a \u0627\u0646\u062c\u0627\u0645 \u0646\u0634\u062f'
        });
      } else {
        setRequestFeedback({
          tone: 'success',
          message: data?.message || '\u062f\u0631\u062e\u0648\u0627\u0633\u062a \u0634\u0645\u0627 \u0627\u0631\u0633\u0627\u0644 \u0634\u062f'
        });
      }
    } catch {
      setRequestFeedback({
        tone: 'error',
        message: '\u062e\u0637\u0627 \u062f\u0631 \u0627\u0631\u062a\u0628\u0627\u0637 \u0628\u0627 \u0633\u0631\u0648\u0631'
      });
    } finally {
      setRequestLoading(false);
    }
  }, [primaryPermission, requestLoading, requiresPermission]);

  useEffect(() => {
    setRequestLoading(false);
    setRequestFeedback({ tone: 'info', message: '' });
  }, [permissionKey, role, roleKey]);

  useEffect(() => {
    let cancelled = false;

    const finish = (isAllowed) => {
      if (cancelled) return;
      setAllowed(!!isAllowed);
      setLoading(false);
    };

    if (!token || !isAuthed() || !hasRole) {
      finish(false);
      return () => { cancelled = true; };
    }

    if (!requiresPermission) {
      finish(true);
      return () => { cancelled = true; };
    }

    if (hasEffectivePermission(permissionList)) {
      finish(true);
      return () => { cancelled = true; };
    }

    const checkAccess = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/users/me`, { headers: { ...getAuthHeaders() } });
        const data = await res.json();
        if (!data?.success) {
          finish(false);
          return;
        }
        const permissions = Array.isArray(data?.user?.effectivePermissions) ? data.user.effectivePermissions : [];
        try {
          localStorage.setItem('effectivePermissions', JSON.stringify(permissions));
        } catch {
          // ignore storage errors
        }
        finish(permissionList.some((item) => permissions.includes(item)));
      } catch {
        finish(false);
      }
    };

    setLoading(true);
    checkAccess();
    return () => { cancelled = true; };
  }, [token, hasRole, permissionKey, requiresPermission, roleKey]);

  if (!isAuthed()) return <Login />;
  if (!hasRole) return <Login />;
  if (loading) return <RouteLoading />;
  if (!allowed) {
    return (
      <AccessDenied
        title="\u062F\u0633\u062A\u0631\u0633\u06CC \u0645\u062D\u062F\u0648\u062F"
        message={deniedMessage || '\u062F\u0633\u062A\u0631\u0633\u06CC \u0627\u06CC\u0646 \u0628\u062E\u0634 \u0628\u0631\u0627\u06CC \u062D\u0633\u0627\u0628 \u0641\u0639\u0627\u0644 \u0646\u06CC\u0633\u062A.'}
        actionHref={deniedAction.href}
        actionLabel={deniedAction.label}
        onRequestAccess={requiresPermission ? submitAccessRequest : null}
        requestActionLoading={requestLoading}
        requestFeedback={requestFeedback.message}
        requestFeedbackTone={requestFeedback.tone}
        secondaryHref="/profile"
        secondaryLabel="\u062D\u0633\u0627\u0628 \u06A9\u0627\u0631\u0628\u0631\u06CC"
      />
    );
  }
  return children;
}

function AdminSettingsAccessGuard() {
  return (
    <PermissionAccessGuard
      roles={['admin']}
      permission="manage_content"
      deniedMessage="دسترسی مدیریت منوها برای این حساب فعال نیست."
    >
      <AdminSettings />
    </PermissionAccessGuard>
  );
}

function AppShell() {
  const navigate = useNavigate();
  const role = getRole();
  const userName = localStorage.getItem('userName') || 'کاربر';
  const [avatarUrl, setAvatarUrl] = useState(localStorage.getItem('avatarUrl') || '');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [openMobileGroups, setOpenMobileGroups] = useState({});
  const [megaPreviewMap, setMegaPreviewMap] = useState({});
  const [megaAnchorMap, setMegaAnchorMap] = useState({});
  const [openMegaDropdownKey, setOpenMegaDropdownKey] = useState('');
  const [headerHidden, setHeaderHidden] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchActiveIndex, setSearchActiveIndex] = useState(-1);
  const [menuUnread, setMenuUnread] = useState({ news: 0, chat: 0 });
  const [apiHealth, setApiHealth] = useState({
    status: 'checking',
    latencyMs: null,
    checkedAt: ''
  });
  const [apiHealthLoading, setApiHealthLoading] = useState(false);
  const [recentSearches, setRecentSearches] = useState(() => {
    try {
      const raw = localStorage.getItem(RECENT_SEARCHES_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed.filter((item) => item?.title && item?.href).slice(0, MAX_RECENT_SEARCHES) : [];
    } catch {
      return [];
    }
  });
  const [remoteSearch, setRemoteSearch] = useState({ loading: false, error: '', courses: [], news: [], gallery: [] });
  const newsSearchPoolRef = useRef([]);
  const newsPoolLoadedRef = useRef(false);
  const gallerySearchPoolRef = useRef([]);
  const galleryPoolLoadedRef = useRef(false);
  const remoteQueryCacheRef = useRef(new Map());
  const searchBoxRef = useRef(null);
  const searchResultRefs = useRef([]);
  const megaCloseTimerRef = useRef(null);
  const lastScrollYRef = useRef(0);
  const prefetchedRoutesRef = useRef(new Set());
  const { settings } = useSiteSettings();
  const menuBlueprintLibrary = useMemo(
    () => buildMenuBlueprintLibrary(settings?.menuBlueprints),
    [settings?.menuBlueprints]
  );
  const location = useLocation();
  const path = location.pathname || '';
  const isHome = path === '/';
  const authed = isAuthed();
  const roleLabel = role === 'admin'
    ? '\u0627\u062F\u0645\u06CC\u0646'
    : role === 'parent'
      ? '\u0648\u0627\u0644\u062F/\u0633\u0631\u067E\u0631\u0633\u062A'
    : role === 'instructor'
      ? '\u0627\u0633\u062A\u0627\u062F'
      : '\u0634\u0627\u06AF\u0631\u062F';
  const lastLoginRaw = localStorage.getItem('lastLoginAt') || '';
  const lastLoginLabel = formatAfghanDateTime(lastLoginRaw, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  const isDashboardArea = authed && (
    path === '/dashboard' ||
    path === '/parent-dashboard' ||
    path.startsWith('/admin') ||
    path.startsWith('/timetable') ||
    path.startsWith('/instructor') ||
    path.startsWith('/quiz') ||
    path === '/grade-manager' ||
    path === '/attendance-manager' ||
    path === '/homework-manager' ||
    path === '/my-grades' ||
    path === '/my-attendance' ||
    path === '/my-homework' ||
    path === '/my-finance' ||
    path === '/chat' ||
    path === '/recordings' ||
    path === '/schedule' ||
    path === '/add-course' ||
    path === '/payment' ||
    path === '/submit-receipt' ||
    path === '/profile' ||
    path === '/student-report' ||
    path === '/instructor-report' ||
    path === '/student-registration' ||
    path === '/online-registrations' ||
    path === '/student-management'
  );

  const hideMainNav = isDashboardArea;
  const useCompactAdminApiHealth = role === 'admin' && (path === '/dashboard' || path.startsWith('/admin') || path.startsWith('/timetable'));
  const apiHealthCheckedLabel = useMemo(() => {
    return formatAfghanTime(apiHealth.checkedAt, { hour: '2-digit', minute: '2-digit' });
  }, [apiHealth.checkedAt]);

  const menuItems = (settings?.mainMenu || []).filter((item) => item && item.enabled !== false);
  const hasLoginMenu = menuItems.some((item) => isLoginMenuItem(item));
  const hasRegisterMenu = menuItems.some((item) => isRegisterMenuItem(item));
  const visibleMenuItems = (() => {
    const filtered = menuItems.filter((item) => !(authed && isAuthMenuItem(item)));
    let authSeen = false;
    return filtered.filter((item) => {
      if (!isAuthMenuItem(item)) return true;
      if (authSeen) return false;
      authSeen = true;
      return true;
    });
  })();
  const userAvatarSrc = avatarUrl ? `${API_BASE}/${avatarUrl}` : '';
  const headerLogoSrc = settings?.logoUrl
    ? (settings.logoUrl.startsWith('http') ? settings.logoUrl : `${API_BASE}/${settings.logoUrl}`)
    : '';

  const prefetchRouteByHref = useCallback((href = '') => {
    const job = getRoutePrefetchJob(href, role);
    if (!job.load || !job.key) return;
    if (prefetchedRoutesRef.current.has(job.key)) return;

    prefetchedRoutesRef.current.add(job.key);
    Promise.resolve()
      .then(() => job.load())
      .catch(() => {
        prefetchedRoutesRef.current.delete(job.key);
      });
  }, [role]);

  const getPrefetchHandlers = useCallback((href = '') => ({
    onMouseEnter: () => prefetchRouteByHref(href),
    onFocus: () => prefetchRouteByHref(href)
  }), [prefetchRouteByHref]);

  useEffect(() => {
    if (!authed) return undefined;
    let cancelled = false;

    const syncIdentity = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/users/me`, { headers: { ...getAuthHeaders() } });
        const data = await res.json();
        if (!data?.success || !data?.user || cancelled) return;

        const user = data.user;
        const nextPermissions = Array.isArray(user.effectivePermissions) ? user.effectivePermissions : [];

        localStorage.setItem('role', String(user.role || localStorage.getItem('role') || ''));
        localStorage.setItem('orgRole', String(user.orgRole || localStorage.getItem('orgRole') || ''));
        localStorage.setItem('adminLevel', String(user.adminLevel || localStorage.getItem('adminLevel') || ''));
        localStorage.setItem('effectivePermissions', JSON.stringify(nextPermissions));

        if (user.name) localStorage.setItem('userName', String(user.name));
        if (user.id || user._id) localStorage.setItem('userId', String(user.id || user._id));
        if (user.avatarUrl !== undefined) {
          localStorage.setItem('avatarUrl', String(user.avatarUrl || ''));
          setAvatarUrl(String(user.avatarUrl || ''));
        }
      } catch {
        // Silent: guards still fallback to token and stored values.
      }
    };

    syncIdentity();
    return () => {
      cancelled = true;
    };
  }, [authed]);

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;

    const originalFetch = window.fetch.bind(window);
    const patchedFetch = (input, init = {}) => {
      const token = localStorage.getItem('token');
      if (!token) {
        return originalFetch(input, init);
      }

      const requestUrl = typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.toString()
          : input?.url || '';

      const shouldAttachAuth = requestUrl.startsWith('/api/') || requestUrl.includes('/api/');
      if (!shouldAttachAuth) {
        return originalFetch(input, init);
      }

      const headers = new Headers(
        input instanceof Request ? input.headers : (init?.headers || {})
      );

      if (!headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${token}`);
      }

      if (input instanceof Request) {
        return originalFetch(new Request(input, { ...init, headers }));
      }

      return originalFetch(input, { ...init, headers });
    };

    window.fetch = patchedFetch;
    return () => {
      if (window.fetch === patchedFetch) {
        window.fetch = originalFetch;
      }
    };
  }, []);

  useEffect(() => {
    const idlePrefetchTargets = ['/courses'];
    if (authed) {
      idlePrefetchTargets.push('/chat', '/dashboard');
    }

    let cancelled = false;
    const runPrefetch = () => {
      idlePrefetchTargets.forEach((href) => {
        if (cancelled) return;
        prefetchRouteByHref(href);
      });
    };

    if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
      const idleId = window.requestIdleCallback(() => {
        if (!cancelled) runPrefetch();
      }, { timeout: 1400 });
      return () => {
        cancelled = true;
        if ('cancelIdleCallback' in window) {
          window.cancelIdleCallback(idleId);
        }
      };
    }

    const timerId = window.setTimeout(() => {
      if (!cancelled) runPrefetch();
    }, 500);

    return () => {
      cancelled = true;
      window.clearTimeout(timerId);
    };
  }, [authed, prefetchRouteByHref]);

  useEffect(() => {
    if (!API_ORIGIN || typeof document === 'undefined') return undefined;

    const head = document.head;
    const existing = head.querySelector('link[data-api-preconnect="true"]');
    if (existing && existing.getAttribute('href') === API_ORIGIN) return undefined;
    if (existing) existing.remove();

    const preconnect = document.createElement('link');
    preconnect.rel = 'preconnect';
    preconnect.href = API_ORIGIN;
    preconnect.setAttribute('data-api-preconnect', 'true');
    head.appendChild(preconnect);

    return () => {
      if (preconnect.parentNode) preconnect.parentNode.removeChild(preconnect);
    };
  }, [API_ORIGIN]);

  const runApiHealthCheck = useCallback(async ({ markChecking = true } = {}) => {
    if (markChecking) {
      setApiHealth((prev) => ({ ...prev, status: 'checking' }));
    }
    setApiHealthLoading(true);

    const startedAt = typeof performance !== 'undefined' && performance.now
      ? performance.now()
      : Date.now();
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 5000);

    try {
      const res = await fetch(`${API_BASE}/api/health`, {
        method: 'GET',
        cache: 'no-store',
        signal: controller.signal,
        headers: { Accept: 'application/json' }
      });

      if (!res.ok) throw new Error(`HTTP_${res.status}`);
      await res.json().catch(() => ({}));

      const endedAt = typeof performance !== 'undefined' && performance.now
        ? performance.now()
        : Date.now();
      const latencyMs = Math.max(0, Math.round(endedAt - startedAt));

      setApiHealth({
        status: 'online',
        latencyMs,
        checkedAt: new Date().toISOString()
      });
    } catch {
      setApiHealth({
        status: 'offline',
        latencyMs: null,
        checkedAt: new Date().toISOString()
      });
    } finally {
      window.clearTimeout(timeoutId);
      setApiHealthLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!authed || !isDashboardArea) return undefined;
    runApiHealthCheck();
    const intervalId = window.setInterval(() => runApiHealthCheck({ markChecking: false }), API_HEALTH_POLL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [authed, isDashboardArea, runApiHealthCheck]);

  useEffect(() => {
    if (!headerLogoSrc || typeof document === 'undefined') return undefined;

    const head = document.head;
    const existing = head.querySelector('link[data-brand-logo-preload="true"]');
    if (existing && existing.getAttribute('href') === headerLogoSrc) return undefined;
    if (existing) existing.remove();

    const preload = document.createElement('link');
    preload.rel = 'preload';
    preload.as = 'image';
    preload.href = headerLogoSrc;
    preload.setAttribute('fetchpriority', 'high');
    preload.setAttribute('data-brand-logo-preload', 'true');
    head.appendChild(preload);

    return () => {
      if (preload.parentNode) preload.parentNode.removeChild(preload);
    };
  }, [headerLogoSrc]);

  const isPathActive = (href = '') => {
    const clean = pathOnly(href);
    if (!clean || clean === '#') return false;
    if (clean === '/') return path === '/';
    return path === clean || path.startsWith(`${clean}/`);
  };

  const hasActiveChild = (item) => (item.children || []).some((child) => isPathActive(child?.href || ''));

  const getMenuUnreadMeta = (href = '') => {
    const clean = pathOnly(href);
    if (!clean || clean === '#') return null;

    if (clean === '/chat' || clean.startsWith('/chat/')) {
      if (!menuUnread.chat) return null;
      return {
        kind: 'chat',
        value: menuUnread.chat > 99 ? '99+' : String(menuUnread.chat),
        pulse: true,
        title: 'New chat activity'
      };
    }

    if (clean === '/news' || clean.startsWith('/news/')) {
      if (!menuUnread.news) return null;
      return {
        kind: 'news',
        value: menuUnread.news > 99 ? '99+' : String(menuUnread.news),
        title: 'New news items'
      };
    }

    return null;
  };

  const renderMenuUnreadIndicator = (href, { compact = false } = {}) => {
    const meta = getMenuUnreadMeta(href);
    if (!meta) return null;
    const classes = [
      'menu-unread-badge',
      meta.kind,
      compact ? 'dot' : '',
      meta.pulse ? 'pulse' : ''
    ].filter(Boolean).join(' ');
    return (
      <span className={classes} title={meta.title} aria-label={meta.title}>
        {compact ? '' : meta.value}
      </span>
    );
  };

  const toggleMobileGroup = (key) => {
    setOpenMobileGroups((prev) => ({ ...prev, [key]: !prev[key] }));
  };
  const closeMobileNav = () => {
    setMobileNavOpen(false);
    setOpenMobileGroups({});
  };

  const clearMegaCloseTimer = () => {
    if (megaCloseTimerRef.current) {
      window.clearTimeout(megaCloseTimerRef.current);
      megaCloseTimerRef.current = null;
    }
  };

  const handleDesktopMenuNavigate = () => {
    clearMegaCloseTimer();
    setOpenMegaDropdownKey('');
  };

  const openMegaDropdown = (itemKey, sourceEl, panelConfig) => {
    clearMegaCloseTimer();
    if (itemKey && sourceEl?.getBoundingClientRect) {
      const navEl = sourceEl.closest?.('.desktop-nav');
      const navRect = navEl?.getBoundingClientRect?.();
      const triggerRect = sourceEl.getBoundingClientRect();
      const navWidth = navRect?.width || 0;
      const triggerCenterX = navRect ? (triggerRect.left - navRect.left + (triggerRect.width / 2)) : 0;
      const viewportWidth = typeof window !== 'undefined' ? (window.innerWidth || 0) : 0;
      const preferredWidth = Number(panelConfig?.width) || 920;
      const maxAllowedWidth = Math.max(620, (viewportWidth || preferredWidth) - 32);
      const panelWidth = Math.max(620, Math.min(preferredWidth, maxAllowedWidth));
      let arrowX = (panelWidth / 2);
      if (navWidth > 0 && triggerCenterX > 0) {
        arrowX = triggerCenterX + (panelWidth / 2) - (navWidth / 2);
      }
      const clampedArrowX = Math.max(28, Math.min(panelWidth - 28, Math.round(arrowX)));
      setMegaAnchorMap((prev) => (prev[itemKey] === clampedArrowX ? prev : { ...prev, [itemKey]: clampedArrowX }));
    }
    setOpenMegaDropdownKey(itemKey || '');
  };

  const scheduleMegaDropdownClose = (itemKey) => {
    clearMegaCloseTimer();
    megaCloseTimerRef.current = window.setTimeout(() => {
      setOpenMegaDropdownKey((prev) => (itemKey && prev !== itemKey ? prev : ''));
      megaCloseTimerRef.current = null;
    }, MEGA_MENU_CLOSE_DELAY_MS);
  };

  const handleMegaLinkKeyDown = (event, itemKey) => {
    const supportedKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'Escape', 'Tab'];
    if (!supportedKeys.includes(event.key)) return;

    const currentLink = event.currentTarget;
    const megaPanel = currentLink.closest('.nav-menu-mega');
    const megaWrapper = currentLink.closest('.nav-mega');
    if (!megaPanel) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      clearMegaCloseTimer();
      setOpenMegaDropdownKey('');
      if (megaWrapper && typeof megaWrapper.focus === 'function') {
        megaWrapper.focus();
        window.setTimeout(() => {
          if (document.activeElement === megaWrapper) megaWrapper.blur();
        }, 0);
      }
      return;
    }

    const allMegaLinks = Array.from(megaPanel.querySelectorAll('.mega-link'));
    const previewActions = Array.from(megaPanel.querySelectorAll('.nav-menu-feature-actions a'));
    if (event.key === 'Tab' && !event.shiftKey && allMegaLinks.length && previewActions.length) {
      const lastLink = allMegaLinks[allMegaLinks.length - 1];
      if (lastLink === currentLink) {
        event.preventDefault();
        event.stopPropagation();
        previewActions[0].focus();
        openMegaDropdown(itemKey);
      }
      return;
    }

    const colIndex = Number(currentLink.dataset.megaCol || 0);
    const rowIndex = Number(currentLink.dataset.megaRow || 0);
    const columnLinks = Array.from(megaPanel.querySelectorAll(`.mega-link[data-mega-col="${colIndex}"]`));
    const columnCount = megaPanel.querySelectorAll('.mega-column').length || 0;
    const direction = (typeof window !== 'undefined' && window.getComputedStyle)
      ? window.getComputedStyle(megaPanel).direction
      : 'rtl';

    const focusInColumn = (targetCol, preferredRow) => {
      const links = Array.from(megaPanel.querySelectorAll(`.mega-link[data-mega-col="${targetCol}"]`));
      if (!links.length) return false;
      const normalizedRow = Math.max(0, Math.min(preferredRow, links.length - 1));
      const next = links[normalizedRow] || links[links.length - 1];
      if (next && typeof next.focus === 'function') {
        next.focus();
        return true;
      }
      return false;
    };

    let handled = false;

    if (event.key === 'ArrowDown' && columnLinks.length) {
      handled = focusInColumn(colIndex, (rowIndex + 1) % columnLinks.length);
    } else if (event.key === 'ArrowUp' && columnLinks.length) {
      handled = focusInColumn(colIndex, rowIndex <= 0 ? columnLinks.length - 1 : rowIndex - 1);
    } else if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && columnCount > 1) {
      const visualDelta = event.key === 'ArrowRight'
        ? (direction === 'rtl' ? -1 : 1)
        : (direction === 'rtl' ? 1 : -1);
      const targetCol = colIndex + visualDelta;
      if (targetCol >= 0 && targetCol < columnCount) {
        handled = focusInColumn(targetCol, rowIndex);
      } else {
        const towardPreview = direction === 'rtl' ? event.key === 'ArrowLeft' : event.key === 'ArrowRight';
        if (towardPreview && previewActions.length) {
          previewActions[0].focus();
          handled = true;
        }
      }
    } else if (event.key === 'Home') {
      handled = focusInColumn(colIndex, 0);
    } else if (event.key === 'End' && columnLinks.length) {
      handled = focusInColumn(colIndex, columnLinks.length - 1);
    }

    if (!handled) return;

    event.preventDefault();
    event.stopPropagation();
    openMegaDropdown(itemKey);
  };

  const handleMegaPreviewActionKeyDown = (event, itemKey) => {
    const supportedKeys = ['ArrowLeft', 'ArrowRight', 'Home', 'End', 'ArrowUp', 'Escape', 'Tab'];
    if (!supportedKeys.includes(event.key)) return;

    const currentAction = event.currentTarget;
    const megaPanel = currentAction.closest('.nav-menu-mega');
    const megaWrapper = currentAction.closest('.nav-mega');
    if (!megaPanel) return;
    const findPreviewTargetLink = () => {
      const previewTargetKey = megaPanel.dataset.previewKey || '';
      if (!previewTargetKey) return null;
      const links = Array.from(megaPanel.querySelectorAll('.mega-link'));
      return links.find((link) => (link.dataset.megaKey || '') === previewTargetKey) || null;
    };

    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      clearMegaCloseTimer();
      setOpenMegaDropdownKey('');
      megaWrapper?.blur?.();
      return;
    }

    const actions = Array.from(megaPanel.querySelectorAll('.nav-menu-feature-actions a'));
    const index = actions.indexOf(currentAction);
    const direction = (typeof window !== 'undefined' && window.getComputedStyle)
      ? window.getComputedStyle(megaPanel).direction
      : 'rtl';

    const focusActionAt = (idx) => {
      const next = actions[idx];
      if (!next) return false;
      next.focus();
      openMegaDropdown(itemKey);
      return true;
    };

    if (event.key === 'Tab' && event.shiftKey && index === 0) {
      const targetLink = findPreviewTargetLink();
      if (targetLink) {
        event.preventDefault();
        event.stopPropagation();
        targetLink.focus();
        openMegaDropdown(itemKey);
      }
      return;
    }

    let handled = false;
    if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && actions.length > 1) {
      const visualDelta = event.key === 'ArrowRight'
        ? (direction === 'rtl' ? -1 : 1)
        : (direction === 'rtl' ? 1 : -1);
      handled = focusActionAt((index + visualDelta + actions.length) % actions.length);
    } else if (event.key === 'Home') {
      handled = focusActionAt(0);
    } else if (event.key === 'End') {
      handled = focusActionAt(actions.length - 1);
    } else if (event.key === 'ArrowUp') {
      const targetLink = findPreviewTargetLink();
      if (targetLink) {
        targetLink.focus();
        handled = true;
      }
    }

    if (!handled) return;
    event.preventDefault();
    event.stopPropagation();
  };

  const searchEntries = useMemo(() => {
    const entries = [];
    const seen = new Set();

    const add = (entry) => {
      if (!entry?.title || !entry?.href || entry.href === '#') return;
      const key = `${entry.href}__${entry.title}`;
      if (seen.has(key)) return;
      seen.add(key);
      entries.push(entry);
    };

    visibleMenuItems.forEach((item) => {
      if (item.href && item.href !== '#') {
        add({
          title: String(item.title || ''),
          href: item.href,
          icon: item.icon || 'fa-link',
          group: String(item.title || 'منو')
        });
      }

      (item.children || [])
        .filter((child) => child && child.enabled !== false)
        .forEach((child) => {
          add({
            title: String(child.title || ''),
            href: child.href || '#',
            icon: child.icon || item.icon || 'fa-link',
            group: String(item.title || 'منو')
          });
        });
    });

    QUICK_LINKS.forEach(add);

    if (authed) {
      add({ title: 'داشبورد', href: '/dashboard', icon: 'fa-table-cells-large', group: 'حساب کاربری' });
      add({ title: 'پروفایل', href: '/profile', icon: 'fa-user', group: 'حساب کاربری' });
      if (role === 'admin') {
        add({ title: 'تنظیمات سایت', href: '/admin-settings', icon: 'fa-gear', group: 'پنل ادمین' });
        add({ title: 'مدیریت کاربران', href: '/admin-users', icon: 'fa-users', group: 'پنل ادمین' });
      }
    }

    return entries;
  }, [visibleMenuItems, authed, role]);

  const rawSearch = String(searchQuery || '').trim();
  const normalizedSearch = rawSearch.toLowerCase();
  const localQuickSearchResults = useMemo(() => {
    if (!normalizedSearch) return [];
    return searchEntries
      .filter((item) => {
        const text = `${item.title || ''} ${item.group || ''} ${pathOnly(item.href || '')}`.toLowerCase();
        return text.includes(normalizedSearch);
      })
      .slice(0, 6);
  }, [normalizedSearch, searchEntries]);

  useEffect(() => {
    if (!searchOpen || normalizedSearch.length < 2) {
      setRemoteSearch((prev) => {
        if (!prev.loading && !prev.error && !prev.courses.length && !prev.news.length && !prev.gallery.length) return prev;
        return { ...prev, loading: false, error: '', courses: [], news: [], gallery: [] };
      });
      return undefined;
    }

    const cachedQuery = remoteQueryCacheRef.current.get(normalizedSearch);
    if (cachedQuery && (Date.now() - cachedQuery.at) < REMOTE_SEARCH_CACHE_TTL_MS) {
      setRemoteSearch({
        loading: false,
        error: '',
        courses: cachedQuery.data.courses || [],
        news: cachedQuery.data.news || [],
        gallery: cachedQuery.data.gallery || []
      });
      return undefined;
    }

    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setRemoteSearch((prev) => ({ ...prev, loading: true, error: '' }));

      try {
        const coursesPromise = fetch(
          `${API_BASE}/api/education/public-school-classes?q=${encodeURIComponent(normalizedSearch)}&limit=5`,
          { signal: controller.signal }
        ).then(async (res) => {
          const data = await res.json().catch(() => ({}));
          return Array.isArray(data?.items) ? data.items : [];
        });

        const newsPromise = newsPoolLoadedRef.current
          ? Promise.resolve(newsSearchPoolRef.current)
          : fetch(`${API_BASE}/api/news`, { signal: controller.signal }).then(async (res) => {
              const data = await res.json().catch(() => ({}));
              const items = Array.isArray(data?.items) ? data.items : [];
              newsSearchPoolRef.current = items;
              newsPoolLoadedRef.current = true;
              return items;
            });

        const galleryPromise = galleryPoolLoadedRef.current
          ? Promise.resolve(gallerySearchPoolRef.current)
          : fetch(`${API_BASE}/api/gallery`, { signal: controller.signal }).then(async (res) => {
              const data = await res.json().catch(() => ({}));
              const items = Array.isArray(data?.items) ? data.items : [];
              gallerySearchPoolRef.current = items;
              galleryPoolLoadedRef.current = true;
              return items;
            });

        const [courses, newsPool, galleryPool] = await Promise.all([coursesPromise, newsPromise, galleryPromise]);
        if (controller.signal.aborted) return;

        const news = (Array.isArray(newsPool) ? newsPool : [])
          .filter((item) => {
            const text = `${item?.title || ''} ${item?.summary || ''} ${item?.content || ''}`.toLowerCase();
            return text.includes(normalizedSearch);
          })
          .slice(0, 4);

        const gallery = (Array.isArray(galleryPool) ? galleryPool : [])
          .filter((item) => {
            const text = `${item?.title || ''} ${item?.tag || ''} ${item?.description || ''}`.toLowerCase();
            return text.includes(normalizedSearch);
          })
          .slice(0, 4);

        const nextData = {
          courses,
          news,
          gallery
        };

        setRemoteSearch({
          loading: false,
          error: '',
          ...nextData
        });

        remoteQueryCacheRef.current.set(normalizedSearch, {
          at: Date.now(),
          data: nextData
        });
        if (remoteQueryCacheRef.current.size > 40) {
          const oldestKey = remoteQueryCacheRef.current.keys().next().value;
          if (oldestKey) remoteQueryCacheRef.current.delete(oldestKey);
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        setRemoteSearch((prev) => ({
          ...prev,
          loading: false,
          error: '\u062E\u0637\u0627 \u062F\u0631 \u062C\u0633\u062A\u062C\u0648',
          courses: [],
          news: [],
          gallery: []
        }));
      }
    }, 220);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [normalizedSearch, searchOpen]);

  const getCourseTargetId = (item = {}) => String(
    item?.classId
    || item?.schoolClass?.id
    || item?.schoolClass?._id
    || item?.schoolClassRef?._id
    || item?.schoolClassRef
    || item?.courseId
    || item?._id
    || ''
  ).trim();

  const remoteQuickSearchResults = useMemo(() => {
    const items = [];

    (remoteSearch.courses || []).forEach((course) => {
      if (!course?._id || !course?.title) return;
      const tagsText = Array.isArray(course.tags) ? course.tags.filter(Boolean).slice(0, 2).join(' | ') : '';
      const meta = [course.category, tagsText].filter(Boolean).join(' | ');
      items.push({
        title: String(course.title),
        href: `/courses/${getCourseTargetId(course)}`,
        icon: 'fa-graduation-cap',
        group: '\u0635\u0646\u0641 \u0622\u0645\u0648\u0632\u0634\u06CC',
        meta: meta || '\u0645\u062D\u062A\u0648\u0627\u06CC \u0622\u0645\u0648\u0632\u0634\u06CC \u0628\u0631\u0627\u06CC \u0627\u06cc\u0646 \u062d\u0633\u0627\u0628 \u0641\u0639\u0627\u0644 \u0646\u06cc\u0633\u062a'
      });
    });

    (remoteSearch.news || []).forEach((item) => {
      if (!item?._id || !item?.title) return;
      const dateLabel = formatAfghanDate(item.publishedAt, {
        year: 'numeric',
        month: 'numeric',
        day: 'numeric'
      });
      const typeLabel = NEWS_SEARCH_CATEGORY_LABELS[item.category] || NEWS_SEARCH_CATEGORY_LABELS.news;
      items.push({
        title: String(item.title),
        href: `/news/${item._id}`,
        icon: 'fa-newspaper',
        group: '\u0627\u062E\u0628\u0627\u0631 \u0648 \u0627\u0639\u0644\u0627\u0646\u0627\u062A \u0645\u062F\u0631\u0633\u0647 \u062F\u0631 \u06CC\u06A9 \u062C\u0627'
      });
    });

    (remoteSearch.gallery || []).forEach((item) => {
      if (!item?.title) return;
      const meta = [item.tag, item.description].filter(Boolean).join(' | ');
      items.push({
        title: String(item.title),
        href: item?._id ? `/gallery#item-${item._id}` : '/gallery',
        icon: 'fa-images',
        group: '\u06AF\u0627\u0644\u0631\u06CC \u062A\u0635\u0627\u0648\u06CC\u0631',
        meta: meta || '\u062A\u0635\u0648\u06CC\u0631 \u06AF\u0627\u0644\u0631\u06CC \u0645\u062F\u0631\u0646'
      });
    });

    return items;
  }, [remoteSearch.courses, remoteSearch.news, remoteSearch.gallery]);

  const quickSearchResults = useMemo(() => {
    const merged = [];
    const seen = new Set();
    const kindWeight = { course: 36, news: 32, gallery: 28, nav: 20 };

    const scoreEntry = (entry) => {
      const title = String(entry?.title || '').toLowerCase();
      const meta = String(entry?.meta || entry?.group || '').toLowerCase();
      const badge = String(entry?.badge || '').toLowerCase();
      const pathText = pathOnly(entry?.href || '').toLowerCase();
      const tokens = normalizedSearch.split(/\s+/).filter(Boolean);
      let score = kindWeight[entry?.kind || 'nav'] || 0;

      if (!normalizedSearch) return score;

      if (title === normalizedSearch) score += 1200;
      else if (title.startsWith(normalizedSearch)) score += 800;
      else if (title.includes(normalizedSearch)) score += 460;

      if (meta === normalizedSearch) score += 220;
      else if (meta.startsWith(normalizedSearch)) score += 160;
      else if (meta.includes(normalizedSearch)) score += 90;

      if (badge && badge.includes(normalizedSearch)) score += 60;
      if (pathText.includes(normalizedSearch)) score += 45;

      tokens.forEach((token) => {
        if (token.length < 2) return;
        if (title.startsWith(token)) score += 65;
        else if (title.includes(token)) score += 28;

        if (meta.includes(token)) score += 12;
        if (pathText.includes(token)) score += 8;
      });

      score += Math.max(0, 24 - Math.floor(title.length / 4));
      return score;
    };

    const add = (entry) => {
      if (!entry?.title || !entry?.href || entry.href === '#') return;
      const key = `${entry.href}__${entry.title}`;
      if (seen.has(key)) return;
      seen.add(key);
      merged.push(entry);
    };

    remoteQuickSearchResults.forEach(add);
    localQuickSearchResults.forEach(add);

    return merged
      .map((entry, idx) => ({ ...entry, _score: scoreEntry(entry), _order: idx }))
      .sort((a, b) => (b._score - a._score) || (a._order - b._order))
      .slice(0, 10)
      .map(({ _score, _order, ...entry }) => entry);
  }, [remoteQuickSearchResults, localQuickSearchResults, normalizedSearch]);

  const quickSearchSections = useMemo(() => {
    const order = ['course', 'news', 'gallery', 'nav'];
    const grouped = new Map(order.map((key) => [key, []]));

    quickSearchResults.forEach((item, idx) => {
      const key = grouped.has(item.kind) ? item.kind : 'nav';
      grouped.get(key).push({ ...item, _searchIndex: idx });
    });

    return order
      .map((key) => ({
        key,
        ...(QUICK_SEARCH_SECTION_META[key] || QUICK_SEARCH_SECTION_META.nav),
        items: grouped.get(key) || []
      }))
      .filter((section) => section.items.length);
  }, [quickSearchResults]);

  const activeQuickSearchResults = normalizedSearch ? quickSearchResults : recentSearches;

  const displayQuickSearchSections = useMemo(() => {
    if (normalizedSearch) return quickSearchSections;
    if (!recentSearches.length) return [];
    return [{
      key: 'recent',
      label: '\u062C\u0633\u062A\u062C\u0648\u0647\u0627\u06CC \u0627\u062E\u06CC\u0631',
      icon: 'fa-clock-rotate-left',
      clearable: true,
      items: recentSearches.map((item, idx) => ({ ...item, _searchIndex: idx }))
    }];
  }, [normalizedSearch, quickSearchSections, recentSearches]);

  const persistRecentSearches = (items) => {
    try {
      localStorage.setItem(RECENT_SEARCHES_STORAGE_KEY, JSON.stringify(items));
    } catch {
      // ignore storage errors
    }
  };

  const rememberRecentSearch = (entry) => {
    if (!entry?.title || !entry?.href) return;
    const compact = {
      title: String(entry.title),
      href: String(entry.href),
      icon: entry.icon || 'fa-link',
      kind: entry.kind || 'nav',
      group: entry.group || '',
      meta: entry.meta || '',
      badge: entry.badge || '',
      badgeTone: entry.badgeTone || '',
      thumbUrl: entry.thumbUrl || ''
    };
    setRecentSearches((prev) => {
      const next = [compact, ...prev.filter((item) => !(item.href === compact.href && item.title === compact.title))]
        .slice(0, MAX_RECENT_SEARCHES);
      persistRecentSearches(next);
      return next;
    });
  };

  const clearRecentSearches = () => {
    setRecentSearches([]);
    try {
      localStorage.removeItem(RECENT_SEARCHES_STORAGE_KEY);
    } catch {
      // ignore storage errors
    }
  };

  const highlightQuickSearchText = (text) => {
    const value = String(text || '');
    if (!value) return '';
    if (rawSearch.length < 2) return value;

    const matcher = new RegExp(`(${escapeRegExp(rawSearch)})`, 'ig');
    const parts = value.split(matcher);
    if (parts.length === 1) return value;

    return parts.map((part, idx) => (
      part.toLowerCase() === normalizedSearch
        ? <mark key={`${part}-${idx}`} className="quick-search-highlight">{part}</mark>
        : <React.Fragment key={`${part}-${idx}`}>{part}</React.Fragment>
    ));
  };

  useEffect(() => {
    setSearchActiveIndex(-1);
  }, [normalizedSearch, searchOpen]);

  useEffect(() => {
    if (searchActiveIndex < 0) return;
    if (searchActiveIndex >= activeQuickSearchResults.length) {
      setSearchActiveIndex(activeQuickSearchResults.length ? activeQuickSearchResults.length - 1 : -1);
      return;
    }
    const activeEl = searchResultRefs.current[searchActiveIndex];
    if (activeEl?.scrollIntoView) {
      activeEl.scrollIntoView({ block: 'nearest' });
    }
  }, [searchActiveIndex, activeQuickSearchResults]);

  useEffect(() => {
    const handler = () => setAvatarUrl(localStorage.getItem('avatarUrl') || '');
    window.addEventListener('avatar-updated', handler);
    return () => window.removeEventListener('avatar-updated', handler);
  }, []);

  useEffect(() => () => clearMegaCloseTimer(), []);

  useEffect(() => {
    if (mobileNavOpen || searchOpen) setHeaderHidden(false);
  }, [mobileNavOpen, searchOpen]);

  useEffect(() => {
    if (hideMainNav) {
      setHeaderHidden(false);
      return undefined;
    }

    const onScroll = () => {
      const y = window.scrollY || window.pageYOffset || 0;
      const prevY = lastScrollYRef.current;
      const delta = y - prevY;
      lastScrollYRef.current = y;

      if (y < 32) {
        setHeaderHidden(false);
        return;
      }
      if (mobileNavOpen || searchOpen) {
        setHeaderHidden(false);
        return;
      }
      if (delta > 8 && y > 140) {
        setHeaderHidden(true);
        return;
      }
      if (delta < -8) {
        setHeaderHidden(false);
      }
    };

    lastScrollYRef.current = window.scrollY || window.pageYOffset || 0;
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [hideMainNav, mobileNavOpen, searchOpen]);

  useEffect(() => {
    if (path.startsWith('/news')) {
      writeStoredTimestamp(MENU_NEWS_SEEN_AT_STORAGE_KEY, Date.now());
      setMenuUnread((prev) => (prev.news ? { ...prev, news: 0 } : prev));
    }
    if (path === '/chat' || path.startsWith('/chat/')) {
      writeStoredTimestamp(MENU_CHAT_SEEN_AT_STORAGE_KEY, Date.now());
      setMenuUnread((prev) => (prev.chat ? { ...prev, chat: 0 } : prev));
    }
  }, [path]);

  useEffect(() => {
    if (hideMainNav) return undefined;

    let cancelled = false;

    const syncMenuIndicators = async () => {
      let newsCount = 0;
      let chatCount = 0;

      try {
        const newsRes = await fetch(`${API_BASE}/api/news`);
        const newsData = await newsRes.json().catch(() => ({}));
        const newsItems = Array.isArray(newsData?.items) ? newsData.items : [];
        const newsTimes = newsItems
          .map((item) => Date.parse(item?.publishedAt || item?.createdAt || ''))
          .filter((ts) => Number.isFinite(ts))
          .sort((a, b) => b - a);
        const latestNewsTs = newsTimes[0] || 0;
        const seenNewsTs = readStoredTimestamp(MENU_NEWS_SEEN_AT_STORAGE_KEY);

        if (!seenNewsTs && latestNewsTs) {
          writeStoredTimestamp(MENU_NEWS_SEEN_AT_STORAGE_KEY, latestNewsTs);
        } else if (seenNewsTs) {
          newsCount = newsTimes.reduce((acc, ts) => acc + (ts > seenNewsTs ? 1 : 0), 0);
        }
      } catch {
        // ignore menu news indicator errors
      }

      if (authed) {
        try {
          const headers = { ...getAuthHeaders() };
          const [directRes, groupRes] = await Promise.all([
            fetch(`${API_BASE}/api/chats/threads/direct`, { headers }),
            fetch(`${API_BASE}/api/chats/threads/group`, { headers })
          ]);
          const [directData, groupData] = await Promise.all([
            directRes.json().catch(() => ({})),
            groupRes.json().catch(() => ({}))
          ]);

          const threads = [
            ...(Array.isArray(directData?.items) ? directData.items : []),
            ...(Array.isArray(groupData?.items) ? groupData.items : [])
          ];
          const seenChatTs = readStoredTimestamp(MENU_CHAT_SEEN_AT_STORAGE_KEY);
          const threadTimes = threads
            .map((thread) => Date.parse(thread?.updatedAt || ''))
            .filter((ts) => Number.isFinite(ts));
          const latestChatTs = threadTimes.length ? Math.max(...threadTimes) : 0;

          if (!seenChatTs && latestChatTs) {
            writeStoredTimestamp(MENU_CHAT_SEEN_AT_STORAGE_KEY, latestChatTs);
          } else if (seenChatTs) {
            const newerThreads = new Set();
            threads.forEach((thread) => {
              const ts = Date.parse(thread?.updatedAt || '');
              if (!Number.isFinite(ts) || ts <= seenChatTs || !thread?._id) return;
              newerThreads.add(String(thread._id));
            });
            chatCount = newerThreads.size;
          }
        } catch {
          // ignore menu chat indicator errors
        }
      }

      if (cancelled) return;
      setMenuUnread((prev) => {
        if (prev.news === newsCount && prev.chat === chatCount) return prev;
        return { news: Math.max(0, newsCount), chat: Math.max(0, chatCount) };
      });
    };

    syncMenuIndicators();
    const intervalId = window.setInterval(syncMenuIndicators, MENU_ACTIVITY_POLL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [authed, hideMainNav]);

  useEffect(() => {
    setMobileNavOpen(false);
    setSearchOpen(false);
    setSearchQuery('');
    setSearchActiveIndex(-1);
    setHeaderHidden(false);
    clearMegaCloseTimer();
    setOpenMegaDropdownKey('');
    setMegaAnchorMap({});
    setMegaPreviewMap({});
  }, [path]);

  useEffect(() => {
    if (!mobileNavOpen) {
      setOpenMobileGroups({});
    }
  }, [mobileNavOpen]);

  useEffect(() => {
    document.body.style.overflow = mobileNavOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileNavOpen]);

  useEffect(() => {
    if (!mobileNavOpen) return undefined;
    const handleEsc = (event) => {
      if (event.key !== 'Escape') return;
      closeMobileNav();
    };
    document.addEventListener('keydown', handleEsc);
    return () => document.removeEventListener('keydown', handleEsc);
  }, [mobileNavOpen]);

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (!searchBoxRef.current) return;
      if (!searchBoxRef.current.contains(event.target)) {
        setSearchOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, []);

  const loginRoleOptions = [
    {
      href: '/login',
      icon: 'fa-right-to-bracket',
      title: 'ورود عمومی',
      desc: 'ورود یکپارچه برای شاگرد، استاد و مدیر از یک صفحه',
      tone: 'student'
    }
  ];

  const renderLoginMenuPanel = () => (
    <div className="nav-menu nav-menu-right nav-menu-login-card">
      <div className="nav-login-head">
        <strong>{'ورود به سیستم'}</strong>
        <p>{'از همین صفحه عمومی وارد شوید تا سیستم شما را به داشبورد مناسب هدایت کند.'}</p>
      </div>

      <div className="nav-login-role-grid">
        {loginRoleOptions.map((entry) => (
          <Link
            key={entry.href}
            to={entry.href}
            className={`nav-login-role-card ${entry.tone || ''}`}
            {...getPrefetchHandlers(entry.href)}
          >
            <span className="nav-login-role-icon">
              <i className={`fa ${entry.icon}`} aria-hidden="true" />
            </span>
            <span className="nav-login-role-meta">
              <strong>{entry.title}</strong>
              <small>{entry.desc}</small>
            </span>
            <span className="nav-login-role-arrow">
              <i className="fa fa-angle-left" aria-hidden="true" />
            </span>
          </Link>
        ))}
      </div>

      <div className="nav-login-help-links">
        <Link to="/faq" {...getPrefetchHandlers('/faq')}>{'راهنمای ورود'}</Link>
        <Link to="/contact" {...getPrefetchHandlers('/contact')}>{'پشتیبانی'}</Link>
      </div>
    </div>
  );

  const profileMenu = authed ? (
    <div className="nav-dropdown nav-profile" tabIndex="0">
      <span className="nav-link nav-profile-trigger">
        {userAvatarSrc ? (
          <img className="nav-avatar-img" src={userAvatarSrc} alt="avatar" loading="lazy" decoding="async" />
        ) : (
          <span className="nav-avatar">{userName.charAt(0)}</span>
        )}
        <span className="nav-name">{userName}</span>
        <i className="fa fa-angle-down" aria-hidden="true" />
      </span>
      <div className="nav-menu nav-menu-right nav-menu-profile-card">
        <div className="nav-menu-profile-head">
          {userAvatarSrc ? (
            <img className="nav-avatar-img" src={userAvatarSrc} alt="avatar" loading="lazy" decoding="async" />
          ) : (
            <span className="nav-avatar">{userName.charAt(0)}</span>
          )}
          <div className="nav-menu-profile-meta">
            <strong>{userName}</strong>
            <span>{roleLabel}</span>
            {!!lastLoginLabel && <small>{`آخرین ورود: ${lastLoginLabel}`}</small>}
          </div>
        </div>

        <div className="nav-menu-divider" />

        <div className="nav-menu-group">
          <div className="nav-menu-group-label">{'حساب کاربری'}</div>
          <Link to="/dashboard" {...getPrefetchHandlers('/dashboard')}>{'داشبورد'}</Link>
          <Link to="/profile" {...getPrefetchHandlers('/profile')}>{'پروفایل'}</Link>
        </div>

        <div className="nav-menu-group">
          <div className="nav-menu-group-label">{'تنظیمات'}</div>
          {role === 'admin' && <Link to="/admin-settings" {...getPrefetchHandlers('/admin-settings')}>{'مدیریت منوها'}</Link>}
          <button
            className="nav-menu-btn"
            onClick={() => {
              window.location.href = '/profile#password';
              window.dispatchEvent(new Event('hashchange'));
            }}
          >
            {'تغییر رمز عبور'}
          </button>
        </div>

        <div className="nav-menu-group">
          <div className="nav-menu-group-label">{'اقدام'}</div>
          <button className="nav-menu-btn danger" onClick={logout}>{'خروج از سیستم'}</button>
        </div>
      </div>
    </div>
  ) : null;

  const loginDropdown = (
    <div className="nav-dropdown nav-login-menu" tabIndex="0">
      <button type="button" className="nav-action-btn ghost nav-action-toggle">
        <i className="fa fa-right-to-bracket" aria-hidden="true" />
        <span>{'ورود'}</span>
        <i className="fa fa-angle-down" aria-hidden="true" />
      </button>
      {renderLoginMenuPanel()}
    </div>
  );

  const desktopMenuItem = (item, idx) => {
    const itemKey = `${item.title}-${idx}`;
    const children = (item.children || []).filter((child) => child && child.enabled !== false);
    const loginLike = isLoginMenuItem(item);

    if (!authed && loginLike) {
      return (
        <div key={itemKey} className="nav-dropdown" tabIndex="0">
          <span className="nav-link">
            {item.icon && <i className={`fa ${item.icon}`} aria-hidden="true" />}
            <span className="nav-link-text">{item.title || 'ورود'}</span>
            {renderMenuUnreadIndicator(item.href)}
            <i className="fa fa-angle-down" aria-hidden="true" />
          </span>
          {renderLoginMenuPanel()}
        </div>
      );
    }

    if (children.length) {
      const menuBlueprint = resolveMenuBlueprint(item, children, menuBlueprintLibrary);
      const megaChildren = children.map((child, cidx) => ({
        ...child,
        _key: `${child.title}-${cidx}`,
        ...getMegaChildUiMeta(child, item.title, menuBlueprint.kind)
      }));

      const sectionBuckets = megaChildren.reduce((acc, child) => {
        const normalizedSection = String(child.section || '').trim();
        const key = normalizedSection || 'بیشتر';
        if (!acc[key]) acc[key] = [];
        acc[key].push(child);
        return acc;
      }, {});

      const sectionOrder = (menuBlueprint.sectionOrder && menuBlueprint.sectionOrder.length)
        ? menuBlueprint.sectionOrder
        : ['آموزش', 'خدمات', 'محتوا', 'راهنما', 'بیشتر'];
      const orderedSections = sectionOrder
        .filter((label) => Array.isArray(sectionBuckets[label]) && sectionBuckets[label].length)
        .map((label) => ({ label, items: sectionBuckets[label] }));
      const remainingSections = Object.keys(sectionBuckets)
        .filter((label) => !sectionOrder.includes(label))
        .filter((label) => Array.isArray(sectionBuckets[label]) && sectionBuckets[label].length)
        .map((label) => ({ label, items: sectionBuckets[label] }));
      const megaSections = [...orderedSections, ...remainingSections];
      const megaItemCount = megaChildren.length;
      const megaSectionCount = megaSections.length;
      const megaPanelConfig = (() => {
        if (megaItemCount <= 6 && megaSectionCount <= 2) {
          return { size: 'compact', width: 840, minWidth: 700, previewWidth: 210 };
        }
        if (megaItemCount <= 12 && megaSectionCount <= 3) {
          return { size: 'medium', width: 900, minWidth: 760, previewWidth: 220 };
        }
        return { size: 'wide', width: 960, minWidth: 820, previewWidth: 225 };
      })();

      const previewKey = megaPreviewMap[itemKey];
      const previewItem = megaChildren.find((child) => (child.href || child._key) === previewKey)
        || megaChildren.find((child) => isPathActive(child.href))
        || megaChildren[0];
      const previewTargetKey = previewItem ? (previewItem.href || previewItem._key || '') : '';
      const previewFallbackHref = previewItem?.href || children[0]?.href || item.href || '/';
      const previewPrimaryAction = {
        title: previewItem?.title ? `ورود به ${previewItem.title}` : 'مشاهده بخش',
        href: previewFallbackHref
      };
      const previewActions = [
        previewPrimaryAction,
        ...(menuBlueprint.actions || []).filter((action) => pathOnly(action?.href || '') !== pathOnly(previewPrimaryAction.href))
      ].slice(0, 3);
      const previewSummary = previewItem?.description || menuBlueprint.summary || `دسترسی سریع به زیرمنوهای ${item.title}`;
      const previewPoints = (menuBlueprint.points || []).slice(0, 3);

      return (
        <div
          key={itemKey}
          className={`nav-dropdown nav-mega ${hasActiveChild(item) ? 'active' : ''} ${openMegaDropdownKey === itemKey ? 'open' : ''}`.trim()}
          tabIndex="0"
          onMouseEnter={(e) => openMegaDropdown(itemKey, e.currentTarget, megaPanelConfig)}
          onMouseLeave={() => scheduleMegaDropdownClose(itemKey)}
          onFocus={(e) => openMegaDropdown(itemKey, e.currentTarget, megaPanelConfig)}
          onBlur={(e) => {
            const nextTarget = e.relatedTarget;
            if (nextTarget && e.currentTarget.contains(nextTarget)) return;
            scheduleMegaDropdownClose(itemKey);
          }}
          onKeyDown={(e) => {
            if (e.key !== 'Escape') return;
            clearMegaCloseTimer();
            setOpenMegaDropdownKey('');
            e.currentTarget.blur();
          }}
        >
          <span className="nav-link">
            {item.icon && <i className={`fa ${item.icon}`} aria-hidden="true" />}
            <span className="nav-link-text">{item.title}</span>
            {renderMenuUnreadIndicator(item.href)}
            <i className="fa fa-angle-down" aria-hidden="true" />
          </span>
          <div
            className={`nav-menu nav-menu-mega mega-size-${megaPanelConfig.size}`}
            data-preview-key={previewTargetKey}
            style={{
              '--mega-panel-width': `${megaPanelConfig.width}px`,
              '--mega-panel-min-width': `${megaPanelConfig.minWidth}px`,
              '--mega-preview-width': `${megaPanelConfig.previewWidth}px`,
              ...(megaAnchorMap[itemKey] ? { '--mega-anchor-x': `${megaAnchorMap[itemKey]}px` } : {})
            }}
          >
            <div className="nav-menu-grid nav-menu-grid-sections">
              {megaSections.map((section, sectionIdx) => (
                <div
                  key={section.label}
                  className={[
                    'mega-column',
                    section.items.some((child) => isPathActive(child.href)) ? 'has-active' : '',
                    section.items.some((child) => (child.href || child._key) === previewTargetKey) ? 'current' : ''
                  ].filter(Boolean).join(' ')}
                >
                  <div className="mega-column-title">
                    <span>{section.label}</span>
                    <small>{section.items.length}</small>
                  </div>
                  <div className="mega-column-links">
                    {section.items.map((child, rowIdx) => (
                      <NavLink
                        key={child._key}
                        to={child.href || '#'}
                        className={({ isActive }) => `mega-link ${isActive || isPathActive(child.href) ? 'active' : ''}`}
                        data-mega-col={sectionIdx}
                        data-mega-row={rowIdx}
                        data-mega-key={child.href || child._key}
                        onMouseEnter={() => {
                          setMegaPreviewMap((prev) => ({ ...prev, [itemKey]: child.href || child._key }));
                          prefetchRouteByHref(child.href);
                        }}
                        onFocus={() => {
                          setMegaPreviewMap((prev) => ({ ...prev, [itemKey]: child.href || child._key }));
                          prefetchRouteByHref(child.href);
                        }}
                        onClick={handleDesktopMenuNavigate}
                        onKeyDown={(e) => handleMegaLinkKeyDown(e, itemKey)}
                      >
                        <span className="mega-link-icon">
                          {child.icon ? <i className={`fa ${child.icon}`} aria-hidden="true" /> : <i className="fa fa-angle-left" aria-hidden="true" />}
                        </span>
                        <span className="mega-link-body">
                          <span className="mega-link-title-row">
                            <strong>{child.title}</strong>
                            {renderMenuUnreadIndicator(child.href, { compact: true })}
                            {!!child.badge && <span className={`mega-link-badge ${child.badgeTone || 'info'}`}>{child.badge}</span>}
                          </span>
                          <span className="mega-link-desc">{child.description}</span>
                          <small>{pathOnly(child.href || '')}</small>
                        </span>
                      </NavLink>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div
              className={`nav-menu-feature nav-menu-preview tone-${menuBlueprint.tone || 'default'}`}
              data-watermark={menuBlueprint.watermark || 'IMAN'}
            >
              <span className={`nav-menu-feature-badge ${previewItem?.badgeTone || 'info'}`}>
                {previewItem?.badge || menuBlueprint.label || 'میانبر سریع'}
              </span>

              <div className="nav-menu-preview-head">
                <span className="nav-menu-preview-icon">
                  {previewItem?.icon ? <i className={`fa ${previewItem.icon}`} aria-hidden="true" /> : <i className="fa fa-compass" aria-hidden="true" />}
                </span>
                <div>
                  <strong>{previewItem?.section || 'بخش'}</strong>
                  <small>{pathOnly(previewItem?.href || item.href || '/')}</small>
                </div>
              </div>

              <h4>{previewItem?.title || item.title}</h4>
              <p>{previewSummary}</p>

              <div className="nav-menu-preview-meta">
                <span>{previewItem?.section || menuBlueprint.label || 'منو'}</span>
                {!!previewItem?.badge && <span>{previewItem.badge}</span>}
              </div>

              {!!previewPoints.length && (
                <div className="nav-menu-preview-points">
                  {previewPoints.map((point, idx) => (
                    <span key={`${point}-${idx}`}>
                      <i className="fa fa-circle-check" aria-hidden="true" />
                      <em>{point}</em>
                    </span>
                  ))}
                </div>
              )}

              <div className="nav-menu-feature-actions">
                {previewActions.map((action, actionIdx) => (
                  <Link
                    key={`${action.title}-${action.href}-${actionIdx}`}
                    to={action.href || '/'}
                    onMouseEnter={() => prefetchRouteByHref(action.href)}
                    onFocus={() => prefetchRouteByHref(action.href)}
                    onClick={handleDesktopMenuNavigate}
                    onKeyDown={(e) => handleMegaPreviewActionKeyDown(e, itemKey)}
                  >
                    {action.title}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      );
    }

    return (
      <NavLink
        key={itemKey}
        to={item.href || '#'}
        className={({ isActive }) => `nav-link ${isActive || isPathActive(item.href) ? 'active' : ''}`}
        onClick={handleDesktopMenuNavigate}
        {...getPrefetchHandlers(item.href)}
      >
        {item.icon && <i className={`fa ${item.icon}`} aria-hidden="true" />}
        <span className="nav-link-text">{item.title}</span>
        {renderMenuUnreadIndicator(item.href)}
      </NavLink>
    );
  };

  const mobileMenuItem = (item, idx) => {
    const itemKey = `${item.title}-${idx}`;
    const children = (item.children || []).filter((child) => child && child.enabled !== false);
    const loginLike = isLoginMenuItem(item);

    if (!authed && loginLike) {
      const key = `login-${idx}`;
      const open = !!openMobileGroups[key];
      return (
        <div key={itemKey} className="mobile-menu-item">
          <button type="button" className={`mobile-menu-toggle ${open ? 'open' : ''}`} onClick={() => toggleMobileGroup(key)}>
            <span>{item.icon && <i className={`fa ${item.icon}`} aria-hidden="true" />} {item.title || 'ورود'} {renderMenuUnreadIndicator(item.href, { compact: true })}</span>
            <i className="fa fa-angle-down" aria-hidden="true" />
          </button>
          <div className={`mobile-submenu ${open ? 'open' : ''}`}>
            <Link to="/login" {...getPrefetchHandlers('/login')}>ورود عمومی</Link>
          </div>
        </div>
      );
    }

    if (children.length) {
      const open = !!openMobileGroups[itemKey];
      const menuBlueprint = resolveMenuBlueprint(item, children, menuBlueprintLibrary);
      return (
        <div key={itemKey} className="mobile-menu-item">
          <button
            type="button"
            className={`mobile-menu-toggle ${open ? 'open' : ''} ${hasActiveChild(item) ? 'active' : ''}`}
            onClick={() => toggleMobileGroup(itemKey)}
          >
            <span>{item.icon && <i className={`fa ${item.icon}`} aria-hidden="true" />} {item.title} {renderMenuUnreadIndicator(item.href, { compact: true })}</span>
            <i className="fa fa-angle-down" aria-hidden="true" />
          </button>
          <div className={`mobile-submenu ${open ? 'open' : ''}`}>
            {!!menuBlueprint.summary && (
              <div className="mobile-submenu-hint">
                <i className="fa fa-circle-info" aria-hidden="true" />
                <span>{menuBlueprint.summary}</span>
              </div>
            )}
            {children.map((child, cidx) => (
              <NavLink
                key={`${child.title}-${cidx}`}
                to={child.href || '#'}
                className={({ isActive }) => (isActive || isPathActive(child.href) ? 'active' : '')}
                {...getPrefetchHandlers(child.href)}
              >
                {child.icon && <i className={`fa ${child.icon}`} aria-hidden="true" />} {child.title} {renderMenuUnreadIndicator(child.href)}
              </NavLink>
            ))}
          </div>
        </div>
      );
    }

    return (
      <NavLink
        key={itemKey}
        to={item.href || '#'}
        className={({ isActive }) => `mobile-menu-link ${isActive || isPathActive(item.href) ? 'active' : ''}`}
        {...getPrefetchHandlers(item.href)}
      >
        {item.icon && <i className={`fa ${item.icon}`} aria-hidden="true" />} {item.title} {renderMenuUnreadIndicator(item.href)}
      </NavLink>
    );
  };

  const showMobileRegisterShortcut = !authed && !hasRegisterMenu;
  const showMobileLoginShortcut = !authed && !hasLoginMenu;
  const showMobileAccountShortcuts = authed;
  const showMobileDrawerCta = showMobileRegisterShortcut || showMobileLoginShortcut || showMobileAccountShortcuts;
  const adminRoute = (permission, element, deniedMessage) => (
    <PermissionAccessGuard roles={['admin']} permission={permission} deniedMessage={deniedMessage}>
      {element}
    </PermissionAccessGuard>
  );

  const contentRoute = (element, deniedMessage) => (
    <PermissionAccessGuard
      roles={['admin', 'instructor']}
      permission="manage_content"
      deniedMessage={deniedMessage || '\u062f\u0633\u062a\u0631\u0633\u06cc \u0645\u062f\u06cc\u0631\u06cc\u062a \u06a9\u0627\u0631\u062e\u0627\u0646\u06af\u06cc \u0628\u0631\u0627\u06cc \u0627\u06cc\u0646 \u062d\u0633\u0627\u0628 \u0641\u0639\u0627\u0644 \u0646\u06cc\u0633\u062a.'}
    >
      {element}
    </PermissionAccessGuard>
  );

  return (
    <div className="App">
      {!hideMainNav && (
      <header className={`site-header ${headerHidden ? 'is-hidden' : ''}`}>
        <div className="topbar">
          <div className="topbar-lang">
            <button className="lang-btn active">{settings?.languages?.[0] || 'فارسی'}</button>
            <button className="lang-btn">{settings?.languages?.[1] || 'English'}</button>
          </div>

          <div className="topbar-search" ref={searchBoxRef}>
            <input
              type="text"
              value={searchQuery}
              placeholder={settings?.topSearchPlaceholder || 'جستجو در صنف‌ها، مضامین و دوره‌ها...'}
              onFocus={() => setSearchOpen(true)}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setSearchOpen(true);
              }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setSearchOpen(false);
                  setSearchActiveIndex(-1);
                  return;
                }
                if (e.key === 'ArrowDown') {
                  if (!activeQuickSearchResults.length) return;
                  e.preventDefault();
                  setSearchOpen(true);
                  setSearchActiveIndex((prev) => (prev + 1) % activeQuickSearchResults.length);
                  return;
                }
                if (e.key === 'ArrowUp') {
                  if (!activeQuickSearchResults.length) return;
                  e.preventDefault();
                  setSearchOpen(true);
                  setSearchActiveIndex((prev) => (prev <= 0 ? activeQuickSearchResults.length - 1 : prev - 1));
                  return;
                }
                const targetItem = activeQuickSearchResults[searchActiveIndex] || activeQuickSearchResults[0];
                if (e.key === 'Enter' && targetItem?.href) {
                  e.preventDefault();
                  rememberRecentSearch(targetItem);
                  navigate(targetItem.href);
                  setSearchOpen(false);
                  setSearchQuery('');
                  setSearchActiveIndex(-1);
                }
              }}
            />

            {searchOpen && (
              <div className="topbar-search-panel">
                {!!displayQuickSearchSections.length && displayQuickSearchSections.map((section) => (
                  <div key={section.key} className="quick-search-section">
                    <div className={`quick-search-section-title ${section.clearable ? 'with-action' : ''}`}>
                      <i className={`fa ${section.icon || 'fa-link'}`} aria-hidden="true" />
                      <span>{section.label}</span>
                      {section.clearable && !!recentSearches.length && (
                        <button
                          type="button"
                          className="quick-search-clear-btn"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            clearRecentSearches();
                            setSearchActiveIndex(-1);
                          }}
                        >
                          \u067E\u0627\u06A9\u200C\u06A9\u0631\u062F\u0646
                        </button>
                      )}
                    </div>
                    <div className="quick-search-section-list">
                      {section.items.map((item) => {
                        const idx = item._searchIndex;
                        return (
                          <Link
                            key={`${item.href}-${idx}`}
                            to={item.href}
                            ref={(el) => {
                              searchResultRefs.current[idx] = el;
                            }}
                            className={`quick-search-item ${item.thumbUrl ? 'has-thumb' : ''} ${searchActiveIndex === idx ? 'active' : ''}`}
                            data-kind={item.kind || 'nav'}
                            onMouseEnter={() => {
                              setSearchActiveIndex(idx);
                              prefetchRouteByHref(item.href);
                            }}
                            onFocus={() => {
                              setSearchActiveIndex(idx);
                              prefetchRouteByHref(item.href);
                            }}
                            onClick={() => {
                              rememberRecentSearch(item);
                              setSearchOpen(false);
                              setSearchQuery('');
                              setSearchActiveIndex(-1);
                            }}
                          >
                            {item.thumbUrl ? (
                              <span className="quick-search-thumb" aria-hidden="true">
                                <img src={item.thumbUrl} alt="" loading="lazy" decoding="async" />
                              </span>
                            ) : (
                              <span className="quick-search-icon">
                                <i className={`fa ${item.icon || 'fa-link'}`} aria-hidden="true" />
                              </span>
                            )}
                            <span className="quick-search-body">
                              <span className="quick-search-title-row">
                                <strong>{highlightQuickSearchText(item.title)}</strong>
                                {!!item.badge && <span className={`quick-search-badge ${item.badgeTone || ''}`}>{item.badge}</span>}
                              </span>
                              <small>{highlightQuickSearchText(item.meta || item.group || pathOnly(item.href))}</small>
                            </span>
                            <span className="quick-search-path">{pathOnly(item.href)}</span>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                ))}

                {normalizedSearch.length >= 2 && remoteSearch.loading && (
                  <div className="quick-search-status loading">
                    <i className="fa fa-spinner fa-spin" aria-hidden="true" />
                    <span>\u062F\u0631 \u062D\u0627\u0644 \u062C\u0633\u062A\u062C\u0648...</span>
                  </div>
                )}

                {!!remoteSearch.error && (
                  <div className="quick-search-status error">
                    <i className="fa fa-triangle-exclamation" aria-hidden="true" />
                    <span>{remoteSearch.error}</span>
                  </div>
                )}

                {!!activeQuickSearchResults.length && (
                  <div className="quick-search-hint">
                    <span>\u2191 \u2193 \u0628\u0631\u0627\u06CC \u0627\u0646\u062A\u062E\u0627\u0628</span>
                    <span>Enter \u0628\u0631\u0627\u06CC \u0628\u0627\u0632\u06A9\u0631\u062F\u0646</span>
                    <span>Esc \u0628\u0631\u0627\u06CC \u0628\u0633\u062A\u0646</span>
                  </div>
                )}

                {!normalizedSearch && !recentSearches.length && (
                  <div className="topbar-search-empty">
                    <i className="fa fa-keyboard" aria-hidden="true" />
                    <span>\u0628\u0631\u0627\u06CC \u0634\u0631\u0648\u0639 \u062C\u0633\u062A\u062C\u0648 \u062A\u0627\u06CC\u067E \u06A9\u0646\u06CC\u062F.</span>
                  </div>
                )}

                {!!normalizedSearch && !quickSearchResults.length && !remoteSearch.loading && (
                  <div className="topbar-search-empty">
                    <i className="fa fa-circle-info" aria-hidden="true" />
                    <span>نتیجه‌ای پیدا نشد.</span>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        <div className="midbar">
          <div className="midbar-logo">
            {settings?.logoUrl ? (
              <img
                className="brand-logo"
                src={headerLogoSrc}
                alt="logo"
                width="52"
                height="52"
                loading="eager"
                decoding="async"
                fetchPriority="high"
              />
            ) : (
              <span className="brand-mark">E</span>
            )}
            <div>
              <strong>{settings?.brandName || 'مدرسه ایمان'}</strong>
              <span>{settings?.brandSubtitle || 'Academy Pro'}</span>
            </div>
          </div>
          <div className="midbar-hours">
            <span>{settings?.hoursLabel || 'ساعات کاری'}</span>
            <strong>{settings?.hoursText || 'شنبه تا پنج‌شنبه 08:00 - 17:00'}</strong>
          </div>
          <div className="midbar-contact">
            <span>{settings?.contactLabel || 'تماس با ما'}</span>
            <strong>{settings?.contactPhone || '0702855557'}</strong>
          </div>
        </div>

        <>
            <div className="main-nav-shell">
              <nav className="main-nav desktop-nav">
                <div className="main-nav-list">
                  {visibleMenuItems.map(desktopMenuItem)}
                </div>

                <div className="main-nav-actions">
                  {!authed && (
                    <>
                      {!hasRegisterMenu && (
                        <Link to="/register" className="nav-action-btn cta" {...getPrefetchHandlers('/register')}>
                          <i className="fa fa-user-plus" aria-hidden="true" />
                          <span>ثبت‌نام آنلاین</span>
                        </Link>
                      )}
                      {!hasLoginMenu && loginDropdown}
                    </>
                  )}
                  {authed && (
                    <Link to="/dashboard" className="nav-action-btn dashboard" {...getPrefetchHandlers('/dashboard')}>
                      <i className="fa fa-table-cells-large" aria-hidden="true" />
                      <span>داشبورد</span>
                    </Link>
                  )}
                  {profileMenu}
                </div>
              </nav>

              <div className="mobile-nav-bar">
                <button
                  type="button"
                  className={`mobile-nav-toggle ${mobileNavOpen ? 'open' : ''}`}
                  aria-label="باز کردن منو"
                  onClick={() => setMobileNavOpen((prev) => !prev)}
                >
                  <span />
                  <span />
                  <span />
                </button>
                <div className="mobile-nav-title">
                  <strong>{settings?.brandName || 'مدرسه ایمان'}</strong>
                  <span>منوی سایت</span>
                </div>
                <div className="mobile-nav-shortcuts">
                  {!authed ? (
                    !hasLoginMenu ? (
                      <Link to="/login" className="mobile-shortcut-btn" {...getPrefetchHandlers('/login')}>ورود</Link>
                    ) : (!hasRegisterMenu ? (
                      <Link to="/register" className="mobile-shortcut-btn" {...getPrefetchHandlers('/register')}>ثبت‌نام</Link>
                    ) : null)
                  ) : (
                    <Link to="/dashboard" className="mobile-shortcut-btn" {...getPrefetchHandlers('/dashboard')}>داشبورد</Link>
                  )}
                </div>
              </div>
            </div>

            {mobileNavOpen && (
              <button
                type="button"
                className="mobile-nav-backdrop"
                aria-label="بستن منو"
                onClick={() => setMobileNavOpen(false)}
              />
            )}

            <aside
              className={`mobile-nav-drawer ${mobileNavOpen ? 'open' : ''}`}
              onClick={(e) => {
                const anchor = e.target?.closest?.('a');
                if (!anchor) return;
                const href = anchor.getAttribute('href') || '';
                if (!href || href === '#') return;
                closeMobileNav();
              }}
            >
              <div className="mobile-drawer-head">
                <div>
                  <strong>{settings?.brandName || 'مدرسه ایمان'}</strong>
                  <span>دسترسی سریع به بخش‌های سایت</span>
                </div>
                <button type="button" className="mobile-drawer-close" onClick={closeMobileNav}>×</button>
              </div>

              <div className="mobile-drawer-body">
                <div className="mobile-drawer-sticky">
                  {showMobileDrawerCta && (
                    <div className="mobile-drawer-cta">
                      {showMobileRegisterShortcut && (
                        <Link to="/register" {...getPrefetchHandlers('/register')}>ثبت‌نام آنلاین</Link>
                      )}
                      {showMobileLoginShortcut && (
                        <Link to="/login" {...getPrefetchHandlers('/login')}>ورود به سیستم</Link>
                      )}
                      {authed && (
                        <>
                          <Link to="/dashboard" {...getPrefetchHandlers('/dashboard')}>داشبورد</Link>
                          <Link to="/profile" {...getPrefetchHandlers('/profile')}>پروفایل من</Link>
                        </>
                      )}
                    </div>
                  )}

                  <div className="mobile-drawer-shortcuts-grid">
                    <Link to="/courses" className="mobile-mini-link" {...getPrefetchHandlers('/courses')}>
                      <i className="fa fa-graduation-cap" aria-hidden="true" />
                      <span>{'صنف‌ها'}</span>
                    </Link>
                    <Link to="/news" className="mobile-mini-link" {...getPrefetchHandlers('/news')}>
                      <i className="fa fa-newspaper" aria-hidden="true" />
                      <span>{'اخبار'}</span>
                      {renderMenuUnreadIndicator('/news', { compact: true })}
                    </Link>
                    <Link to="/gallery" className="mobile-mini-link" {...getPrefetchHandlers('/gallery')}>
                      <i className="fa fa-images" aria-hidden="true" />
                      <span>{'گالری'}</span>
                    </Link>
                    <Link
                      to={authed ? '/dashboard' : '/contact'}
                      className="mobile-mini-link"
                      onMouseEnter={() => prefetchRouteByHref(authed ? '/dashboard' : '/contact')}
                      onFocus={() => prefetchRouteByHref(authed ? '/dashboard' : '/contact')}
                    >
                      <i className={`fa ${authed ? 'fa-table-cells-large' : 'fa-phone'}`} aria-hidden="true" />
                      <span>{authed ? 'داشبورد' : 'تماس'}</span>
                    </Link>
                  </div>
                </div>

                <section className="mobile-drawer-section">
                  <div className="mobile-drawer-section-title">
                    <span>{'منوی اصلی'}</span>
                    <small>{visibleMenuItems.length}</small>
                  </div>
                  <div className="mobile-menu-list">
                    {visibleMenuItems.map(mobileMenuItem)}
                  </div>
                </section>

                {authed && (
                  <section className="mobile-drawer-section">
                    <div className="mobile-drawer-section-title">
                      <span>{'حساب کاربری'}</span>
                      <small>{roleLabel}</small>
                    </div>
                    <div className="mobile-account-box">
                      <div className="mobile-account-head">
                        {userAvatarSrc ? (
                          <img className="nav-avatar-img" src={userAvatarSrc} alt="avatar" loading="lazy" decoding="async" />
                        ) : (
                          <span className="nav-avatar">{userName.charAt(0)}</span>
                        )}
                        <div className="mobile-account-meta">
                          <strong>{userName}</strong>
                          <span>{roleLabel}</span>
                          {!!lastLoginLabel && <small className="mobile-account-last">{`آخرین ورود: ${lastLoginLabel}`}</small>}
                        </div>
                      </div>
                      <div className="mobile-account-links">
                        <Link to="/dashboard" {...getPrefetchHandlers('/dashboard')}>داشبورد</Link>
                        <Link to="/profile" {...getPrefetchHandlers('/profile')}>پروفایل</Link>
                        {role === 'admin' && <Link to="/admin-settings" {...getPrefetchHandlers('/admin-settings')}>مدیریت منوها</Link>}
                        <button type="button" onClick={logout}>خروج</button>
                      </div>
                    </div>
                  </section>
                )}

                <section className="mobile-drawer-section mobile-drawer-help">
                  <div className="mobile-drawer-section-title">
                    <span>{'دسترسی سریع / پشتیبانی'}</span>
                  </div>
                  <div className="mobile-drawer-help-links">
                    <Link to="/faq" {...getPrefetchHandlers('/faq')}>راهنما</Link>
                    <Link to="/contact" {...getPrefetchHandlers('/contact')}>تماس با ما</Link>
                    <Link to="/news" {...getPrefetchHandlers('/news')}>اعلانات {renderMenuUnreadIndicator('/news')}</Link>
                  </div>
                </section>
              </div>
            </aside>
        </>
      </header>
      )}

      <div className={`content ${isDashboardArea ? 'dashboard-content' : 'public-content'} ${isHome ? 'home-content' : ''}`}>
        {authed && isDashboardArea && !useCompactAdminApiHealth && (
          <div className={`api-health-banner ${apiHealth.status}`}>
            <span className="api-health-dot" aria-hidden="true" />
            <strong>{'وضعیت سرور'}</strong>
            <span className="api-health-text">
              {apiHealth.status === 'online' ? 'آنلاین' : apiHealth.status === 'offline' ? 'قطع ارتباط' : 'در حال بررسی'}
            </span>
            {apiHealth.latencyMs != null && <span className="api-health-meta">{`تاخیر: ${apiHealth.latencyMs} ms`}</span>}
            {!!apiHealthCheckedLabel && <span className="api-health-meta">{`آخرین بررسی: ${apiHealthCheckedLabel}`}</span>}
            <button
              type="button"
              className="api-health-refresh"
              onClick={() => runApiHealthCheck()}
              disabled={apiHealthLoading}
            >
              {apiHealthLoading ? 'در حال بررسی...' : 'بازبینی'}
            </button>
          </div>
        )}
        <Suspense fallback={<RouteLoading />}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/courses" element={<CourseList />} />
            <Route path="/courses/:id" element={<CourseDetails />} />
            <Route path="/grades/:grade" element={<GradeDetails />} />
            <Route path="/register" element={<Register />} />
            <Route path="/login" element={<Login />} />
            <Route path="/admin-login" element={<Navigate to="/login" replace />} />
            <Route path="/instructor-login" element={<Navigate to="/login" replace />} />
            <Route path="/afghan-dashboard" element={<AfghanSchoolDashboard />} />
            <Route path="/afghan-map" element={<AfghanSchoolMap />} />
            <Route path="/afghan-schools" element={<AfghanSchoolManagement />} />
            <Route path="/afghan-reports" element={<AfghanReports />} />
            <Route path="/login-modern" element={<Navigate to="/login" replace />} />
            <Route path="/login-demo" element={<Navigate to="/login" replace />} />
            <Route path="/login-showcase" element={<Navigate to="/login" replace />} />
            <Route path="/login-enhanced" element={<Navigate to="/login" replace />} />
            <Route
              path="/add-course"
              element={contentRoute(<AddCourse />, '\u062f\u0633\u062a\u0631\u0633\u06cc \u0633\u0627\u0632\u0646\u062f\u0647 \u0622\u0632\u0645\u0648\u0646 \u0628\u0631\u0627\u06cc \u0627\u06cc\u0646 \u062d\u0633\u0627\u0628 \u0641\u0639\u0627\u0644 \u0646\u06cc\u0633\u062a.')}
            />
            <Route path="/payment" element={authed ? <Payment /> : <Login />} />
            <Route path="/submit-receipt" element={authed ? <SubmitReceipt /> : <Login />} />
            <Route path="/admin" element={isAdmin() ? <AdminPanel /> : <Login />} />
            <Route
              path="/admin-stats"
              element={adminRoute('view_reports', <AdminReports />, 'دسترسی گزارشات برای این حساب فعال نیست.')}
            />
            <Route
              path="/admin-reports"
              element={adminRoute('view_reports', <AdminReports />, 'دسترسی گزارشات برای این حساب فعال نیست.')}
            />
            <Route
              path="/admin-promotions"
              element={adminRoute('manage_users', <AdminPromotions />, 'دسترسی ارتقا صنف برای این حساب فعال نیست.')}
            />
            <Route
              path="/admin-result-tables"
              element={adminRoute('manage_content', <AdminResultTables />, 'دسترسی جدول‌های نتیجه برای این حساب فعال نیست.')}
            />
            <Route
              path="/admin-sheet-templates"
              element={adminRoute('manage_content', <AdminSheetTemplates />, 'دسترسی مدیریت شقه‌ها برای این حساب فعال نیست.')}
            />
            <Route
              path="/instructor"
              element={contentRoute(<InstructorPanel />, '\u062f\u0633\u062a\u0631\u0633\u06cc \u0633\u0627\u0632\u0646\u062f\u0647 \u0622\u0632\u0645\u0648\u0646 \u0628\u0631\u0627\u06cc \u0627\u06cc\u0646 \u062d\u0633\u0627\u0628 \u0641\u0639\u0627\u0644 \u0646\u06cc\u0633\u062a.')}
            />
            <Route
              path="/instructor-inline"
              element={contentRoute(<InstructorPanelInline />, '\u062f\u0633\u062a\u0631\u0633\u06cc \u0633\u0627\u0632\u0646\u062f\u0647 \u0622\u0632\u0645\u0648\u0646 \u0628\u0631\u0627\u06cc \u0627\u06cc\u0646 \u062d\u0633\u0627\u0628 \u0641\u0639\u0627\u0644 \u0646\u06cc\u0633\u062a.')}
            />
            <Route
              path="/admin-notifications"
              element={adminRoute('manage_finance', <AdminNotifications />, 'دسترسی مدیریت اعلان‌های مالی برای این حساب فعال نیست.')}
            />
            <Route
              path="/admin-users"
              element={adminRoute('manage_users', <AdminUsers />, 'دسترسی مدیریت کاربران برای این حساب فعال نیست.')}
            />
            <Route
              path="/admin-news"
              element={adminRoute('manage_content', <AdminNews />, 'دسترسی مدیریت اخبار برای این حساب فعال نیست.')}
            />
            <Route
              path="/admin-gallery"
              element={adminRoute('manage_content', <AdminGallery />, 'دسترسی مدیریت گالری برای این حساب فعال نیست.')}
            />
            <Route
              path="/admin-contact"
              element={adminRoute('manage_content', <AdminContact />, 'دسترسی مدیریت پیام‌ها برای این حساب فعال نیست.')}
            />
            <Route
              path="/admin-enrollments"
              element={adminRoute(['manage_enrollments', 'manage_users'], <AdminEnrollments />, 'دسترسی مدیریت ثبت‌نام‌ها برای این حساب فعال نیست.')}
            />
            <Route
              path="/admin-enrollments/:id"
              element={adminRoute(['manage_enrollments', 'manage_users'], <AdminEnrollmentDetail />, 'دسترسی مدیریت ثبت‌نام‌ها برای این حساب فعال نیست.')}
            />
            <Route
              path="/admin-enrollments/:id/print"
              element={adminRoute(['manage_enrollments', 'manage_users'], <AdminEnrollmentPrint />, 'دسترسی چاپ ثبت‌نام برای این حساب فعال نیست.')}
            />
            <Route
              path="/admin-logs"
              element={adminRoute('view_reports', <AdminLogs />, 'دسترسی لاگ‌ها برای این حساب فعال نیست.')}
            />
            <Route
              path="/admin-finance"
              element={adminRoute('manage_finance', <AdminFinance />, 'دسترسی مدیریت مالی برای این حساب فعال نیست.')}
            />
            <Route
              path="/admin-financial-memberships"
              element={adminRoute('manage_finance', <AdminFinancialMemberships />, 'دسترسی مدیریت عضویت مالی برای این حساب فعال نیست.')}
            />
            <Route
              path="/admin-finance/profile/:studentId"
              element={adminRoute('manage_finance', <AdminFinanceProfile />, 'دسترسی مدیریت مالی برای این حساب فعال نیست.')}
            />
            <Route
              path="/admin-government-finance"
              element={adminRoute('manage_finance', <AdminGovernmentFinance />, 'دسترسی گزارش مالی دولت برای این حساب فعال نیست.')}
            />
            <Route
              path="/admin-exams-dashboard"
              element={adminRoute('manage_content', <AdminExamsDashboard />, 'دسترسی داشبورد امتحانات برای این حساب فعال نیست.')}
            />
            <Route
              path="/quiz-builder"
              element={contentRoute(<QuizBuilder />, '\u062f\u0633\u062a\u0631\u0633\u06cc \u0633\u0627\u0632\u0646\u062f\u0647 \u0622\u0632\u0645\u0648\u0646 \u0628\u0631\u0627\u06cc \u0627\u06cc\u0646 \u062d\u0633\u0627\u0628 \u0641\u0639\u0627\u0644 \u0646\u06cc\u0633\u062a.')}
            />
            <Route
              path="/instructor-dashboard"
              element={(
                <PermissionAccessGuard
                  roles={['admin', 'instructor']}
                  deniedMessage="دسترسی داشبورد استاد برای این حساب فعال نیست."
                >
                  <InstructorDashboard />
                </PermissionAccessGuard>
              )}
            />
            <Route
              path="/student-report"
              element={adminRoute('view_reports', <StudentReport />, 'دسترسی گزارش شاگرد برای این حساب فعال نیست.')}
            />
            <Route
              path="/instructor-report"
              element={adminRoute('view_reports', <AdminInstructorReport />, 'دسترسی گزارش استاد برای این حساب فعال نیست.')}
            />
            <Route
              path="/instructor-add-student"
              element={contentRoute(<InstructorAddStudent />, '\u062f\u0633\u062a\u0631\u0633\u06cc \u0645\u062f\u06cc\u0631\u06cc\u062a \u06a9\u0627\u0631\u062e\u0627\u0646\u06af\u06cc \u0628\u0631\u0627\u06cc \u0627\u06cc\u0646 \u062d\u0633\u0627\u0628 \u0641\u0639\u0627\u0644 \u0646\u06cc\u0633\u062a.')}
            />
            <Route path="/admin-settings" element={<AdminSettingsAccessGuard />} />
            <Route
              path="/grade-manager"
              element={contentRoute(<GradeManager />, '\u062f\u0633\u062a\u0631\u0633\u06cc \u0645\u062f\u06cc\u0631\u06cc\u062a \u062d\u0636\u0648\u0631 \u0648 \u063a\u06CC\u0627\u0628 \u0628\u0631\u0627\u06cc \u0627\u06cc\u0646 \u062d\u0633\u0627\u0628 \u0641\u0639\u0627\u0644 \u0646\u06cc\u0633\u062a.')}
            />
            <Route
              path="/attendance-manager"
              element={contentRoute(<AttendanceManager />, '\u062f\u0633\u062a\u0631\u0633\u06cc \u0645\u062f\u06cc\u0631\u06cc\u062a \u062d\u0636\u0648\u0631 \u0648 \u063a\u06CC\u0627\u0628 \u0628\u0631\u0627\u06cc \u0627\u06cc\u0646 \u062d\u0633\u0627\u0628 \u0641\u0639\u0627\u0644 \u0646\u06cc\u0633\u062a.')}
            />
            <Route
              path="/homework-manager"
              element={contentRoute(<HomeworkManager />, '\u062f\u0633\u062a\u0631\u0633\u06cc \u0645\u062f\u06cc\u0631\u06cc\u062a \u06a9\u0627\u0631\u062e\u0627\u0646\u06af\u06cc \u0628\u0631\u0627\u06cc \u0627\u06cc\u0646 \u062d\u0633\u0627\u0628 \u0641\u0639\u0627\u0644 \u0646\u06cc\u0633\u062a.')}
            />
            <Route
              path="/admin-schedule"
              element={adminRoute('manage_schedule', <Navigate to="/timetable/editor" replace />, 'دسترسی مدیریت تقسیم اوقات برای این حساب فعال نیست.')}
            />
            <Route
              path="/admin-schedule/legacy"
              element={<Navigate to="/timetable/editor" replace />}
            />
            <Route
              path="/admin-education"
              element={adminRoute(['manage_content', 'manage_memberships', 'manage_users'], <AdminEducationCore />, '\u062f\u0633\u062a\u0631\u0633\u06cc \u0645\u062f\u06cc\u0631\u06cc\u062a \u062f\u0627\u062f\u0647\u200c\u0647\u0627\u06cc \u067e\u0627\u06cc\u0647 \u0622\u0645\u0648\u0632\u0634\u06cc \u0628\u0631\u0627\u06cc \u0627\u06cc\u0646 \u062d\u0633\u0627\u0628 \u0641\u0639\u0627\u0644 \u0646\u06cc\u0633\u062a.')}
            />
            <Route path="/timetable" element={adminRoute('manage_schedule', <TimetableHub />, 'دسترسی مرکز تقسیم اوقات برای این حساب فعال نیست.')} />
            <Route path="/timetable/timetable-configurations/index" element={adminRoute('manage_schedule', <TimetableConfiguration />, 'دسترسی تنظیم تقسیم اوقات برای این حساب فعال نیست.')} />
            <Route path="/timetable/shift-management" element={adminRoute('manage_schedule', <ShiftManagement />, 'دسترسی مدیریت نوبت برای این حساب فعال نیست.')} />
            <Route path="/timetable/teacher-timetable-configurations" element={adminRoute('manage_schedule', <TeacherAssignmentManagement />, 'دسترسی تنظیم استادان برای این حساب فعال نیست.')} />
            <Route path="/timetable/teacher-availability" element={adminRoute('manage_schedule', <TeacherAvailabilityManagement />, 'دسترسی حضور استاد برای این حساب فعال نیست.')} />
            <Route path="/timetable/curriculum" element={adminRoute('manage_content', <CurriculumManagement />, 'دسترسی نصاب تعلیمی برای این حساب فعال نیست.')} />
            <Route path="/timetable/generation" element={adminRoute('manage_schedule', <TimableViewer />, 'دسترسی ساخت تقسیم اوقات برای این حساب فعال نیست.')} />
            <Route path="/timetable/viewer" element={adminRoute(['view_schedule', 'manage_schedule'], <TimableViewer />, 'دسترسی مشاهده تقسیم اوقات برای این حساب فعال نیست.')} />
            <Route path="/timetable/editor" element={adminRoute('manage_schedule', <TimetableEditor />, 'دسترسی ویرایش تقسیم اوقات برای این حساب فعال نیست.')} />
            <Route path="/timetable/operations" element={adminRoute('manage_schedule', <TimetableOperations />, 'دسترسی عملیات روزانه تقسیم اوقات برای این حساب فعال نیست.')} />
            <Route
              path="/timetable/my-teacher-view"
              element={authed
                ? (isInstructor() ? <TeacherTimetableView /> : <AccessDenied message="این صفحه فقط برای استاد/ادمین فعال است." />)
                : <Login />}
            />
            <Route
              path="/timetable/student-view"
              element={authed
                ? (isStudent() ? <StudentTimetableView /> : <AccessDenied message="این صفحه فقط برای شاگرد فعال است." />)
                : <Login />}
            />
            <Route path="/timetable/reports" element={adminRoute('manage_schedule', <TimetableReports />, 'دسترسی گزارش تقسیم اوقات برای این حساب فعال نیست.')} />
            <Route path="/timetable/conflicts" element={adminRoute('manage_schedule', <TimetableConflictManager />, 'دسترسی مدیریت تداخل‌های تقسیم اوقات برای این حساب فعال نیست.')} />
            <Route path="/timetable/history" element={adminRoute('manage_schedule', <TimetableChangeLog />, 'دسترسی تاریخچه تقسیم اوقات برای این حساب فعال نیست.')} />
            <Route path="/timetable/education-annual-plan" element={adminRoute('manage_schedule', <TimetableHub />, 'دسترسی پلان تعلیمی سالانه برای این حساب فعال نیست.')} />
            <Route path="/timetable/education-weekly-plan" element={adminRoute('manage_schedule', <TimetableHub />, 'دسترسی پلان تعلیمی هفته‌وار برای این حساب فعال نیست.')} />
            <Route path="/timetable/education-weekly-plan-new" element={adminRoute('manage_schedule', <TimetableHub />, 'دسترسی پلان تعلیمی هفته‌وار برای این حساب فعال نیست.')} />
            <Route path="/profile" element={<Profile />} />
            <Route path="/my-grades" element={authed ? <MyGrades /> : <Login />} />
            <Route path="/my-attendance" element={authed ? <MyAttendance /> : <Login />} />
            <Route path="/my-homework" element={authed ? <MyHomework /> : <Login />} />
            <Route path="/my-finance" element={isStudent() ? <StudentFinance /> : <Login />} />
            <Route path="/parent-dashboard" element={authed ? <ParentDashboard /> : <Login />} />
            <Route path="/chat" element={authed ? <ChatPage /> : <Login />} />
            <Route path="/recordings" element={authed ? <RecordingsPage /> : <Login />} />
            <Route path="/schedule" element={authed ? <SchedulePage /> : <Login />} />
            <Route path="/news" element={<News />} />
            <Route path="/news/:id" element={<NewsDetail />} />
            <Route path="/news/archive" element={<NewsArchive />} />
            <Route path="/news/category/:category" element={<NewsCategory />} />
            <Route path="/gallery" element={<Gallery />} />
            <Route path="/faq" element={<FAQ />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/about" element={<About />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/student-registration" element={adminRoute(['manage_enrollments', 'manage_users'], <StudentRegistration />, 'دسترسی ثبت دانش‌آموز برای این حساب فعال نیست.')} />
            <Route path="/online-registrations" element={adminRoute(['manage_enrollments', 'manage_users'], <OnlineRegistrations />, 'دسترسی مدیریت ثبت‌نام‌های آنلاین برای این حساب فعال نیست.')} />
            <Route path="/student-management" element={adminRoute('manage_users', <StudentManagement />, 'دسترسی مدیریت دانش‌آموزان برای این حساب فعال نیست.')} />
            <Route path="/quiz/:courseId" element={authed ? <Quiz /> : <Login />} />
            <Route path="/dashboard" element={authed ? <RoleDashboard /> : <Login />} />
            <Route path="*" element={<MenuContent settings={settings} />} />
          </Routes>
        </Suspense>
      </div>
      {!isDashboardArea && <Footer settings={settings} />}
    </div>
  );
}

function App() {
  return (
    <Router>
      <ToastProvider>
        <AppShell />
      </ToastProvider>
    </Router>
  );
}

export default App;
