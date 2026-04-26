import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Checkbox } from '../components/ui/checkbox';
import { Textarea } from '../components/ui/textarea';
import { toast } from 'react-hot-toast';

const STEPS = [
  'انتخاب استاد و سال',
  'انتخاب روزها و زنگ‌ها',
  'محدودیت‌های خاص',
  'یادداشت و تایید'
];

const DEFAULT_AVAILABLE_DAYS = ['saturday', 'sunday', 'monday', 'tuesday', 'wednesday', 'thursday'];
const EMPTY_SPECIAL_CONSTRAINTS = {
  onlyMorningShift: false,
  onlyAfternoonShift: false,
  noBackToBackClasses: false,
  prefersSameClassroom: false
};
const createEmptyFormData = () => ({
  teacherId: '',
  academicYearId: '',
  shiftId: '',
  availableDays: [...DEFAULT_AVAILABLE_DAYS],
  availablePeriods: [],
  unavailablePeriods: [],
  preferredOffPeriods: [],
  maxPeriodsPerDay: 6,
  maxPeriodsPerWeek: 24,
  prefersConsecutivePeriods: false,
  avoidFirstPeriod: false,
  avoidLastPeriod: false,
  minGapBetweenPeriods: 0,
  notes: '',
  status: 'active',
  specialConstraints: { ...EMPTY_SPECIAL_CONSTRAINTS },
  temporaryRestrictions: []
});

