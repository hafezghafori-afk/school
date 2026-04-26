import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Badge } from '../components/ui/badge';
import { Trash2, Edit, Plus, Users, GraduationCap, Eye } from 'lucide-react';
import { toast } from 'react-hot-toast';

const SchoolClassManagement = () => {
  const [classes, setClasses] = useState([]);
  const [academicYears, setAcademicYears] = useState([]);
  const [shifts, setShifts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingClass, setEditingClass] = useState(null);
  const [viewMode, setViewMode] = useState('grid'); // grid or table
  
  const [formData, setFormData] = useState({
    academicYearId: '',
    shiftId: '',
    gradeLevel: '',
    section: 'الف',
    genderType: 'mixed',
    title: '',
    titleDari: '',
    titlePashto: '',
    capacity: 30,
    classroomNumber: '',
    floor: ''
  });

  const schoolId = localStorage.getItem('schoolId') || localStorage.getItem('school_id') || localStorage.getItem('selectedSchoolId') || '';

  const gradeLevels = Array.from({length: 12}, (_, i) => i + 1);
  const sections = ['الف', 'ب', 'ج', 'د', 'ه', 'و', 'ز', 'ح', 'ط'];
  const genderTypes = [
    { value: 'male', label: 'Male', labelDari: 'ذکور' },
    { value: 'female', label: 'Female', labelDari: 'اناث' },
    { value: 'mixed', label: 'Mixed', labelDari: 'مختلط' }
  ];

  useEffect(() => {
    fetchClasses();
    fetchAcademicYears();
    fetchShifts();
  }, []);

  const fetchClasses = async () => {
    try {
      const response = await fetch(`/api/school-classes/school/${schoolId}`);
      const data = await response.json();
      
      if (data.success) {
        setClasses(data.data);
      } else {
        toast.error('Error fetching classes');
      }
    } catch (error) {
      console.error('Error fetching classes:', error);
      toast.error('Error fetching classes');
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
      }
    } catch (error) {
      console.error('Error fetching academic years:', error);
    }
  };

  const fetchShifts = async () => {
    try {
      const response = await fetch(`/api/shifts/school/${schoolId}`);
      const data = await response.json();
      
      if (data.success) {
        setShifts(data.data);
      }
    } catch (error) {
      console.error('Error fetching shifts:', error);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      const url = editingClass 
        ? `/api/school-classes/${editingClass._id}`
        : `/api/school-classes/school/${schoolId}`;
      
      const method = editingClass ? 'PUT' : 'POST';
      
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();
      
      if (data.success) {
        toast.success(editingClass ? 'Class updated successfully' : 'Class created successfully');
        setShowForm(false);
        setEditingClass(null);
        resetForm();
        fetchClasses();
      } else {
        toast.error(data.message || 'Error saving class');
      }
    } catch (error) {
      console.error('Error saving class:', error);
      toast.error('Error saving class');
    }
  };

  const handleEdit = (classItem) => {
    setEditingClass(classItem);
    setFormData({
      academicYearId: classItem.academicYearId,
      shiftId: classItem.shiftId,
      gradeLevel: classItem.gradeLevel,
      section: classItem.section,
      genderType: classItem.genderType,
      title: classItem.title,
      titleDari: classItem.titleDari,
      titlePashto: classItem.titlePashto,
      capacity: classItem.capacity,
      classroomNumber: classItem.classroomNumber,
      floor: classItem.floor
    });
    setShowForm(true);
  };

  const handleDelete = async (classId) => {
    if (!confirm('Are you sure you want to delete this class?')) return;
    
    try {
      const response = await fetch(`/api/school-classes/${classId}`, {
        method: 'DELETE',
      });

      const data = await response.json();
      
      if (data.success) {
        toast.success('Class deleted successfully');
        fetchClasses();
      } else {
        toast.error(data.message || 'Error deleting class');
      }
    } catch (error) {
      console.error('Error deleting class:', error);
      toast.error('Error deleting class');
    }
  };

  const resetForm = () => {
    setFormData({
      academicYearId: '',
      shiftId: '',
      gradeLevel: '',
      section: 'الف',
      genderType: 'mixed',
      title: '',
      titleDari: '',
      titlePashto: '',
      capacity: 30,
      classroomNumber: '',
      floor: ''
    });
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingClass(null);
    resetForm();
  };

  // Auto-generate titles when grade, section, or gender changes
  const generateTitles = (grade, section, gender) => {
    if (grade && section) {
      const genderText = gender === 'male' ? 'ذکور' : gender === 'female' ? 'اناث' : 'مختلط';
      setFormData(prev => ({
        ...prev,
        title: `Grade ${grade} - ${section}`,
        titleDari: `صنف ${grade} ${section} - ${genderText}`,
        titlePashto: `ټولګی ${grade} ${section} - ${genderText}`
      }));
    }
  };

  if (loading) {
    return <div className="flex justify-center items-center h-64">Loading...</div>;
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Class Management</h1>
          <p className="text-gray-600 mt-2">Manage school classes with Afghan structure</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setViewMode(viewMode === 'grid' ? 'table' : 'grid')}
          >
            <Eye className="w-4 h-4 mr-2" />
            {viewMode === 'grid' ? 'Table View' : 'Grid View'}
          </Button>
          <Button 
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add New Class
          </Button>
        </div>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>{editingClass ? 'Edit Class' : 'Add New Class'}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="academicYearId">Academic Year</Label>
                  <Select 
                    value={formData.academicYearId} 
                    onValueChange={(value) => setFormData({...formData, academicYearId: value})}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select academic year" />
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
                  <Label htmlFor="shiftId">Shift</Label>
                  <Select 
                    value={formData.shiftId} 
                    onValueChange={(value) => setFormData({...formData, shiftId: value})}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select shift" />
                    </SelectTrigger>
                    <SelectContent>
                      {shifts.map((shift) => (
                        <SelectItem key={shift._id} value={shift._id}>
                          {shift.name} ({shift.nameDari})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="gradeLevel">Grade Level</Label>
                  <Select 
                    value={formData.gradeLevel} 
                    onValueChange={(value) => {
                      setFormData({...formData, gradeLevel: parseInt(value)});
                      generateTitles(parseInt(value), formData.section, formData.genderType);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select grade" />
                    </SelectTrigger>
                    <SelectContent>
                      {gradeLevels.map((grade) => (
                        <SelectItem key={grade} value={grade.toString()}>
                          Grade {grade}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="section">Section</Label>
                  <Select 
                    value={formData.section} 
                    onValueChange={(value) => {
                      setFormData({...formData, section: value});
                      generateTitles(formData.gradeLevel, value, formData.genderType);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select section" />
                    </SelectTrigger>
                    <SelectContent>
                      {sections.map((section) => (
                        <SelectItem key={section} value={section}>
                          {section}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="genderType">Gender Type</Label>
                  <Select 
                    value={formData.genderType} 
                    onValueChange={(value) => {
                      setFormData({...formData, genderType: value});
                      generateTitles(formData.gradeLevel, formData.section, value);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select gender type" />
                    </SelectTrigger>
                    <SelectContent>
                      {genderTypes.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label} ({type.labelDari})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="capacity">Capacity</Label>
                  <Input
                    id="capacity"
                    type="number"
                    min="1"
                    max="100"
                    value={formData.capacity}
                    onChange={(e) => setFormData({...formData, capacity: parseInt(e.target.value)})}
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="classroomNumber">Classroom Number</Label>
                  <Input
                    id="classroomNumber"
                    value={formData.classroomNumber}
                    onChange={(e) => setFormData({...formData, classroomNumber: e.target.value})}
                    placeholder="e.g., 101, A-201"
                  />
                </div>

                <div>
                  <Label htmlFor="floor">Floor</Label>
                  <Input
                    id="floor"
                    value={formData.floor}
                    onChange={(e) => setFormData({...formData, floor: e.target.value})}
                    placeholder="e.g., Ground, 1st, 2nd"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="title">Title (English)</Label>
                  <Input
                    id="title"
                    value={formData.title}
                    onChange={(e) => setFormData({...formData, title: e.target.value})}
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="titleDari">Title (Dari)</Label>
                  <Input
                    id="titleDari"
                    value={formData.titleDari}
                    onChange={(e) => setFormData({...formData, titleDari: e.target.value})}
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="titlePashto">Title (Pashto)</Label>
                  <Input
                    id="titlePashto"
                    value={formData.titlePashto}
                    onChange={(e) => setFormData({...formData, titlePashto: e.target.value})}
                    required
                  />
                </div>
              </div>

              <div className="flex gap-2">
                <Button type="submit">
                  {editingClass ? 'Update Class' : 'Create Class'}
                </Button>
                <Button type="button" variant="outline" onClick={handleCancel}>
                  Cancel
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {/* Grid View */}
      {viewMode === 'grid' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {classes.map((classItem) => (
            <Card key={classItem._id} className="hover:shadow-lg transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                  <div>
                    <CardTitle className="text-lg">{classItem.title}</CardTitle>
                    <div className="text-sm text-gray-600 mt-1">
                      {classItem.titleDari}
                    </div>
                  </div>
                  <Badge variant={classItem.status === 'active' ? "default" : "secondary"}>
                    {classItem.status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center gap-2 text-sm">
                  <GraduationCap className="w-4 h-4 text-gray-500" />
                  <span>Grade {classItem.gradeLevel} - {classItem.section}</span>
                </div>
                
                <div className="flex items-center gap-2 text-sm">
                  <Users className="w-4 h-4 text-gray-500" />
                  <span>{classItem.currentStudents || 0}/{classItem.capacity} students</span>
                </div>

                <div className="text-sm text-gray-600">
                  <div>Gender: {classItem.genderType}</div>
                  {classItem.classroomNumber && <div>Room: {classItem.classroomNumber}</div>}
                  {classItem.floor && <div>Floor: {classItem.floor}</div>}
                </div>

                <div className="flex gap-2 pt-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleEdit(classItem)}
                    className="flex items-center gap-1"
                  >
                    <Edit className="w-3 h-3" />
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDelete(classItem._id)}
                    className="flex items-center gap-1 text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="w-3 h-3" />
                    Delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Table View */}
      {viewMode === 'table' && (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Class
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Grade
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Section
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Gender
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Shift
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Students
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Room
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {classes.map((classItem) => (
                    <tr key={classItem._id}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-gray-900">{classItem.title}</div>
                          <div className="text-sm text-gray-500">{classItem.titleDari}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {classItem.gradeLevel}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {classItem.section}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        <Badge variant="outline">
                          {classItem.genderType}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {/* Shift name would be populated */}
                        -
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {classItem.currentStudents || 0}/{classItem.capacity}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {classItem.classroomNumber || '-'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleEdit(classItem)}
                          >
                            <Edit className="w-3 h-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDelete(classItem._id)}
                            className="text-red-600 hover:text-red-700"
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {classes.length === 0 && !loading && (
        <div className="text-center py-12">
          <Users className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No classes found</h3>
          <p className="text-gray-600 mb-4">Create your first class to get started with timetable management.</p>
          <Button onClick={() => setShowForm(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Add First Class
          </Button>
        </div>
      )}
    </div>
  );
};

export default SchoolClassManagement;

