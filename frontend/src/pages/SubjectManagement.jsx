import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '../components/ui/select';
import { Checkbox } from '../components/ui/checkbox';
import { Badge } from '../components/ui/badge';
import { Trash2, Edit, Plus, BookOpen, Beaker, Monitor, Dumbbell } from 'lucide-react';
import { toast } from 'react-hot-toast';

const SubjectManagement = () => {
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingSubject, setEditingSubject] = useState(null);
  const [viewMode, setViewMode] = useState('grid'); // grid or table
  
  const [formData, setFormData] = useState({
    code: '',
    name: '',
    nameDari: '',
    namePashto: '',
    category: 'core',
    subjectType: 'theoretical',
    ministryCode: '',
    gradeLevels: [],
    weeklyHours: 1,
    credits: 1,
    isPractical: false,
    requiresLab: false,
    requiresComputer: false,
    description: ''
  });

  const schoolId = localStorage.getItem('schoolId') || localStorage.getItem('school_id') || localStorage.getItem('selectedSchoolId') || '';

  const categories = [
    { value: 'core', label: 'Core', labelDari: 'اساسی' },
    { value: 'elective', label: 'Elective', labelDari: 'اختیاری' },
    { value: 'practical', label: 'Practical', labelDari: 'عملی' },
    { value: 'religious', label: 'Religious', labelDari: 'دینی' },
    { value: 'language', label: 'Language', labelDari: 'زبان' }
  ];

  const subjectTypes = [
    { value: 'theoretical', label: 'Theoretical', labelDari: 'نظری' },
    { value: 'practical', label: 'Practical', labelDari: 'عملی' },
    { value: 'theoretical_practical', label: 'Mixed', labelDari: 'نظری-عملی' }
  ];

  const gradeLevels = Array.from({length: 12}, (_, i) => i + 1);

  useEffect(() => {
    fetchSubjects();
  }, []);

  const fetchSubjects = async () => {
    try {
      const response = await fetch(`/api/subjects/school/${schoolId}`);
      const data = await response.json();
      
      if (data.success) {
        setSubjects(data.data);
      } else {
        toast.error('Error fetching subjects');
      }
    } catch (error) {
      console.error('Error fetching subjects:', error);
      toast.error('Error fetching subjects');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    try {
      const url = editingSubject 
        ? `/api/subjects/${editingSubject._id}`
        : `/api/subjects/school/${schoolId}`;
      
      const method = editingSubject ? 'PUT' : 'POST';
      
      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();
      
      if (data.success) {
        toast.success(editingSubject ? 'Subject updated successfully' : 'Subject created successfully');
        setShowForm(false);
        setEditingSubject(null);
        resetForm();
        fetchSubjects();
      } else {
        toast.error(data.message || 'Error saving subject');
      }
    } catch (error) {
      console.error('Error saving subject:', error);
      toast.error('Error saving subject');
    }
  };

  const handleEdit = (subject) => {
    setEditingSubject(subject);
    setFormData({
      code: subject.code,
      name: subject.name,
      nameDari: subject.nameDari,
      namePashto: subject.namePashto,
      category: subject.category,
      subjectType: subject.subjectType,
      ministryCode: subject.ministryCode,
      gradeLevels: subject.gradeLevels || [],
      weeklyHours: subject.weeklyHours,
      credits: subject.credits,
      isPractical: subject.isPractical,
      requiresLab: subject.requiresLab,
      requiresComputer: subject.requiresComputer,
      description: subject.description
    });
    setShowForm(true);
  };

  const handleDelete = async (subjectId) => {
    if (!confirm('Are you sure you want to delete this subject?')) return;
    
    try {
      const response = await fetch(`/api/subjects/${subjectId}`, {
        method: 'DELETE',
      });

      const data = await response.json();
      
      if (data.success) {
        toast.success('Subject deleted successfully');
        fetchSubjects();
      } else {
        toast.error(data.message || 'Error deleting subject');
      }
    } catch (error) {
      console.error('Error deleting subject:', error);
      toast.error('Error deleting subject');
    }
  };

  const handleGradeLevelChange = (grade, checked) => {
    setFormData(prev => ({
      ...prev,
      gradeLevels: checked 
        ? [...prev.gradeLevels, grade]
        : prev.gradeLevels.filter(g => g !== grade)
    }));
  };

  const resetForm = () => {
    setFormData({
      code: '',
      name: '',
      nameDari: '',
      namePashto: '',
      category: 'core',
      subjectType: 'theoretical',
      ministryCode: '',
      gradeLevels: [],
      weeklyHours: 1,
      credits: 1,
      isPractical: false,
      requiresLab: false,
      requiresComputer: false,
      description: ''
    });
  };

  const handleCancel = () => {
    setShowForm(false);
    setEditingSubject(null);
    resetForm();
  };

  const getCategoryIcon = (category) => {
    switch (category) {
      case 'practical':
        return <Beaker className="w-4 h-4" />;
      case 'religious':
        return <BookOpen className="w-4 h-4" />;
      case 'language':
        return <BookOpen className="w-4 h-4" />;
      default:
        return <BookOpen className="w-4 h-4" />;
    }
  };

  const getCategoryColor = (category) => {
    switch (category) {
      case 'core':
        return 'bg-blue-100 text-blue-800';
      case 'elective':
        return 'bg-green-100 text-green-800';
      case 'practical':
        return 'bg-purple-100 text-purple-800';
      case 'religious':
        return 'bg-yellow-100 text-yellow-800';
      case 'language':
        return 'bg-pink-100 text-pink-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  if (loading) {
    return <div className="flex justify-center items-center h-64">Loading...</div>;
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-gray-900">Subject Management</h1>
          <p className="text-gray-600 mt-2">Manage school subjects with multilingual support</p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => setViewMode(viewMode === 'grid' ? 'table' : 'grid')}
          >
            {viewMode === 'grid' ? 'Table View' : 'Grid View'}
          </Button>
          <Button 
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2"
          >
            <Plus className="w-4 h-4" />
            Add New Subject
          </Button>
        </div>
      </div>

      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>{editingSubject ? 'Edit Subject' : 'Add New Subject'}</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="code">Subject Code</Label>
                  <Input
                    id="code"
                    value={formData.code}
                    onChange={(e) => setFormData({...formData, code: e.target.value.toUpperCase()})}
                    placeholder="e.g., MATH-01, SCI-07"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="ministryCode">Ministry Code</Label>
                  <Input
                    id="ministryCode"
                    value={formData.ministryCode}
                    onChange={(e) => setFormData({...formData, ministryCode: e.target.value})}
                    placeholder="Official ministry code (optional)"
                  />
                </div>

                <div>
                  <Label htmlFor="category">Category</Label>
                  <Select 
                    value={formData.category} 
                    onValueChange={(value) => setFormData({...formData, category: value})}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      {categories.map((category) => (
                        <SelectItem key={category.value} value={category.value}>
                          {category.label} ({category.labelDari})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="subjectType">Subject Type</Label>
                  <Select 
                    value={formData.subjectType} 
                    onValueChange={(value) => setFormData({...formData, subjectType: value})}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      {subjectTypes.map((type) => (
                        <SelectItem key={type.value} value={type.value}>
                          {type.label} ({type.labelDari})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="weeklyHours">Weekly Hours</Label>
                  <Input
                    id="weeklyHours"
                    type="number"
                    min="1"
                    max="10"
                    value={formData.weeklyHours}
                    onChange={(e) => setFormData({...formData, weeklyHours: parseInt(e.target.value)})}
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="credits">Credits</Label>
                  <Input
                    id="credits"
                    type="number"
                    min="1"
                    max="10"
                    value={formData.credits}
                    onChange={(e) => setFormData({...formData, credits: parseInt(e.target.value)})}
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label htmlFor="name">Subject Name (English)</Label>
                  <Input
                    id="name"
                    value={formData.name}
                    onChange={(e) => setFormData({...formData, name: e.target.value})}
                    placeholder="e.g., Mathematics"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="nameDari">Subject Name (Dari)</Label>
                  <Input
                    id="nameDari"
                    value={formData.nameDari}
                    onChange={(e) => setFormData({...formData, nameDari: e.target.value})}
                    placeholder="ریاضی"
                    required
                  />
                </div>

                <div>
                  <Label htmlFor="namePashto">Subject Name (Pashto)</Label>
                  <Input
                    id="namePashto"
                    value={formData.namePashto}
                    onChange={(e) => setFormData({...formData, namePashto: e.target.value})}
                    placeholder="ریاضیات"
                    required
                  />
                </div>
              </div>

              <div>
                <Label>Grade Levels</Label>
                <div className="grid grid-cols-4 md:grid-cols-6 gap-3 mt-2">
                  {gradeLevels.map((grade) => (
                    <div key={grade} className="flex items-center space-x-2">
                      <Checkbox
                        id={`grade-${grade}`}
                        checked={formData.gradeLevels.includes(grade)}
                        onCheckedChange={(checked) => handleGradeLevelChange(grade, checked)}
                      />
                      <Label htmlFor={`grade-${grade}`} className="text-sm">
                        Grade {grade}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <Label>Special Requirements</Label>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-2">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="isPractical"
                      checked={formData.isPractical}
                      onCheckedChange={(checked) => setFormData({...formData, isPractical: checked})}
                    />
                    <Label htmlFor="isPractical" className="text-sm">
                      Practical Subject
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="requiresLab"
                      checked={formData.requiresLab}
                      onCheckedChange={(checked) => setFormData({...formData, requiresLab: checked})}
                    />
                    <Label htmlFor="requiresLab" className="text-sm">
                      <Beaker className="w-4 h-4 inline mr-1" />
                      Requires Lab
                    </Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="requiresComputer"
                      checked={formData.requiresComputer}
                      onCheckedChange={(checked) => setFormData({...formData, requiresComputer: checked})}
                    />
                    <Label htmlFor="requiresComputer" className="text-sm">
                      <Monitor className="w-4 h-4 inline mr-1" />
                      Requires Computer
                    </Label>
                  </div>
                </div>
              </div>

              <div>
                <Label htmlFor="description">Description</Label>
                <Input
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  placeholder="Optional description"
                />
              </div>

              <div className="flex gap-2">
                <Button type="submit">
                  {editingSubject ? 'Update Subject' : 'Create Subject'}
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
          {subjects.map((subject) => (
            <Card key={subject._id} className="hover:shadow-lg transition-shadow">
              <CardHeader className="pb-3">
                <div className="flex justify-between items-start">
                  <div className="flex items-center gap-2">
                    {getCategoryIcon(subject.category)}
                    <div>
                      <CardTitle className="text-lg">{subject.name}</CardTitle>
                      <div className="text-sm text-gray-600">
                        {subject.nameDari}
                      </div>
                    </div>
                  </div>
                  <Badge className={getCategoryColor(subject.category)}>
                    {subject.category}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Code:</span>
                  <span className="font-medium">{subject.code}</span>
                </div>
                
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Weekly Hours:</span>
                  <span className="font-medium">{subject.weeklyHours}</span>
                </div>

                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">Credits:</span>
                  <span className="font-medium">{subject.credits}</span>
                </div>

                <div className="flex flex-wrap gap-1">
                  {subject.requiresLab && (
                    <Badge variant="outline" className="text-xs">
                      <Beaker className="w-3 h-3 mr-1" />
                      Lab
                    </Badge>
                  )}
                  {subject.requiresComputer && (
                    <Badge variant="outline" className="text-xs">
                      <Monitor className="w-3 h-3 mr-1" />
                      Computer
                    </Badge>
                  )}
                  {subject.isPractical && (
                    <Badge variant="outline" className="text-xs">
                      <Dumbbell className="w-3 h-3 mr-1" />
                      Practical
                    </Badge>
                  )}
                </div>

                <div className="text-sm text-gray-600">
                  Grades: {subject.gradeLevels?.length ? subject.gradeLevels.join(', ') : 'All'}
                </div>

                <div className="flex gap-2 pt-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleEdit(subject)}
                    className="flex items-center gap-1"
                  >
                    <Edit className="w-3 h-3" />
                    Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleDelete(subject._id)}
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
                      Subject
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Code
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Category
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Type
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Hours
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Credits
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Requirements
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {subjects.map((subject) => (
                    <tr key={subject._id}>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div>
                          <div className="text-sm font-medium text-gray-900">{subject.name}</div>
                          <div className="text-sm text-gray-500">{subject.nameDari}</div>
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {subject.code}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <Badge className={getCategoryColor(subject.category)}>
                          {subject.category}
                        </Badge>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {subject.subjectType}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {subject.weeklyHours}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {subject.credits}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <div className="flex flex-wrap gap-1">
                          {subject.requiresLab && (
                            <Badge variant="outline" className="text-xs">
                              Lab
                            </Badge>
                          )}
                          {subject.requiresComputer && (
                            <Badge variant="outline" className="text-xs">
                              Computer
                            </Badge>
                          )}
                          {subject.isPractical && (
                            <Badge variant="outline" className="text-xs">
                              Practical
                            </Badge>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleEdit(subject)}
                          >
                            <Edit className="w-3 h-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => handleDelete(subject._id)}
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

      {subjects.length === 0 && !loading && (
        <div className="text-center py-12">
          <BookOpen className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900 mb-2">No subjects found</h3>
          <p className="text-gray-600 mb-4">Create your first subject to get started with curriculum management.</p>
          <Button onClick={() => setShowForm(true)}>
            <Plus className="w-4 h-4 mr-2" />
            Add First Subject
          </Button>
        </div>
      )}
    </div>
  );
};

export default SubjectManagement;

