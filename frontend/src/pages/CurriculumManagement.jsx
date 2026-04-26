import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Checkbox } from '../components/ui/checkbox';
import { Badge } from '../components/ui/badge';
import { Trash2, Edit, Plus, BookOpen, Clock, AlertCircle, Users } from 'lucide-react';
import { toast } from 'react-hot-toast';

const CurriculumManagement = () => {
  const [curriculumRules, setCurriculumRules] = useState([]);
  const [classes, setClasses] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [academicYears, setAcademicYears] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingRule, setEditingRule] = useState(null);
  const [selectedClass, setSelectedClass] = useState(null);
  const [bulkMode, setBulkMode] = useState(false);
  const [bulkSubjects, setBulkSubjects] = useState([]);
  
  const [formData, setFormData] = useState({
    academicYearId: '',
    classId: '',
    subjectId: '',
    weeklyPeriods: 1,
    isMandatory: true,
    priority: 1,
    consecutivePeriods: false,
    preferredTimeSlots: [],
    avoidTimeSlots: [],
    specialRequirements: {
      needsLab: false,
      needsComputer: false,
      needsPlayground: false,
      needsLibrary: false
    }
  });

  const schoolId = localStorage.getItem('schoolId') || localStorage.getItem('school_id') || localStorage.getItem('selectedSchoolId') || '';

  const weekDays = [
    { value: 'saturday', label: 'Saturday', labelDari: 'شنبه' },
    { value: 'sunday', label: 'Sunday', labelDari: 'یکشنبه' },
    { value: 'monday', label: 'Monday', labelDari: 'دوشنبه' },
    { value: 'tuesday', label: 'Tuesday', labelDari: 'سه‌شنبه' },
    { value: 'wednesday', label: 'Wednesday', labelDari: 'چهارشنبه' },
    { value: 'thursday', label: 'Thursday', labelDari: 'پنجشنبه' },
    { value: 'friday', label: 'Friday', labelDari: 'جمعه' }
  ];

  useEffect(() => {
    fetchCurriculumRules();
    fetchClasses();
    fetchSubjects();
    fetchAcademicYears();
  }, []);

  const fetchCurriculumRules = async () => {
    try {
      const response = await fetch(`/api/curriculum-rules/school/${schoolId}`);
      const data = await response.json();
      
      if (data.success) {
        setCurriculumRules(data.data);
      } else {
          toast.error('خطا در دریافت قوانین مضمون.');
      }
    } catch (error) {
      console.error('Error fetching curriculum rules:', error);
      toast.error('خطا در دریافت قوانین مضمون.');
    } finally {
      setLoading(false);
    }
  };

  const fetchClasses = async () => {
    try {
      const response = await fetch(`/api/school-classes/school/${schoolId}`);
      const data = await response.json();
      
      if (data.success) {
        setClasses(data.data);
      }
    } catch (error) {
      console.error('Error fetching classes:', error);
    }
  };

  const fetchSubjects = async () => {
    try {
      const response = await fetch(`/api/subjects/school/${schoolId}`);
      const data = await response.json();
      
      if (data.success) {
        setSubjects(data.data);
      }
    } catch (error) {
      console.error('Error fetching subjects:', error);
    }
  };

  const fetchAcademicYears = async () => {
    try {
      const response = await fetch(`/api/academic-years/school/${schoolId}`);
      const data = await response.json();
      
      if (data.success) {
        setAcademicYears(data.data.filter(year => year.status === 'active'));
      }
    } catch (error) {
      console.error('Error fetching academic years:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      const url = editingRule 
        ? `/api/curriculum-rules/${editingRule._id}`
        : `/api/curriculum-rules/school/${schoolId}`;
      
      const method = editingRule ? 'PUT' : 'POST';
      
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();
      
      if (data.success) {
        toast.success(editingRule ? 'قانون مضمون به‌روزرسانی شد.' : 'قانون مضمون ایجاد شد.');
        setShowForm(false);
        setEditingRule(null);
        resetForm();
        fetchCurriculumRules();
      } else {
        toast.error(data.message || 'خطا در ذخیره قانون مضمون.');
      }
    } catch (error) {
      console.error('Error saving curriculum rule:', error);
      toast.error('خطا در ذخیره قانون مضمون.');
    }
  };

  const handleEdit = (rule) => {
    setEditingRule(rule);
    setFormData({
      academicYearId: rule.academicYearId._id,
      classId: rule.classId._id,
      subjectId: rule.subjectId._id,
      weeklyPeriods: rule.weeklyPeriods,
      isMandatory: rule.isMandatory,
      priority: rule.priority,
      consecutivePeriods: rule.consecutivePeriods,
      preferredTimeSlots: rule.preferredTimeSlots || [],
      avoidTimeSlots: rule.avoidTimeSlots || [],
      specialRequirements: rule.specialRequirements || {
        needsLab: false,
        needsComputer: false,
        needsPlayground: false,
        needsLibrary: false
      }
    });
    setShowForm(true);
  };

  const handleDelete = async (ruleId) => {
    if (!confirm('آیا مطمئن هستید که می‌خواهید این قانون مضمون را حذف کنید؟')) return;
    
    try {
      const response = await fetch(`/api/curriculum-rules/${ruleId}`, {
        method: 'DELETE',
      });

      const data = await response.json();
      
      if (data.success) {
        toast.success('قانون مضمون حذف شد.');
        fetchCurriculumRules();
      } else {
        toast.error(data.message || 'خطا در حذف قانون مضمون.');
      }
    } catch (error) {
      console.error('Error deleting curriculum rule:', error);
      toast.error('خطا در حذف قانون مضمون.');
    }
  };

  const handleClassSelect = async (classId) => {
    setSelectedClass(classId);
    if (classId) {
      try {
        const response = await fetch(`/api/curriculum-rules/class/${classId}/summary`);
        const data = await response.json();
        
        if (data.success) {
          // Show existing curriculum for this class
          toast.info(`این صنف ${data.data.totalSubjects} مضمون و ${data.data.totalWeeklyPeriods} زنگ هفتگی دارد.`);
        }
      } catch (error) {
        console.error('Error fetching class curriculum:', error);
      }
    }
  };

  const handleBulkSubmit = async () => {
    if (!selectedClass || !formData.academicYearId || bulkSubjects.length === 0) {
      toast.error('لطفاً، صنف، سال تعلیمی و حداقل یک مضمون را انتخاب نمایید.');
      return;
    }

    try {
      const response = await fetch(`/api/curriculum-rules/class/${selectedClass}/bulk`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          academicYearId: formData.academicYearId,
          subjects: bulkSubjects
        }),
      });

      const data = await response.json();
      
      if (data.success) {
        toast.success(`${data.data.length} قانون مضمون ایجاد شد.`);
        setBulkMode(false);
        setBulkSubjects([]);
        fetchCurriculumRules();
      } else {
        toast.error(data.message || 'خطا در ایجاد قوانین مضمون.');
      }
    } catch (error) {
      console.error('Error creating curriculum rules:', error);
      toast.error('خطا در ایجاد قوانین مضمون.');
    }
  };

  const handleBulkSubjectToggle = (subjectId, isChecked) => {
    if (isChecked) {
      setBulkSubjects(prev => [...prev, {
        subjectId,
        weeklyPeriods: 1,
        isMandatory: true,
        priority: 1
      }]);
    } else {
      setBulkSubjects(prev => prev.filter(s => s.subjectId !== subjectId));
    }
  };

  const handleBulkSubjectUpdate = (subjectId, field, value) => {
    setBulkSubjects(prev => prev.map(s => 
      s.subjectId === subjectId ? { ...s, [field]: value } : s
    ));
  };

  const resetForm = () => {
    setFormData({
      academicYearId: '',
      classId: '',
      subjectId: '',
      weeklyPeriods: 1,
      isMandatory: true,
      priority: 1,
      consecutivePeriods: false,
      preferredTimeSlots: [],
      avoidTimeSlots: [],
      specialRequirements: {
        needsLab: false,
        needsComputer: false,
        needsPlayground: false,
        needsLibrary: false
      }
    });
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingRule(null);
    setBulkMode(false);
    resetForm();
  };

  if (loading) {
    return <div className="flex justify-center items-center h-64">در حال بارگذاری...</div>;
  }

  return (
    <div className="container mx-auto p-6 space-y-6 tt-shared-page">
      <div className="flex justify-between items-center tt-shared-header">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 tt-shared-title">مدیریت مضامین درسی</h1>
          <p className="text-gray-600 mt-2 tt-shared-subtitle">قوانین مضمون و ساعت درسی در هفته را برای سیستم خودکار تنظیم نمایید.</p>
        </div>
        <div className="flex gap-2">
          <Button 
            variant="outline"
            onClick={() => setBulkMode(!bulkMode)}
          >
            {bulkMode ? 'حالت عادی' : 'حالت گروهی'}
          </Button>
          <Button 
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            افزودن قانون مضمون
          </Button>
        </div>
      </div>

      {/* Bulk Mode */}
      {bulkMode && (
        <Card>
          <CardHeader>
            <CardTitle>انتخاب گروهی مضامین</CardTitle>
            <p className="text-sm text-gray-600">صنف و چندین مضمون را یکجا برای چندین کلاس انتخاب نمایید.</p>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="academicYearId">سال تعلیمی</Label>
                <Select 
                  value={formData.academicYearId} 
                  onValueChange={(value) => setFormData({...formData, academicYearId: value})}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="انتخاب سال تعلیمی" />
                  </SelectTrigger>
                  <SelectContent>
                    {academicYears.map((year) => (
                      <SelectItem key={year._id} value={year._id}>
                        {year.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label htmlFor="classId">صنف</Label>
                <Select 
                  value={selectedClass} 
                  onValueChange={handleClassSelect}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="انتخاب صنف" />
                  </SelectTrigger>
                  <SelectContent>
                    {classes.map((classItem) => (
                      <SelectItem key={classItem._id} value={classItem._id}>
                        {classItem.title}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {selectedClass && (
              <div>
                <Label>انتخاب مضامین</Label>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-2">
                  {subjects.map((subject) => {
                    const bulkSubject = bulkSubjects.find(s => s.subjectId === subject._id);
                    return (
                      <Card key={subject._id} className="p-3">
                        <div className="space-y-2">
                          <div className="flex items-center space-x-2">
                            <Checkbox
                              checked={bulkSubjects.some(s => s.subjectId === subject._id)}
                              onCheckedChange={(checked) => handleBulkSubjectToggle(subject._id, checked)}
                            />
                            <Label className="text-sm font-medium">
                              {subject.name}
                            </Label>
                          </div>
                          
                          {bulkSubjects.some(s => s.subjectId === subject._id) && (
                            <div className="space-y-2 pl-6">
                              <div className="grid grid-cols-2 gap-2">
                                <div>
                                  <Label className="text-xs">ساعات هفتگی</Label>
                                  <Input
                                    type="number"
                                    min="1"
                                    max="10"
                                    value={bulkSubject?.weeklyPeriods || 1}
                                    onChange={(e) => handleBulkSubjectUpdate(subject._id, 'weeklyPeriods', parseInt(e.target.value))}
                                    className="h-8"
                                  />
                                </div>
                                <div>
                                  <Label className="text-xs">اولویت</Label>
                                  <Input
                                    type="number"
                                    min="1"
                                    max="10"
                                    value={bulkSubject?.priority || 1}
                                    onChange={(e) => handleBulkSubjectUpdate(subject._id, 'priority', parseInt(e.target.value))}
                                    className="h-8"
                                  />
                                </div>
                              </div>
                              <div className="flex items-center space-x-2">
                                <Checkbox
                                  checked={bulkSubject?.isMandatory !== false}
                                  onCheckedChange={(checked) => handleBulkSubjectUpdate(subject._id, 'isMandatory', checked)}
                                />
                                <Label className="text-xs">اجباری</Label>
                              </div>
                            </div>
                          )}
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <Button onClick={handleBulkSubmit} disabled={bulkSubjects.length === 0}>
                ایجاد {bulkSubjects.length} قانون مضمون
              </Button>
              <Button variant="outline" onClick={handleCancel}>
                انصراف
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Single Mode Form */}
      {showForm && !bulkMode && (
        <Card>
          <CardHeader>
            <CardTitle>{editingRule ? 'ویرایش قانون مضمون' : 'ایجاد قانون مضمون'}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="academicYearId">سال تعلیمی</Label>
                  <Select 
                    value={formData.academicYearId} 
                    onValueChange={(value) => setFormData({...formData, academicYearId: value})}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="انتخاب سال تعلیمی" />
                    </SelectTrigger>
                    <SelectContent>
                      {academicYears.map((year) => (
                        <SelectItem key={year._id} value={year._id}>
                          {year.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="classId">صنف</Label>
                  <Select 
                    value={formData.classId} 
                    onValueChange={(value) => setFormData({...formData, classId: value})}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="انتخاب صنف" />
                    </SelectTrigger>
                    <SelectContent>
                      {classes.map((classItem) => (
                        <SelectItem key={classItem._id} value={classItem._id}>
                          {classItem.title}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="subjectId">مضمون</Label>
                  <Select 
                    value={formData.subjectId} 
                    onValueChange={(value) => setFormData({...formData, subjectId: value})}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="انتخاب مضمون" />
                    </SelectTrigger>
                    <SelectContent>
                      {subjects.map((subject) => (
                        <SelectItem key={subject._id} value={subject._id}>
                          {subject.name} ({subject.code})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="weeklyPeriods">ساعات هفتگی</Label>
                  <Input
                    id="weeklyPeriods"
                    type="number"
                    min="1"
                    max="10"
                    value={formData.weeklyPeriods}
                    onChange={(e) => setFormData({...formData, weeklyPeriods: parseInt(e.target.value)})}
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="priority">اولویت</Label>
                  <Input
                    id="priority"
                    type="number"
                    min="1"
                    max="10"
                    value={formData.priority}
                    onChange={(e) => setFormData({...formData, priority: parseInt(e.target.value)})}
                    required
                  />
                </div>

                <div className="flex items-center space-x-2 pt-6">
                  <Checkbox
                    id="isMandatory"
                    checked={formData.isMandatory}
                    onCheckedChange={(checked) => setFormData({...formData, isMandatory: checked})}
                  />
                  <Label htmlFor="isMandatory">مضمون اجباری</Label>
                </div>
              </div>

              <div>
                <Label>نیازمندی‌های ویژه</Label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-2">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="needsLab"
                      checked={formData.specialRequirements.needsLab}
                      onCheckedChange={(checked) => setFormData({
                        ...formData,
                        specialRequirements: {
                          ...formData.specialRequirements,
                          needsLab: checked
                        }
                      })}
                    />
                    <Label htmlFor="needsLab" className="text-sm">
                      نیاز به لابراتوار
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="needsComputer"
                      checked={formData.specialRequirements.needsComputer}
                      onCheckedChange={(checked) => setFormData({
                        ...formData,
                        specialRequirements: {
                          ...formData.specialRequirements,
                          needsComputer: checked
                        }
                      })}
                    />
                    <Label htmlFor="needsComputer" className="text-sm">
                      نیاز به کمپیوتر
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="needsPlayground"
                      checked={formData.specialRequirements.needsPlayground}
                      onCheckedChange={(checked) => setFormData({
                        ...formData,
                        specialRequirements: {
                          ...formData.specialRequirements,
                          needsPlayground: checked
                        }
                      })}
                    />
                    <Label htmlFor="needsPlayground" className="text-sm">
                      نیاز به میدان ورزش
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="consecutivePeriods"
                      checked={formData.consecutivePeriods}
                      onCheckedChange={(checked) => setFormData({...formData, consecutivePeriods: checked})}
                    />
                    <Label htmlFor="consecutivePeriods" className="text-sm">
                      زنگ‌های متوالی
                    </Label>
                  </div>
                </div>
              </div>

              <div className="flex gap-2">
                <Button type="submit">
                  {editingRule ? 'به‌روزرسانی قانون' : 'ایجاد قانون'}
                </Button>
                <Button type="button" variant="outline" onClick={handleCancel}>
                  انصراف
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Curriculum Rules List */}
      <div className="space-y-4">
        {curriculumRules.map((rule) => (
          <Card key={rule._id} className="hover:shadow-lg transition-shadow">
            <CardContent className="p-4">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-4 mb-2">
                    <h3 className="font-semibold text-lg">{rule.subjectId.name}</h3>
                    <Badge variant={rule.isMandatory ? "default" : "secondary"}>
                      {rule.isMandatory ? 'اجباری' : 'اختیاری'}
                    </Badge>
                    <Badge variant="outline">
                      اولویت: {rule.priority}
                    </Badge>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 text-sm">
                    <div className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-gray-500" />
                      <span>{rule.classId.title}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-gray-500" />
                      <span>{rule.weeklyPeriods} ساعت در هفته</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <BookOpen className="w-4 h-4 text-gray-500" />
                      <span>{rule.academicYearId.title}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-gray-500" />
                      <span>{rule.subjectId.category}</span>
                    </div>
                  </div>

                  {Object.values(rule.specialRequirements).some(req => req) && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {rule.specialRequirements.needsLab && (
                        <Badge variant="outline" className="text-xs">لابراتوار</Badge>
                      )}
                      {rule.specialRequirements.needsComputer && (
                        <Badge variant="outline" className="text-xs">کمپیوتر</Badge>
                      )}
                      {rule.specialRequirements.needsPlayground && (
                        <Badge variant="outline" className="text-xs">میدان ورزش</Badge>
                      )}
                      {rule.specialRequirements.needsLibrary && (
                        <Badge variant="outline" className="text-xs">کتابخانه</Badge>
                      )}
                      {rule.consecutivePeriods && (
                        <Badge variant="outline" className="text-xs">متوالی</Badge>
                      )}
                    </div>
                  )}
                </div>

                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleEdit(rule)}
                    className="flex items-center gap-1"
                  >
                    <Edit className="w-3 h-3" />
                    ویرایش
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDelete(rule._id)}
                    className="flex items-center gap-1 text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="w-3 h-3" />
                    حذف
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {curriculumRules.length === 0 && !loading && (
        <div className="text-center py-12">
          <BookOpen className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">هیچ قانون مضمونی یافت نشد</h3>
          <p className="text-gray-600 mb-4">برای شروع، اولین قانون مضمون را ایجاد کنید تا برنامه درسی تنظیم شود.</p>
          <Button onClick={() => setShowForm(true)}>
            <Plus className="w-4 h-4 mr-2" />
            افزودن اولین قانون مضمون
          </Button>
        </div>
      )}
    </div>
  );
};

export default CurriculumManagement;