export default function TimetableTeacherAvailabilityWizard() {
  const [step, setStep] = useState(0);
  const [formData, setFormData] = useState(createEmptyFormData());
  const [teachers, setTeachers] = useState([]);
  const [academicYears, setAcademicYears] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
                                  try {
                                    const [tRes, yRes, sRes] = await Promise.all([
                                      fetch('/api/users/school/' + (localStorage.getItem('schoolId') || '') + '?role=teacher'),
                                      fetch('/api/academic-years/school/' + (localStorage.getItem('schoolId') || '')),
                                      fetch('/api/shifts/school/' + (localStorage.getItem('schoolId') || ''))
                                    ]);
                                    const tData = await tRes.json();
                                    const yData = await yRes.json();
                                    const sData = await sRes.json();
                                    if (tData.success) setTeachers(tData.data);
                                    if (yData.success) setAcademicYears(yData.data.filter(y => y.status === 'active'));
                                    if (sData.success) setShifts(sData.data);
                                  } catch (e) {
                                    toast.error('دریافت داده‌ها ناموفق بود');
                                  } finally {
                                    setLoading(false);
                                  }
                                }
                                fetchData();
                              }, []);

                              // ...existing code...

                              const weekDays = [
                                { value: 'saturday', label: 'شنبه' },
                                { value: 'sunday', label: 'یکشنبه' },
                                { value: 'monday', label: 'دوشنبه' },
                                { value: 'tuesday', label: 'سه‌شنبه' },
                                { value: 'wednesday', label: 'چهارشنبه' },
                                { value: 'thursday', label: 'پنجشنبه' }
                              ];

                              // Step 1
                              const renderStep1 = () => (
                                <Card className="mb-4">
                                  <CardHeader>
                                    <CardTitle>انتخاب استاد، سال و نوبت</CardTitle>
                                  </CardHeader>
                                  <CardContent>
                                    <div className="flex flex-col gap-4">
                                      <div>
                                        <label className="block mb-1 text-xs font-bold text-slate-600">استاد</label>
                                        <Select value={formData.teacherId} onValueChange={v => handleChange('teacherId', v)}>
                                          <SelectTrigger className="h-11 bg-white rounded-xl border-slate-200"><SelectValue placeholder="انتخاب استاد" /></SelectTrigger>
                                          <SelectContent>
                                            {teachers.map(t => (
                                              <SelectItem key={t._id} value={t._id}>{t.firstName} {t.lastName}</SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                      </div>
                                      <div>
                                        <label className="block mb-1 text-xs font-bold text-slate-600">سال تعلیمی</label>
                                        <Select value={formData.academicYearId} onValueChange={v => handleChange('academicYearId', v)}>
                                          <SelectTrigger className="h-11 bg-white rounded-xl border-slate-200"><SelectValue placeholder="انتخاب سال" /></SelectTrigger>
                                          <SelectContent>
                                            {academicYears.map(y => (
                                              <SelectItem key={y._id} value={y._id}>{y.title}</SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                      </div>
                                      <div>
                                        <label className="block mb-1 text-xs font-bold text-slate-600">نوبت</label>
                                        <Select value={formData.shiftId} onValueChange={v => handleChange('shiftId', v)}>
                                          <SelectTrigger className="h-11 bg-white rounded-xl border-slate-200"><SelectValue placeholder="انتخاب نوبت" /></SelectTrigger>
                                          <SelectContent>
                                            {shifts.map(s => (
                                              <SelectItem key={s._id} value={s._id}>{s.nameDari || s.name}</SelectItem>
                                            ))}
                                          </SelectContent>
                                        </Select>
                                      </div>
                                    </div>
                                  </CardContent>
                                </Card>
                              );
}
                              // Step 2
                              const renderStep2 = () => (
                                <Card className="mb-4">
                                  <CardHeader>
                                    <CardTitle>انتخاب روزهای حضور و زنگ‌های مجاز</CardTitle>
                                  </CardHeader>
                                  <CardContent>
                                    <div className="flex flex-col gap-3 mb-4">
                                      <div className="flex flex-wrap gap-2">
                                        {weekDays.map(day => (
                                          <label key={day.value} className="flex items-center gap-2 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm cursor-pointer whitespace-nowrap transition-colors hover:bg-slate-100">
                                            <Checkbox
                                              checked={formData.availableDays.includes(day.value)}
                                              onCheckedChange={() => handleDayToggle(day.value)}
                                              className="w-4 h-4 rounded text-blue-600"
                                            />
                                            <span className="text-xs font-bold text-slate-700">{day.label}</span>
                                          </label>
                                        ))}
                                      </div>
                                      <div className="flex flex-col gap-3 mt-2">
                                        <div>
                                          <label className="block mb-1 text-xs font-bold text-slate-600">حداکثر زنگ در روز</label>
                                          <Input type="number" min={1} max={8} value={formData.maxPeriodsPerDay} onChange={e => handleChange('maxPeriodsPerDay', Number(e.target.value))} className="h-10 rounded-xl border-slate-200" />
                                        </div>
                                        <div>
                                          <label className="block mb-1 text-xs font-bold text-slate-600">حداکثر زنگ در هفته</label>
                                          <Input type="number" min={1} max={40} value={formData.maxPeriodsPerWeek} onChange={e => handleChange('maxPeriodsPerWeek', Number(e.target.value))} className="h-10 rounded-xl border-slate-200" />
                                        </div>
                                      </div>
                                    </div>
                                  </CardContent>
                                </Card>
                              );

                              // Step 3
                              const renderStep3 = () => (
                                <Card className="mb-4">
                                  <CardHeader>
                                    <CardTitle>محدودیت‌های خاص</CardTitle>
                                  </CardHeader>
                                  <CardContent>
                                    <div className="flex flex-col gap-3">
                                      <label className="flex items-center gap-2">
                                        <Checkbox checked={formData.specialConstraints.onlyMorningShift} onCheckedChange={() => handleConstraintToggle('onlyMorningShift')} className="w-4 h-4 rounded text-blue-600" />
                                        <span className="text-xs font-bold text-slate-700">فقط شیفت صبح</span>
                                      </label>
                                      <label className="flex items-center gap-2">
                                        <Checkbox checked={formData.specialConstraints.onlyAfternoonShift} onCheckedChange={() => handleConstraintToggle('onlyAfternoonShift')} className="w-4 h-4 rounded text-blue-600" />
                                        <span className="text-xs font-bold text-slate-700">فقط شیفت بعدازظهر</span>
                                      </label>
                                      <label className="flex items-center gap-2">
                                        <Checkbox checked={formData.specialConstraints.noBackToBackClasses} onCheckedChange={() => handleConstraintToggle('noBackToBackClasses')} className="w-4 h-4 rounded text-blue-600" />
                                        <span className="text-xs font-bold text-slate-700">بدون کلاس پشت‌سرهم</span>
                                      </label>
                                      <label className="flex items-center gap-2">
                                        <Checkbox checked={formData.specialConstraints.prefersSameClassroom} onCheckedChange={() => handleConstraintToggle('prefersSameClassroom')} className="w-4 h-4 rounded text-blue-600" />
                                        <span className="text-xs font-bold text-slate-700">ترجیحاً یک صنف ثابت</span>
                                      </label>
                                    </div>
                                  </CardContent>
                                </Card>
                              );

                              // Step 4
                              const renderStep4 = () => (
                                <Card className="mb-4">
                                  <CardHeader>
                                    <CardTitle>یادداشت و تایید نهایی</CardTitle>
                                  </CardHeader>
                                  <CardContent>
                                    <label className="block mb-2 text-xs font-bold text-slate-600">یادداشت اجرایی (اختیاری)</label>
                                    <Textarea
                                      placeholder="یادداشت اجرایی (اختیاری)"
                                      value={formData.notes}
                                      onChange={e => handleChange('notes', e.target.value)}
                                      className="rounded-xl border-slate-200 min-h-[80px]"
                                    />
                                  </CardContent>
                                </Card>
                              );
                            
