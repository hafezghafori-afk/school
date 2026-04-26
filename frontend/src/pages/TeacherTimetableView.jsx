import React, { useEffect, useState } from 'react';
import { Card, CardHeader, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { ArrowRight, CalendarDays, ChevronDown, Clock3, GraduationCap, Printer, School, Sparkles } from 'lucide-react';
import { toast } from 'react-hot-toast';
import {
  buildWeeklySlotRowsFromDailyDraft,
  listPublishedDailyTimetableEntries,
  mergePublishedDailyTimetableIntoWeeklyGrid
} from '../utils/dailyTimetableDraft';
import '../styles/timetable-print.css';
import './TimetableAudienceView.css';

const WEEK_DAYS = [
  { value: 'saturday', label: 'شنبه' },
  { value: 'sunday', label: 'یکشنبه' },
  { value: 'monday', label: 'دوشنبه' },
  { value: 'tuesday', label: 'سه‌شنبه' },
  { value: 'wednesday', label: 'چهارشنبه' },
  { value: 'thursday', label: 'پنجشنبه' }
];

const SLOT_ROWS = buildWeeklySlotRowsFromDailyDraft();

const getAuthHeaders = () => {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

function getTeacherLabel(teacher) {
  if (!teacher) return 'استاد';
  if (typeof teacher.name === 'string' && teacher.name.trim()) return teacher.name;
  const fullName = `${teacher.firstName || ''} ${teacher.lastName || ''}`.trim();
  return fullName || 'استاد';
}

function getSubjectLabel(entry) {
  return entry?.subjectId?.name || entry?.subject || 'مضمون';
}

function countActiveDays(timetable, slotRows) {
  return WEEK_DAYS.filter((day) => (
    slotRows.some((slot) => slot.type === 'class' && timetable?.[day.value]?.[slot.slotNumber])
  )).length;
}

function countActiveClasses(entries = []) {
  return new Set(
    entries.map((item) => String(
      item?.classId?.title
      || item?.classId?._id
      || item?.classId
      || item?.classroom
      || item?._id
      || ''
    ).trim()).filter(Boolean)
  ).size;
}

export default function TeacherTimetableView() {
  const [user, setUser] = useState(null);
  const [academicYears, setAcademicYears] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [selectedAcademicYear, setSelectedAcademicYear] = useState('');
  const [selectedShift, setSelectedShift] = useState('');
  const [timetable, setTimetable] = useState({});
  const [entries, setEntries] = useState([]);
  const [publishedEntryCount, setPublishedEntryCount] = useState(0);
  const [slotRows, setSlotRows] = useState(SLOT_ROWS);
  const [loading, setLoading] = useState(true);

  const schoolId = localStorage.getItem('schoolId') || localStorage.getItem('school_id') || localStorage.getItem('selectedSchoolId') || '';

  useEffect(() => {
    const bootstrap = async () => {
      setLoading(true);
      try {
        const [meRes, yearsRes, shiftsRes] = await Promise.all([
          fetch('/api/users/me', { headers: { ...getAuthHeaders() } }),
          fetch(`/api/academic-years/school/${schoolId}`, { headers: { ...getAuthHeaders() } }),
          fetch(`/api/shifts/school/${schoolId}`, { headers: { ...getAuthHeaders() } })
        ]);

        const [meData, yearsData, shiftsData] = await Promise.all([
          meRes.json(),
          yearsRes.json(),
          shiftsRes.json()
        ]);

        if (!meData?.success || !meData?.user) {
          toast.error('دریافت معلومات استاد ناموفق بود.');
          return;
        }

        const years = (yearsData?.success ? yearsData.data || [] : []).filter((item) => item.status === 'active');
        const nextShifts = shiftsData?.success ? shiftsData.data || [] : [];

        setUser(meData.user);
        setAcademicYears(years);
        setShifts(nextShifts);

        if (years.length > 0) setSelectedAcademicYear(years[0]._id);
        if (nextShifts.length > 0) setSelectedShift(nextShifts[0]._id);
      } catch (error) {
        console.error('Error loading teacher timetable bootstrap:', error);
        toast.error('بارگذاری اولیه ناموفق بود.');
      } finally {
        setLoading(false);
      }
    };

    bootstrap();
  }, [schoolId]);

  useEffect(() => {
    const fetchTimetable = async () => {
      const teacherId = String(user?._id || user?.id || '').trim();
      if (!teacherId || !selectedAcademicYear || !selectedShift) return;

      setLoading(true);
      try {
        const url = `/api/timetable/teacher/${teacherId}?academicYearId=${selectedAcademicYear}&shiftId=${selectedShift}`;
        const publishedUrl = schoolId
          ? `/api/timetables/daily-published?schoolId=${encodeURIComponent(schoolId)}`
          : '';

        const [response, publishedResponse] = await Promise.all([
          fetch(url, { headers: { ...getAuthHeaders() } }),
          publishedUrl ? fetch(publishedUrl, { headers: { ...getAuthHeaders() } }) : Promise.resolve(null)
        ]);

        const data = await response.json();
        const publishedData = publishedResponse ? await publishedResponse.json() : null;

        const legacyTimetable = data?.success ? data.data?.timetable || {} : {};
        const legacyEntries = data?.success ? data.data?.entries || [] : [];
        const publishedItem = publishedResponse?.ok && publishedData?.success ? publishedData.item : null;
        const usePublishedFallback = legacyEntries.length === 0;
        const publishedEntries = usePublishedFallback
          ? listPublishedDailyTimetableEntries(
            publishedItem,
            (item) => String(item.teacherId || '').trim() === teacherId
          )
          : [];

        if (!data?.success && !publishedEntries.length) {
          toast.error('دریافت تقسیم اوقات استاد ناموفق بود.');
          setTimetable({});
          setEntries([]);
          setPublishedEntryCount(0);
          setSlotRows(SLOT_ROWS);
          return;
        }

        setTimetable(
          usePublishedFallback
            ? mergePublishedDailyTimetableIntoWeeklyGrid(
              legacyTimetable,
              publishedItem,
              (item) => String(item.teacherId || '').trim() === teacherId
            )
            : legacyTimetable
        );
        setEntries(usePublishedFallback ? publishedEntries : legacyEntries);
        setPublishedEntryCount(usePublishedFallback ? publishedEntries.length : 0);
        setSlotRows(buildWeeklySlotRowsFromDailyDraft(publishedItem));
      } catch (error) {
        console.error('Error loading teacher timetable:', error);
        toast.error('دریافت تقسیم اوقات استاد ناموفق بود.');
        setSlotRows(SLOT_ROWS);
      } finally {
        setLoading(false);
      }
    };

    fetchTimetable();
  }, [schoolId, user, selectedAcademicYear, selectedShift]);

  const teacherLabel = getTeacherLabel(user);
  const selectedAcademicYearLabel = academicYears.find((item) => item._id === selectedAcademicYear)?.title || 'سال تعلیمی';
  const selectedShiftLabel = (
    shifts.find((item) => item._id === selectedShift)?.nameDari
    || shifts.find((item) => item._id === selectedShift)?.name
    || 'نوبت'
  );
  const activeDayCount = countActiveDays(timetable, slotRows);
  const activeClassesCount = countActiveClasses(entries);
  const classSlotCount = slotRows.filter((slot) => slot.type === 'class').length;

  if (loading) {
    return (
      <div className="tt-audience-loading">
        <div className="tt-audience-loading-card">
          <strong>در حال آماده‌سازی تقسیم اوقات استاد</strong>
          <p>سال تعلیمی، نوبت و خانه‌های نشرشده بررسی می‌شود تا برنامه هفتگی استاد با دیزاین تازه نمایش داده شود.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-4 md:p-6 space-y-6 tt-shared-page tt-audience-page print-timetable print-teacher-schedule">
      <div className="print-header">
        <h1>تقسیم اوقات رسمی مکتب</h1>
        <h2>برنامه هفتگی استاد</h2>
      </div>

      <section className="tt-audience-hero no-print">
        <div className="tt-audience-hero-copy">
          <div className="tt-audience-kicker">
            <Sparkles />
            نمای منظم تقسیم اوقات استاد
          </div>
          <h1>برنامه هفتگی {teacherLabel}</h1>
          <p>
            این صفحه زنگ‌های تدریسی استاد را به‌صورت واضح و خوانا نشان می‌دهد تا استاد بتواند صنف، مضمون و زمان هر جلسه
            را بدون آشفتگی دنبال کند.
          </p>
          <div className="tt-audience-chip-row">
            <Badge variant="outline" className="tt-audience-chip">{selectedAcademicYearLabel}</Badge>
            <Badge variant="outline" className="tt-audience-chip">{selectedShiftLabel}</Badge>
            <Badge variant="outline" className="tt-audience-chip">{teacherLabel}</Badge>
          </div>
        </div>

        <div className="tt-audience-hero-panel">
          <div>
            <span className="tt-audience-hero-panel-label">وضعیت فعلی برنامه</span>
            <span className="tt-audience-hero-panel-value">{entries.length.toLocaleString('fa-AF-u-ca-persian')} خانه فعال</span>
            <p className="tt-audience-hero-panel-note">
              {publishedEntryCount > 0
                ? `${publishedEntryCount.toLocaleString('fa-AF-u-ca-persian')} خانه از نشر روزانه‌ی جدید گرفته شده است.`
                : 'نمای فعلی از تقسیم اوقات هفتگی استاد ساخته شده و برای مرور سریع آماده است.'}
            </p>
          </div>
          <div className="tt-audience-actions">
            <Button variant="outline" className="tt-audience-btn tt-audience-btn-light" onClick={() => window.print()}>
              <Printer className="w-4 h-4" />
              چاپ برنامه
            </Button>
            <Button variant="outline" className="tt-audience-btn tt-audience-btn-ghost" onClick={() => window.history.back()}>
              <ArrowRight className="w-4 h-4" />
              بازگشت
            </Button>
          </div>
        </div>
      </section>

      <section className="tt-audience-stat-grid no-print">
        <div className="tt-audience-stat-card">
          <span className="tt-audience-stat-label">کل خانه‌های ثبت‌شده</span>
          <span className="tt-audience-stat-value">{entries.length.toLocaleString('fa-AF-u-ca-persian')}</span>
          <span className="tt-audience-stat-note">تمام زنگ‌هایی که برای استاد در جدول فعال‌اند.</span>
        </div>
        <div className="tt-audience-stat-card">
          <span className="tt-audience-stat-label">صنف‌های فعال</span>
          <span className="tt-audience-stat-value">{activeClassesCount.toLocaleString('fa-AF-u-ca-persian')}</span>
          <span className="tt-audience-stat-note">صنف‌هایی که در این برنامه برای استاد دیده می‌شوند.</span>
        </div>
        <div className="tt-audience-stat-card">
          <span className="tt-audience-stat-label">روزهای دارای تدریس</span>
          <span className="tt-audience-stat-value">{activeDayCount.toLocaleString('fa-AF-u-ca-persian')}</span>
          <span className="tt-audience-stat-note">از مجموع {WEEK_DAYS.length.toLocaleString('fa-AF-u-ca-persian')} روز درسی هفته.</span>
        </div>
        <div className="tt-audience-stat-card">
          <span className="tt-audience-stat-label">زنگ‌های معیار هفته</span>
          <span className="tt-audience-stat-value">{classSlotCount.toLocaleString('fa-AF-u-ca-persian')}</span>
          <span className="tt-audience-stat-note">هر روز بر پایه همین تعداد زنگ بررسی می‌شود.</span>
        </div>
      </section>

      <Card className="no-print tt-audience-filter-card">
        <CardContent className="tt-audience-filter-content">
          <div className="tt-audience-section-head">
            <div>
              <h3>فیلترهای نمایش</h3>
              <p>سال تعلیمی و نوبت را تغییر دهید تا برنامه هفتگی استاد در همان محدوده به‌روز شود.</p>
            </div>
            <Badge variant="secondary" className="tt-audience-board-chip">نمای استاد</Badge>
          </div>

          <div className="tt-audience-filter-grid tt-audience-filter-grid-two">
            <div className="tt-audience-field">
              <div className="tt-audience-field-head">
                <span className="tt-audience-field-icon"><CalendarDays className="w-4 h-4" /></span>
                <label htmlFor="teacher-schedule-year">سال تعلیمی</label>
              </div>
              <div className="tt-audience-select-wrap">
                <select
                  id="teacher-schedule-year"
                  value={selectedAcademicYear}
                  onChange={(event) => setSelectedAcademicYear(event.target.value)}
                  disabled={!academicYears.length}
                >
                  {!academicYears.length && <option value="">سال تعلیمی فعال ثبت نشده است</option>}
                  {academicYears.map((item) => (
                    <option key={item._id} value={item._id}>{item.title}</option>
                  ))}
                </select>
                <span className="tt-audience-select-chevron"><ChevronDown className="w-4 h-4" /></span>
              </div>
            </div>

            <div className="tt-audience-field">
              <div className="tt-audience-field-head">
                <span className="tt-audience-field-icon"><Clock3 className="w-4 h-4" /></span>
                <label htmlFor="teacher-schedule-shift">نوبت</label>
              </div>
              <div className="tt-audience-select-wrap">
                <select
                  id="teacher-schedule-shift"
                  value={selectedShift}
                  onChange={(event) => setSelectedShift(event.target.value)}
                  disabled={!shifts.length}
                >
                  {!shifts.length && <option value="">نوبت ثبت نشده است</option>}
                  {shifts.map((item) => (
                    <option key={item._id} value={item._id}>{item.name} ({item.nameDari})</option>
                  ))}
                </select>
                <span className="tt-audience-select-chevron"><ChevronDown className="w-4 h-4" /></span>
              </div>
            </div>
          </div>

          <div className="tt-audience-filter-note">
            اگر برای این استاد در نوبت انتخاب‌شده برنامه‌ای نشر نشده باشد، جدول خالی می‌ماند تا بعد از ثبت یا نشر تقسیم اوقات
            خانه‌ها خودکار ظاهر شوند.
          </div>
        </CardContent>
      </Card>

      <Card className="print-no-break tt-audience-board-card">
        <CardHeader>
          <div className="tt-audience-board-head">
            <div className="tt-audience-board-copy">
              <strong>جدول هفتگی استاد</strong>
              <p>در هر خانه مضمون و صنف همان زنگ نمایش داده می‌شود تا استاد بتواند برنامه‌ی هفته را یک‌جا ببیند.</p>
            </div>
            <Badge variant="secondary" className="tt-audience-board-chip">
              <CalendarDays className="w-4 h-4" />
              جدول هفتگی
            </Badge>
          </div>
        </CardHeader>
        <CardContent className="tt-audience-board-content">
          {!entries.length && (
            <div className="tt-audience-empty-banner">
              هنوز برای این استاد در سال تعلیمی و نوبت انتخاب‌شده برنامه‌ای نشر نشده است. بعد از ثبت یا نشر تقسیم اوقات،
              خانه‌های جدول خودکار پر می‌شوند.
            </div>
          )}

          <div className="hidden md:block tt-audience-table-wrap">
            <table className="tt-audience-table">
              <thead>
                <tr>
                  <th>زنگ</th>
                  {WEEK_DAYS.map((day) => (
                    <th key={day.value}>{day.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {slotRows.map((slot) => (
                  <tr key={slot.slotNumber}>
                    <td className="tt-audience-period-cell">
                      <div className="tt-audience-period-title">{slot.label}</div>
                      <div className="tt-audience-period-time">{slot.startTime} - {slot.endTime}</div>
                    </td>
                    {WEEK_DAYS.map((day) => {
                      const entry = timetable[day.value]?.[slot.slotNumber];

                      return (
                        <td key={`${day.value}-${slot.slotNumber}`} className="tt-audience-table-cell">
                          {slot.type === 'break' ? (
                            <div className="tt-audience-slot-break">تفریح</div>
                          ) : entry ? (
                            <div className="tt-audience-slot-card">
                              <div className="tt-audience-slot-subject">{getSubjectLabel(entry)}</div>
                              <div className="tt-audience-slot-meta">
                                <School className="w-3 h-3" />
                                {entry.classId?.title || 'صنف نامشخص'}
                              </div>
                            </div>
                          ) : (
                            <div className="tt-audience-slot-empty">این زنگ فعلاً خالی است.</div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="md:hidden tt-audience-mobile-days">
            {WEEK_DAYS.map((day) => {
              const filledInDay = slotRows.filter((slot) => (
                slot.type === 'class' && timetable[day.value]?.[slot.slotNumber]
              )).length;

              return (
                <section key={day.value} className="tt-audience-mobile-day">
                  <div className="tt-audience-mobile-day-head">
                    <span>{day.label}</span>
                    <span>{filledInDay.toLocaleString('fa-AF-u-ca-persian')} زنگ فعال</span>
                  </div>
                  <div className="tt-audience-mobile-list">
                    {slotRows.map((slot) => {
                      const entry = timetable[day.value]?.[slot.slotNumber];

                      return (
                        <div key={`${day.value}-${slot.slotNumber}`} className="tt-audience-mobile-slot">
                          <div className="tt-audience-mobile-meta">
                            <span>{slot.label}</span>
                            <span>{slot.startTime} - {slot.endTime}</span>
                          </div>
                          {slot.type === 'break' ? (
                            <div className="tt-audience-slot-break">تفریح</div>
                          ) : entry ? (
                            <div className="tt-audience-slot-card">
                              <div className="tt-audience-slot-subject">{getSubjectLabel(entry)}</div>
                              <div className="tt-audience-slot-meta">
                                <School className="w-3 h-3" />
                                {entry.classId?.title || 'صنف نامشخص'}
                              </div>
                            </div>
                          ) : (
                            <div className="tt-audience-slot-empty">برای این زنگ چیزی ثبت نشده است.</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        </CardContent>
      </Card>

      <Card className="no-print tt-audience-footer-card">
        <CardContent className="tt-audience-footer-content">
          <div className="tt-audience-footer-main">
            {teacherLabel} | {selectedAcademicYearLabel} | {selectedShiftLabel}
          </div>
          <div className="tt-audience-footer-note">
            <GraduationCap className="w-4 h-4 inline-block ml-1" />
            صنف‌های فعال: {activeClassesCount.toLocaleString('fa-AF-u-ca-persian')}
            {publishedEntryCount > 0 ? ` | نشر روزانه: ${publishedEntryCount.toLocaleString('fa-AF-u-ca-persian')}` : ''}
            {' | '}
            <Clock3 className="w-4 h-4 inline-block ml-1" />
            روزهای فعال: {activeDayCount.toLocaleString('fa-AF-u-ca-persian')}
          </div>
        </CardContent>
      </Card>

      <div className="print-footer">
        چاپ‌شده از سیستم مدیریت مکتب | {teacherLabel}
      </div>
    </div>
  );
}
