import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Badge } from '../components/ui/badge';
import { 
  Users, 
  Search, 
  Filter, 
  Plus, 
  Eye, 
  Edit, 
  Trash2, 
  Download,
  RefreshCw,
  Calendar,
  Phone,
  Mail,
  MapPin,
  BookOpen,
  UserPlus
} from "../components/ui/icons";
import { useToast } from "../components/ui/toast";
import { formatAfghanDateTime } from '../utils/afghanDate';

const StudentManagement = () => {
  const toast = useToast();
  const [students, setStudents] = useState([]);
  const [filteredStudents, setFilteredStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [showDetails, setShowDetails] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [filters, setFilters] = useState({
    academicYearId: '',
    classId: '',
    shiftId: '',
    gender: '',
    status: '',
    search: ''
  });
  
  const [academicYears, setAcademicYears] = useState([]);
  const [classes, setClasses] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [actionLoading, setActionLoading] = useState(null);

  const schoolId = localStorage.getItem('schoolId') || localStorage.getItem('school_id') || localStorage.getItem('selectedSchoolId') || '';

  const statusOptions = [
    { value: 'active', label: 'فعال', color: 'bg-green-100 text-green-800' },
    { value: 'inactive', label: 'غیرفعال', color: 'bg-gray-100 text-gray-800' },
    { value: 'graduated', label: 'فارغ‌التحصیل', color: 'bg-blue-100 text-blue-800' },
    { value: 'transferred', label: 'انتقال‌شده', color: 'bg-yellow-100 text-yellow-800' },
    { value: 'suspended', label: 'معلق', color: 'bg-red-100 text-red-800' }
  ];

  useEffect(() => {
    fetchStudents();
    fetchAcademicYears();
    fetchClasses();
    fetchShifts();
  }, []);

  useEffect(() => {
    applyFilters();
  }, [students, filters]);

  const fetchStudents = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/students/school/${schoolId}`);
      const data = await response.json();
      
      if (data.success) {
        setStudents(data.data);
      } else {
        // اگر API ناموفق بود، از داده‌های نمونه استفاده کن
        const mockData = [
          {
            _id: '1',
            firstName: 'علی',
            lastName: 'احمدی',
            fatherName: 'رحیم',
            nationalId: '123456789',
            phone: '0771234567',
            email: 'ali@example.com',
            gender: 'male',
            status: 'active',
            province: 'کابل',
            classId: { _id: 'class1', title: 'صنف ۱۰ الف' },
            academicYearId: { _id: 'year1', title: '1403-1404' },
            shiftId: { _id: 'shift1', name: 'صبح' },
            previousSchool: '',
            previousGrade: '',
            createdAt: new Date().toISOString()
          },
          {
            _id: '2',
            firstName: 'فاطمه',
            lastName: 'محمدی',
            fatherName: 'حسین',
            nationalId: '987654321',
            phone: '0779876543',
            email: 'fatima@example.com',
            gender: 'female',
            status: 'active',
            province: 'کابل',
            classId: { _id: 'class2', title: 'صنف ۱۰ ب' },
            academicYearId: { _id: 'year1', title: '1403-1404' },
            shiftId: { _id: 'shift2', name: 'عصر' },
            previousSchool: '',
            previousGrade: '',
            createdAt: new Date().toISOString()
          }
        ];
        setStudents(mockData);
      }
    } catch (error) {
      console.error('Error fetching students:', error);
      // در صورت خطا نیز، از داده‌های نمونه استفاده کن
      const mockData = [
        {
          _id: '1',
          firstName: 'علی',
          lastName: 'احمدی',
          fatherName: 'رحیم',
          nationalId: '123456789',
          phone: '0771234567',
          email: 'ali@example.com',
          gender: 'male',
          status: 'active',
          province: 'کابل',
          classId: { _id: 'class1', title: 'صنف ۱۰ الف' },
          academicYearId: { _id: 'year1', title: '1403-1404' },
          shiftId: { _id: 'shift1', name: 'صبح' },
          previousSchool: '',
          previousGrade: '',
          createdAt: new Date().toISOString()
        }
      ];
      setStudents(mockData);
    } finally {
      setLoading(false);
    }
  };

  const fetchAcademicYears = async () => {
    try {
      const response = await fetch(`/api/academic-years/school/${schoolId}`);
      const data = await response.json();
      
      if (data.success) {
        setAcademicYears(data.data.filter(year => year.status === 'active'));
      } else {
        setAcademicYears([
            // داده‌های نمونه
          { _id: 'year1', title: '1403-1404', status: 'active' },
          { _id: 'year2', title: '1404-1405', status: 'active' }
        ]);
      }
    } catch (error) {
      console.error('Error fetching academic years:', error);
        // داده‌های نمونه
      setAcademicYears([
        { _id: 'year1', title: '1403-1404', status: 'active' }
      ]);
    }
  };

  const fetchClasses = async () => {
    try {
      const response = await fetch(`/api/school-classes/school/${schoolId}`);
      const data = await response.json();
      
      if (data.success) {
        setClasses(data.data);
      } else {
        setClasses([
            // داده‌های نمونه
          { _id: 'class1', title: 'صنف ۱۰ الف' },
          { _id: 'class2', title: 'صنف ۱۰ ب' },
          { _id: 'class3', title: 'صنف ۱۱ الف' }
        ]);
      }
    } catch (error) {
      console.error('Error fetching classes:', error);
        // داده‌های نمونه
      setClasses([
        { _id: 'class1', title: 'صنف ۱۰ الف' },
        { _id: 'class2', title: 'صنف ۱۰ ب' }
      ]);
    }
  };

  const fetchShifts = async () => {
    try {
      const response = await fetch(`/api/shifts/school/${schoolId}`);
      const data = await response.json();
      
      if (data.success) {
        setShifts(data.data);
      } else {
        setShifts([
            // داده‌های نمونه
          { _id: 'shift1', name: 'صبح' },
          { _id: 'shift2', name: 'عصر' }
        ]);
      }
    } catch (error) {
      console.error('Error fetching shifts:', error);
        // داده‌های نمونه
      setShifts([
        { _id: 'shift1', name: 'صبح' },
        { _id: 'shift2', name: 'عصر' }
      ]);
    }
  };

  const applyFilters = () => {
    let filtered = [...students];

    // فیلتر بر اساس سال تعلیمی
    if (filters.academicYearId) {
      filtered = filtered.filter(student => student.academicYearId?._id === filters.academicYearId);
    }

    // فیلتر بر اساس صنف
    if (filters.classId) {
      filtered = filtered.filter(student => student.classId?._id === filters.classId);
    }

    // فیلتر بر اساس نوبت
    if (filters.shiftId) {
      filtered = filtered.filter(student => student.shiftId?._id === filters.shiftId);
    }

    // فیلتر بر اساس جنسیت
    if (filters.gender) {
      filtered = filtered.filter(student => student.gender === filters.gender);
    }

    // فیلتر بر اساس وضعیت
    if (filters.status) {
      filtered = filtered.filter(student => student.status === filters.status);
    }

    // جستجو
    if (filters.search) {
      const searchLower = filters.search.toLowerCase();
      filtered = filtered.filter(student => 
        student.firstName?.toLowerCase().includes(searchLower) ||
        student.lastName?.toLowerCase().includes(searchLower) ||
        student.fatherName?.toLowerCase().includes(searchLower) ||
        student.nationalId?.toLowerCase().includes(searchLower) ||
        student.phone?.toLowerCase().includes(searchLower) ||
        student.email?.toLowerCase().includes(searchLower)
      );
    }

    setFilteredStudents(filtered);
  };

  const handleDelete = async (studentId) => {
    if (!confirm('آیا از حذف این شاگرد مطمئن هستید؟')) return;

    setActionLoading(studentId);
    try {
      const response = await fetch(`/api/students/${studentId}`, {
        method: 'DELETE',
      });

      const data = await response.json();
      
      if (data.success) {
        toast.success('شاگرد با موفقیت حذف شد.');
        fetchStudents();
      } else {
        toast.error(data.message || 'حذف شاگرد ناموفق بود.');
      }
    } catch (error) {
      console.error('Error deleting student:', error);
      toast.error('حذف شاگرد ناموفق بود.');
    } finally {
      setActionLoading(null);
    }
  };

  const handleViewDetails = (student) => {
    setSelectedStudent(student);
    setShowDetails(true);
  };

  const handleEdit = (student) => {
    setSelectedStudent(student);
    setShowEdit(true);
  };

  const getStatusColor = (status) => {
    const statusOption = statusOptions.find(opt => opt.value === status);
    return statusOption ? statusOption.color : 'bg-gray-100 text-gray-800';
  };

  const getStatusLabel = (status) => {
    const statusOption = statusOptions.find(opt => opt.value === status);
    return statusOption ? statusOption.label : status;
  };

  const formatDate = (dateString) => {
    return formatAfghanDateTime(dateString, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }) || 'N/A';
  };

  const exportToExcel = () => {
    toast.info('خروجی اکسل در نسخه بعدی اضافه می‌شود.');
  };

  if (loading) {
    return <div className="flex justify-center items-center h-64">در حال بارگذاری...</div>;
  }

  return (
    <div className="container mx-auto p-4 space-y-4 max-w-7xl">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">مدیریت شاگردان</h1>
          <p className="text-gray-600 mt-1">نمایش، جستجو و مدیریت شاگردان مکتب</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm">
            <Download className="w-3 h-3 mr-1" />
خروجی Excel
          </Button>
          <Button size="sm" onClick={() => window.location.href = '/student-registration'}>
            <UserPlus className="w-3 h-3 mr-1" />
ثبت شاگرد جدید
          </Button>
        </div>
      </div>

      {/* آمار */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-600">کل شاگردان</p>
                <p className="text-lg font-bold">{students.length}</p>
              </div>
              <Users className="w-6 h-6 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-600">شاگردان فعال</p>
                <p className="text-lg font-bold text-green-600">
                  {students.filter(s => s.status === 'active').length}
                </p>
              </div>
              <Users className="w-6 h-6 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-600">پسران</p>
                <p className="text-lg font-bold text-blue-600">
                  {students.filter(s => s.gender === 'male').length}
                </p>
              </div>
              <Users className="w-6 h-6 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-gray-600">دختران</p>
                <p className="text-lg font-bold text-pink-600">
                  {students.filter(s => s.gender === 'female').length}
                </p>
              </div>
              <Users className="w-6 h-6 text-pink-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* فیلترها */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Filter className="w-4 h-4" />
            فیلترها
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            <div>
              <Label htmlFor="academicYearId">سال تعلیمی</Label>
              <Select value={filters.academicYearId} onValueChange={(value) => setFilters(prev => ({ ...prev, academicYearId: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="انتخاب سال تعلیمی" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">انتخاب سال تعلیمی</SelectItem>
                  {academicYears.map(year => (
                    <SelectItem key={year._id} value={year._id}>{year.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="classId">صنف</Label>
              <Select value={filters.classId} onValueChange={(value) => setFilters(prev => ({ ...prev, classId: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="انتخاب صنف" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">انتخاب صنف</SelectItem>
                  {classes.map(cls => (
                    <SelectItem key={cls._id} value={cls._id}>{cls.title}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="shiftId">نوبت</Label>
              <Select value={filters.shiftId} onValueChange={(value) => setFilters(prev => ({ ...prev, shiftId: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="انتخاب نوبت" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">انتخاب نوبت</SelectItem>
                  {shifts.map(shift => (
                    <SelectItem key={shift._id} value={shift._id}>{shift.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="gender">جنسیت</Label>
              <Select value={filters.gender} onValueChange={(value) => setFilters(prev => ({ ...prev, gender: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="انتخاب" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">انتخاب</SelectItem>
                  <SelectItem value="male">ذکور</SelectItem>
                  <SelectItem value="female">اناث</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="status">وضعیت</Label>
              <Select value={filters.status} onValueChange={(value) => setFilters(prev => ({ ...prev, status: value }))}>
                <SelectTrigger>
                  <SelectValue placeholder="انتخاب وضعیت" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">انتخاب وضعیت</SelectItem>
                  {statusOptions.map(option => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="search">جستجو</Label>
              <div className="relative">
                <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 text-gray-400 w-3 h-3" />
                <Input
                  id="search"
                  placeholder="جستجو بر اساس نام یا شماره..."
                  value={filters.search}
                  onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                  className="pl-8"
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* لیست شاگردان */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between text-base">
            <span className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              لیست شاگردان ({filteredStudents.length})
            </span>
            <Button variant="outline" size="sm" onClick={fetchStudents}>
              <RefreshCw className="w-3 h-3 mr-1" />
              بروزرسانی
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filteredStudents.length === 0 ? (
            <div className="text-center py-8">
              <Users className="w-8 h-8 text-gray-400 mx-auto mb-3" />
              <h3 className="text-base font-medium text-gray-900 mb-2">هیچ شاگردی یافت نشد</h3>
              <p className="text-sm text-gray-600">
                {students.length === 0 
                  ? 'هنوز هیچ شاگردی ثبت نشده است.' 
                  : 'با فیلترهای فعلی شاگردی پیدا نشد.'}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {filteredStudents.map((student) => (
                <div key={student._id} className="border rounded-lg p-3 hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                      
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-semibold text-sm">
                            {student.firstName} {student.lastName}
                          </span>
                          <Badge className={getStatusColor(student.status)}>
                            {getStatusLabel(student.status)}
                          </Badge>
                          <Badge variant="outline">
                            {student.gender === 'male' ? 'ذکور' : 'اناث'}
                          </Badge>
                        </div>
                        
                        <div className="flex items-center gap-3 text-xs text-gray-600">
                          <span>نمبر تذکره: {student.nationalId}</span>
                          <span>صنف: {student.classId?.title}</span>
                          <span>نوبت: {student.shiftId?.name}</span>
                          <span>سال تعلیمی: {student.academicYearId?.title}</span>
                          <span>تاریخ ثبت: {formatDate(student.createdAt)}</span>
                        </div>

                        <div className="flex items-center gap-3 text-xs text-gray-500 mt-1">
                          <span className="flex items-center gap-1">
                            <Phone className="w-3 h-3" />
                            {student.phone}
                          </span>
                          {student.email && (
                            <span className="flex items-center gap-1">
                              <Mail className="w-3 h-3" />
                              {student.email}
                            </span>
                          )}
                          <span className="flex items-center gap-1">
                            <MapPin className="w-3 h-3" />
                            {student.province}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleViewDetails(student)}
                      >
                        <Eye className="w-3 h-3 mr-1" />
                        جزئیات
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleEdit(student)}
                      >
                        <Edit className="w-3 h-3 mr-1" />
                        ویرایش
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleDelete(student._id)}
                        disabled={actionLoading === student._id}
                      >
                        <Trash2 className="w-3 h-3 mr-1" />
                        {actionLoading === student._id ? 'در حال حذف...' : 'حذف'}
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* جزئیات شاگرد */}
      {showDetails && selectedStudent && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-lg max-w-4xl w-full max-h-[90vh] overflow-auto p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">جزئیات شاگرد</h3>
              <Button variant="outline" onClick={() => setShowDetails(false)}>
                <X className="w-4 h-4" />
              </Button>
            </div>
            
            <div className="space-y-6">
              <div>
              {/* معلومات شخصی */}
                                <h4 className="font-semibold mb-2">معلومات شخصی</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><strong>نام:</strong> {selectedStudent.firstName} {selectedStudent.lastName}</div>
                  <div><strong>نام پدر:</strong> {selectedStudent.fatherName}</div>
                  <div><strong>نام پدرکلان:</strong> {selectedStudent.grandfatherName}</div>
                  <div><strong>شماره تذکره:</strong> {selectedStudent.nationalId}</div>
                  <div><strong>تاریخ تولد:</strong> {selectedStudent.birthDate}</div>
                  <div><strong>جنسیت:</strong> {selectedStudent.gender === 'male' ? 'ذکور' : 'اناث'}</div>
                  <div><strong>گروپ خونی:</strong> {selectedStudent.bloodType}</div>
                  <div><strong>وضعیت:</strong> <Badge className={getStatusColor(selectedStudent.status)}>{getStatusLabel(selectedStudent.status)}</Badge></div>
                </div>
              </div>

              <div>
              {/* معلومات تماس */}
                                <h4 className="font-semibold mb-2">معلومات تماس</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><strong>شماره تماس:</strong> {selectedStudent.phone}</div>
                  <div><strong>ایمیل:</strong> {selectedStudent.email}</div>
                  <div><strong>آدرس:</strong> {selectedStudent.address}</div>
                  <div><strong>شهر:</strong> {selectedStudent.city}</div>
                  <div><strong>ولایت:</strong> {selectedStudent.province}</div>
                </div>
              </div>

              <div>
              {/* معلومات تعلیمی */}
                                <h4 className="font-semibold mb-2">معلومات تعلیمی</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><strong>صنف:</strong> {selectedStudent.classId?.title}</div>
                  <div><strong>سال تعلیمی:</strong> {selectedStudent.academicYearId?.title}</div>
                  <div><strong>نوبت:</strong> {selectedStudent.shiftId?.name}</div>
                  <div><strong>مکتب قبلی:</strong> {selectedStudent.previousSchool}</div>
                  <div><strong>صنف قبلی:</strong> {selectedStudent.previousGrade}</div>
                  <div><strong>تاریخ ثبت:</strong> {formatDate(selectedStudent.createdAt)}</div>
                </div>
              </div>

              <div>
              {/* معلومات خانوادگی */}
                                <h4 className="font-semibold mb-2">معلومات خانوادگی</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><strong>نام پدر:</strong> {selectedStudent.fatherName}</div>
                  <div><strong>شماره تماس پدر:</strong> {selectedStudent.fatherPhone}</div>
                  <div><strong>مسلک پدر:</strong> {selectedStudent.fatherOccupation}</div>
                  <div><strong>نام مادر:</strong> {selectedStudent.motherName}</div>
                  <div><strong>شماره تماس مادر:</strong> {selectedStudent.motherPhone}</div>
                  <div><strong>مسلک مادر:</strong> {selectedStudent.motherOccupation}</div>
                </div>
              </div>

              <div>
              {/* معلومات صحی */}
                                <h4 className="font-semibold mb-2">معلومات صحی</h4>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div><strong>حالات صحی:</strong> {selectedStudent.medicalConditions}</div>
                  <div><strong>حساسیت‌ها:</strong> {selectedStudent.allergies}</div>
                  <div><strong>تماس اضطراری:</strong> {selectedStudent.emergencyContact}</div>
                  <div><strong>شماره اضطراری:</strong> {selectedStudent.emergencyPhone}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default StudentManagement;

