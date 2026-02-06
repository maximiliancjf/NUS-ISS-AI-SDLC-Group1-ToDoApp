'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

type Priority = 'high' | 'medium' | 'low';

interface Subtask {
  id: number;
  todo_id: number;
  title: string;
  completed: number;
  position: number;
}

interface Tag {
  id: number;
  user_id: number;
  name: string;
  color: string;
}

interface Template {
  id: number;
  user_id: number;
  name: string;
  category: string | null;
  due_date_offset: number;
  priority: Priority;
  subtasks_json: string | null;
  tag_ids_json: string | null;
  created_at: string;
}

interface Todo {
  id: number;
  title: string;
  due_date: string;
  priority: Priority;
  completed: number;
  completed_at: string | null;
  subtasks: Subtask[];
  tags: Tag[];
  recurrence_pattern?: string | null;
  reminder_minutes?: number | null;
}

export default function TodoApp() {
  const router = useRouter();
  const [todos, setTodos] = useState<Todo[]>([]);
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedTodos, setExpandedTodos] = useState<Set<number>>(new Set());
  const [newSubtaskTitle, setNewSubtaskTitle] = useState<{ [key: number]: string }>({});
  const [addingSubtaskTo, setAddingSubtaskTo] = useState<number | null>(null);
  const [tags, setTags] = useState<Tag[]>([]);
  const [showTagModal, setShowTagModal] = useState(false);
  const [newTagName, setNewTagName] = useState('');
  const [selectedTags, setSelectedTags] = useState<number[]>([]);
  const [filterTag, setFilterTag] = useState<number | null>(null);
  const [searchText, setSearchText] = useState('');
  const [priorityFilter, setPriorityFilter] = useState<Priority | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'completed'>('all');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [recurrence, setRecurrence] = useState<string>('');
  const [templates, setTemplates] = useState<Template[]>([]);
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [showSaveTemplateModal, setShowSaveTemplateModal] = useState(false);
  const [saveTemplateTodoId, setSaveTemplateTodoId] = useState<number | null>(null);
  const [newTemplateName, setNewTemplateName] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [templateDueDate, setTemplateDueDate] = useState('');
  const [reminderMinutes, setReminderMinutes] = useState<number | null>(null);
  const [notificationPermission, setNotificationPermission] = useState<NotificationPermission>('default');
  const [currentUser, setCurrentUser] = useState<string>('');

  useEffect(() => {
    fetchCurrentUser();
    fetchTodos();
    fetchTags();
    fetchTemplates();
    checkNotificationPermission();
    
    // Poll for reminders every minute
    const reminderInterval = setInterval(checkReminders, 60000);
    return () => clearInterval(reminderInterval);
  }, []);

  const fetchCurrentUser = async () => {
    try {
      const res = await fetch('/api/auth/session');
      const data = await res.json();
      if (data.user) {
        setCurrentUser(data.user.username);
      }
    } catch (error) {
      console.error('Error fetching user:', error);
    }
  };

  const fetchTodos = async () => {
    try {
      const res = await fetch('/api/todos');
      const data = await res.json();
      setTodos(data);
    } catch (error) {
      console.error('Error fetching todos:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchTags = async () => {
    try {
      const res = await fetch('/api/tags');
      const data = await res.json();
      setTags(data);
    } catch (error) {
      console.error('Error fetching tags:', error);
    }
  };

  const fetchTemplates = async () => {
    try {
      const res = await fetch('/api/templates');
      const data = await res.json();
      setTemplates(data);
    } catch (error) {
      console.error('Error fetching templates:', error);
    }
  };

  const checkNotificationPermission = () => {
    if ('Notification' in window) {
      setNotificationPermission(Notification.permission);
    }
  };

  const requestNotificationPermission = async () => {
    if ('Notification' in window && Notification.permission === 'default') {
      const permission = await Notification.requestPermission();
      setNotificationPermission(permission);
    }
  };

  const checkReminders = async () => {
    if (notificationPermission !== 'granted') return;

    try {
      const res = await fetch('/api/reminders');
      const todosToNotify = await res.json();

      for (const todo of todosToNotify) {
        new Notification('Todo Reminder', {
          body: `"${todo.title}" is due ${formatDueTime(todo)}`,
          icon: '/favicon.ico',
          tag: `todo-${todo.id}`,
        });
      }
    } catch (error) {
      console.error('Error checking reminders:', error);
    }
  };

  const formatDueTime = (todo: Todo) => {
    const dueDate = new Date(todo.due_date);
    const now = new Date();
    const diff = dueDate.getTime() - now.getTime();
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 24) {
      const days = Math.floor(hours / 24);
      return `in ${days} day${days !== 1 ? 's' : ''}`;
    } else if (hours > 0) {
      return `in ${hours} hour${hours !== 1 ? 's' : ''}`;
    } else if (minutes > 0) {
      return `in ${minutes} minute${minutes !== 1 ? 's' : ''}`;
    }
    return 'soon';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !dueDate) return;

    try {
      if (editingId) {
        const res = await fetch(`/api/todos/${editingId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title, due_date: dueDate, priority }),
        });
        const updatedTodo = await res.json();
        setTodos(todos.map(t => t.id === editingId ? { ...updatedTodo, subtasks: t.subtasks } : t));
        setEditingId(null);
      } else {
        const res = await fetch('/api/todos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            title, 
            due_date: dueDate, 
            priority,
            recurrence_pattern: recurrence || null,
            reminder_minutes: reminderMinutes
          }),
        });
        const newTodo = await res.json();
        setTodos([...todos, { ...newTodo, subtasks: [], tags: [] }]);
      }
      
      setTitle('');
      setDueDate('');
      setPriority('medium');
      setRecurrence('');
      setReminderMinutes(null);
      setShowAdvanced(false);
    } catch (error) {
      console.error('Error saving todo:', error);
    }
  };

  const toggleComplete = async (todo: Todo) => {
    try {
      const res = await fetch(`/api/todos/${todo.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: todo.completed ? 0 : 1 }),
      });
      const updatedTodo = await res.json();
      setTodos(todos.map(t => t.id === todo.id ? { ...updatedTodo, subtasks: t.subtasks } : t));
    } catch (error) {
      console.error('Error toggling todo:', error);
    }
  };

  const deleteTodo = async (id: number) => {
    if (!confirm('Are you sure you want to delete this todo?')) return;

    try {
      await fetch(`/api/todos/${id}`, { method: 'DELETE' });
      setTodos(todos.filter(t => t.id !== id));
    } catch (error) {
      console.error('Error deleting todo:', error);
    }
  };

  const startEdit = (todo: Todo) => {
    setEditingId(todo.id);
    setTitle(todo.title);
    setDueDate(todo.due_date.split('T')[0]);
    setPriority(todo.priority);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setTitle('');
    setDueDate('');
    setPriority('medium');
  };

  const toggleExpanded = (todoId: number) => {
    const newExpanded = new Set(expandedTodos);
    if (newExpanded.has(todoId)) {
      newExpanded.delete(todoId);
    } else {
      newExpanded.add(todoId);
    }
    setExpandedTodos(newExpanded);
  };

  const addSubtask = async (todoId: number) => {
    const title = newSubtaskTitle[todoId]?.trim();
    if (!title) return;

    try {
      const res = await fetch('/api/subtasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ todo_id: todoId, title }),
      });
      const newSubtask = await res.json();
      
      setTodos(todos.map(t => 
        t.id === todoId 
          ? { ...t, subtasks: [...t.subtasks, newSubtask] }
          : t
      ));
      setNewSubtaskTitle({ ...newSubtaskTitle, [todoId]: '' });
      setAddingSubtaskTo(null);
    } catch (error) {
      console.error('Error adding subtask:', error);
    }
  };

  const toggleSubtask = async (todoId: number, subtask: Subtask) => {
    try {
      const res = await fetch(`/api/subtasks/${subtask.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: subtask.completed ? 0 : 1 }),
      });
      const updatedSubtask = await res.json();
      
      setTodos(todos.map(t => 
        t.id === todoId 
          ? { ...t, subtasks: t.subtasks.map(s => s.id === subtask.id ? updatedSubtask : s) }
          : t
      ));
    } catch (error) {
      console.error('Error toggling subtask:', error);
    }
  };

  const deleteSubtask = async (todoId: number, subtaskId: number) => {
    try {
      await fetch(`/api/subtasks/${subtaskId}`, { method: 'DELETE' });
      setTodos(todos.map(t => 
        t.id === todoId 
          ? { ...t, subtasks: t.subtasks.filter(s => s.id !== subtaskId) }
          : t
      ));
    } catch (error) {
      console.error('Error deleting subtask:', error);
    }
  };

  const createTag = async () => {
    if (!newTagName.trim()) return;
    try {
      const res = await fetch('/api/tags', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newTagName }),
      });
      const newTag = await res.json();
      setTags([...tags, newTag]);
      setNewTagName('');
    } catch (error) {
      console.error('Error creating tag:', error);
    }
  };

  const deleteTag = async (tagId: number) => {
    if (!confirm('Delete this tag? It will be removed from all todos.')) return;
    try {
      await fetch(`/api/tags/${tagId}`, { method: 'DELETE' });
      setTags(tags.filter(t => t.id !== tagId));
      setTodos(todos.map(todo => ({
        ...todo,
        tags: todo.tags.filter(t => t.id !== tagId)
      })));
    } catch (error) {
      console.error('Error deleting tag:', error);
    }
  };

  const toggleTagOnTodo = async (todoId: number, tagId: number) => {
    const todo = todos.find(t => t.id === todoId);
    const hasTag = todo?.tags.some(t => t.id === tagId);

    try {
      if (hasTag) {
        await fetch(`/api/todos/${todoId}/tags?tagId=${tagId}`, { method: 'DELETE' });
        setTodos(todos.map(t => 
          t.id === todoId 
            ? { ...t, tags: t.tags.filter(tag => tag.id !== tagId) }
            : t
        ));
      } else {
        await fetch(`/api/todos/${todoId}/tags`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tag_id: tagId }),
        });
        const tag = tags.find(t => t.id === tagId);
        if (tag) {
          setTodos(todos.map(t => 
            t.id === todoId 
              ? { ...t, tags: [...t.tags, tag] }
              : t
          ));
        }
      }
    } catch (error) {
      console.error('Error toggling tag:', error);
    }
  };

  const calculateProgress = (subtasks: Subtask[]) => {
    if (subtasks.length === 0) return null;
    const completed = subtasks.filter(s => s.completed).length;
    const percentage = Math.round((completed / subtasks.length) * 100);
    return { completed, total: subtasks.length, percentage };
  };

  const getFilteredTodos = () => {
    return todos.filter(todo => {
      // Search filter
      if (searchText) {
        const search = searchText.toLowerCase();
        const titleMatch = todo.title.toLowerCase().includes(search);
        const tagMatch = todo.tags.some(tag => tag.name.toLowerCase().includes(search));
        const subtaskMatch = todo.subtasks.some(st => st.title.toLowerCase().includes(search));
        if (!titleMatch && !tagMatch && !subtaskMatch) return false;
      }

      // Priority filter
      if (priorityFilter !== 'all' && todo.priority !== priorityFilter) return false;

      // Status filter
      if (statusFilter === 'active' && todo.completed) return false;
      if (statusFilter === 'completed' && !todo.completed) return false;

      // Tag filter
      if (filterTag && !todo.tags.some(tag => tag.id === filterTag)) return false;

      return true;
    });
  };

  const clearFilters = () => {
    setSearchText('');
    setPriorityFilter('all');
    setStatusFilter('all');
    setFilterTag(null);
  };

  const hasActiveFilters = searchText || priorityFilter !== 'all' || statusFilter !== 'all' || filterTag !== null;

  const exportData = async () => {
    try {
      const res = await fetch('/api/export');
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `todos-backup-${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error exporting:', error);
      alert('Failed to export data');
    }
  };

  const importData = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const data = JSON.parse(text);
      
      if (!confirm(`Import ${data.todos?.length || 0} todos and ${data.tags?.length || 0} tags?`)) {
        return;
      }

      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (res.ok) {
        alert('Data imported successfully!');
        fetchTodos();
        fetchTags();
      } else {
        alert('Failed to import data');
      }
    } catch (error) {
      console.error('Error importing:', error);
      alert('Failed to import data - invalid file format');
    }
  };

  const saveAsTemplate = async () => {
    if (!saveTemplateTodoId || !newTemplateName.trim()) return;

    try {
      const res = await fetch('/api/templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newTemplateName,
          todoId: saveTemplateTodoId,
        }),
      });

      if (res.ok) {
        alert('Template saved successfully!');
        setShowSaveTemplateModal(false);
        setNewTemplateName('');
        setSaveTemplateTodoId(null);
        fetchTemplates();
      } else {
        alert('Failed to save template');
      }
    } catch (error) {
      console.error('Error saving template:', error);
      alert('Failed to save template');
    }
  };

  const deleteTemplate = async (templateId: number) => {
    if (!confirm('Delete this template?')) return;

    try {
      const res = await fetch(`/api/templates/${templateId}`, {
        method: 'DELETE',
      });

      if (res.ok) {
        fetchTemplates();
      } else {
        alert('Failed to delete template');
      }
    } catch (error) {
      console.error('Error deleting template:', error);
      alert('Failed to delete template');
    }
  };

  const useTemplate = async () => {
    if (!selectedTemplateId || !templateDueDate) {
      alert('Please select a template and due date');
      return;
    }

    try {
      const res = await fetch(`/api/templates/${selectedTemplateId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dueDate: templateDueDate }),
      });

      if (res.ok) {
        alert('Todo created from template!');
        setShowTemplateModal(false);
        setSelectedTemplateId(null);
        setTemplateDueDate('');
        fetchTodos();
      } else {
        alert('Failed to create todo from template');
      }
    } catch (error) {
      console.error('Error using template:', error);
      alert('Failed to create todo from template');
    }
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/login');
    } catch (error) {
      console.error('Error logging out:', error);
    }
  };

  const getPriorityColor = (priority: Priority) => {
    switch (priority) {
      case 'high': return 'bg-red-100 text-red-800 border-red-300';
      case 'medium': return 'bg-yellow-100 text-yellow-800 border-yellow-300';
      case 'low': return 'bg-green-100 text-green-800 border-green-300';
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-xl text-gray-600">Loading todos...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8 px-4 flex justify-center">
      <div className="max-w-4xl w-full">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-4xl font-bold text-gray-900">
              📝 My Todo App
            </h1>
            {currentUser && (
              <p className="text-sm text-gray-600 mt-1">
                Welcome, <span className="font-semibold">{currentUser}</span>
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Link
              href="/calendar"
              className="px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 transition"
            >
              📅 Calendar
            </Link>
            <button
              onClick={exportData}
              className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition"
              title="Export all data"
            >
              📥 Export
            </button>
            <label className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition cursor-pointer">
              📤 Import
              <input
                type="file"
                accept=".json"
                onChange={importData}
                className="hidden"
              />
            </label>
            <button
              onClick={() => setShowTagModal(true)}
              className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
            >
              🏷️ Manage Tags
            </button>
            <button
              onClick={() => setShowTemplateModal(true)}
              className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 transition"
            >
              📋 Templates
            </button>
            <button
              onClick={handleLogout}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition"
              title="Logout"
            >
              🚪 Logout
            </button>
          </div>
        </div>

        {/* Tag Filter Bar */}
        {tags.length > 0 && (
          <div className="bg-white rounded-lg shadow-md p-4 mb-6">
            <div className="flex flex-wrap gap-2 items-center">
              <span className="text-sm font-medium text-gray-600">Filter by Tag:</span>
              <button
                onClick={() => setFilterTag(null)}
                className={`px-3 py-1 rounded-full text-sm transition ${
                  filterTag === null 
                    ? 'bg-gray-800 text-white' 
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                All
              </button>
              {tags.map(tag => (
                <button
                  key={tag.id}
                  onClick={() => setFilterTag(filterTag === tag.id ? null : tag.id)}
                  className={`px-3 py-1 rounded-full text-sm transition border-2 ${
                    filterTag === tag.id 
                      ? 'border-gray-800 font-bold' 
                      : 'border-transparent'
                  }`}
                  style={{ 
                    backgroundColor: filterTag === tag.id ? tag.color : tag.color + '40',
                    color: filterTag === tag.id ? '#fff' : '#000'
                  }}
                >
                  {tag.name}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Search and Filters */}
        <div className="bg-white rounded-lg shadow-md p-4 mb-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-2">
              <input
                type="text"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="🔍 Search todos, tags, subtasks..."
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <div>
              <select
                value={priorityFilter}
                onChange={(e) => setPriorityFilter(e.target.value as Priority | 'all')}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">All Priorities</option>
                <option value="high">High Priority</option>
                <option value="medium">Medium Priority</option>
                <option value="low">Low Priority</option>
              </select>
            </div>
            <div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'all' | 'active' | 'completed')}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">All Status</option>
                <option value="active">Active Only</option>
                <option value="completed">Completed Only</option>
              </select>
            </div>
          </div>
          
          {hasActiveFilters && (
            <div className="mt-3 flex items-center gap-2">
              <span className="text-sm text-gray-600">Active filters:</span>
              {searchText && (
                <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-sm">
                  Search: "{searchText}"
                </span>
              )}
              {priorityFilter !== 'all' && (
                <span className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded text-sm">
                  Priority: {priorityFilter}
                </span>
              )}
              {statusFilter !== 'all' && (
                <span className="px-2 py-1 bg-green-100 text-green-800 rounded text-sm">
                  Status: {statusFilter}
                </span>
              )}
              {filterTag && (
                <span className="px-2 py-1 bg-purple-100 text-purple-800 rounded text-sm">
                  Tag: {tags.find(t => t.id === filterTag)?.name}
                </span>
              )}
              <button
                onClick={clearFilters}
                className="ml-auto px-3 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200 text-sm"
              >
                Clear All
              </button>
            </div>
          )}
        </div>

        {/* Tag Management Modal */}
        {showTagModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={() => setShowTagModal(false)}>
            <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
              <div className="flex justify-between items-center mb-4">
                <h2 className="text-2xl font-bold text-gray-900">Manage Tags</h2>
                <button onClick={() => setShowTagModal(false)} className="text-gray-500 hover:text-gray-700 text-2xl">
                  ×
                </button>
              </div>
              
              {/* Create New Tag */}
              <div className="mb-4">
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={newTagName}
                    onChange={(e) => setNewTagName(e.target.value)}
                    placeholder="New tag name..."
                    className="flex-1 px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                    onKeyPress={(e) => e.key === 'Enter' && createTag()}
                  />
                  <button
                    onClick={createTag}
                    className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition"
                  >
                    Add
                  </button>
                </div>
              </div>

              {/* Tag List */}
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {tags.length === 0 ? (
                  <p className="text-center text-gray-500 py-4">No tags yet. Create one above!</p>
                ) : (
                  tags.map(tag => (
                    <div key={tag.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-6 h-6 rounded-full"
                          style={{ backgroundColor: tag.color }}
                        />
                        <span className="font-medium">{tag.name}</span>
                      </div>
                      <button
                        onClick={() => deleteTag(tag.id)}
                        className="text-red-600 hover:text-red-800"
                      >
                        Delete
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* Add/Edit Form */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">
            {editingId ? 'Edit Todo' : 'Add New Todo'}
          </h2>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="What needs to be done?"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                required
              />
            </div>
            <div className="flex gap-4">
              <div className="flex-1">
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                />
              </div>
              <div className="flex-1">
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as Priority)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="low">Low Priority</option>
                  <option value="medium">Medium Priority</option>
                  <option value="high">High Priority</option>
                </select>
              </div>
            </div>
            
            {/* Advanced Options */}
            <div>
              <button
                type="button"
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="text-sm text-blue-600 hover:text-blue-800"
              >
                {showAdvanced ? '▼' : '▶'} Advanced Options
              </button>
            </div>

            {showAdvanced && (
              <div className="space-y-4 p-4 bg-gray-50 rounded-lg">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Recurrence Pattern
                  </label>
                  <select
                    value={recurrence}
                    onChange={(e) => setRecurrence(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">No Recurrence</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Reminder
                    {notificationPermission !== 'granted' && (
                      <button
                        type="button"
                        onClick={requestNotificationPermission}
                        className="ml-2 text-xs text-blue-600 hover:text-blue-800 underline"
                      >
                        Enable Notifications
                      </button>
                    )}
                  </label>
                  <select
                    value={reminderMinutes ?? ''}
                    onChange={(e) => setReminderMinutes(e.target.value ? parseInt(e.target.value) : null)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  >
                    <option value="">No Reminder</option>
                    <option value="15">15 minutes before</option>
                    <option value="30">30 minutes before</option>
                    <option value="60">1 hour before</option>
                    <option value="120">2 hours before</option>
                    <option value="1440">1 day before</option>
                    <option value="2880">2 days before</option>
                    <option value="10080">1 week before</option>
                  </select>
                </div>
              </div>
            )}
            <div className="flex gap-2">
              <button
                type="submit"
                className="flex-1 bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 transition"
              >
                {editingId ? 'Update Todo' : 'Add Todo'}
              </button>
              {editingId && (
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="px-6 py-2 bg-gray-300 text-gray-700 rounded-lg hover:bg-gray-400 transition"
                >
                  Cancel
                </button>
              )}
            </div>
          </form>
        </div>

        {/* Todo List */}
        <div className="space-y-3">
          <h2 className="text-2xl font-semibold text-gray-800 mb-4">
            {getFilteredTodos().filter(t => !t.completed).length} Active Tasks
            {hasActiveFilters && (
              <span className="text-sm text-gray-500 ml-2">
                (of {todos.filter(t => !t.completed).length} total)
              </span>
            )}
          </h2>
          
          {todos.length === 0 ? (
            <div className="bg-white rounded-lg shadow-md p-8 text-center text-gray-500">
              No todos yet. Add one above to get started! 🚀
            </div>
          ) : getFilteredTodos().length === 0 ? (
            <div className="bg-white rounded-lg shadow-md p-8 text-center text-gray-500">
              No todos match your filters. Try adjusting your search criteria.
            </div>
          ) : (
            getFilteredTodos().map((todo) => {
              const progress = calculateProgress(todo.subtasks);
              const isExpanded = expandedTodos.has(todo.id);
              
              return (
                <div key={todo.id} className="bg-white rounded-lg shadow-md">
                  {/* Main Todo */}
                  <div className={`p-4 flex items-center gap-4 transition ${
                    todo.completed ? 'opacity-60' : ''
                  }`}>
                    <input
                      type="checkbox"
                      checked={!!todo.completed}
                      onChange={() => toggleComplete(todo)}
                      className="w-5 h-5 cursor-pointer"
                    />
                    
                    <div className="flex-1">
                      <h3 className={`text-lg font-medium ${
                        todo.completed ? 'line-through text-gray-500' : 'text-gray-900'
                      }`}>
                        {todo.title}
                        {todo.recurrence_pattern && (
                          <span className="ml-2 text-xs bg-blue-100 text-blue-800 px-2 py-0.5 rounded">
                            🔄 {todo.recurrence_pattern}
                          </span>
                        )}
                      </h3>
                      <p className="text-sm text-gray-600">
                        Due: {new Date(todo.due_date).toLocaleDateString()}
                      </p>
                      
                      {/* Tags Display */}
                      {todo.tags && todo.tags.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-2">
                          {todo.tags.map(tag => (
                            <span
                              key={tag.id}
                              className="px-2 py-0.5 rounded-full text-xs font-medium text-white"
                              style={{ backgroundColor: tag.color }}
                            >
                              {tag.name}
                            </span>
                          ))}
                        </div>
                      )}
                      
                      {/* Progress Bar */}
                      {progress && (
                        <div className="mt-2">
                          <div className="flex items-center gap-2 mb-1">
                            <div className="flex-1 bg-gray-200 rounded-full h-2">
                              <div 
                                className="bg-blue-600 h-2 rounded-full transition-all"
                                style={{ width: `${progress.percentage}%` }}
                              />
                            </div>
                            <span className="text-xs text-gray-600">
                              {progress.completed}/{progress.total}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>

                    <span className={`px-3 py-1 rounded-full text-xs font-medium border ${
                      getPriorityColor(todo.priority)
                    }`}>
                      {todo.priority.toUpperCase()}
                    </span>

                    <div className="flex gap-2">
                      {todo.subtasks.length > 0 && (
                        <button
                          onClick={() => toggleExpanded(todo.id)}
                          className="px-3 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition text-sm"
                        >
                          {isExpanded ? '▼' : '▶'} {todo.subtasks.length}
                        </button>
                      )}
                      {tags.length > 0 && (
                        <div className="relative group">
                          <button
                            className="px-3 py-1 bg-indigo-100 text-indigo-700 rounded hover:bg-indigo-200 transition text-sm"
                            title="Manage tags"
                          >
                            🏷️
                          </button>
                          <div className="hidden group-hover:block absolute right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg p-2 z-10 min-w-[150px]">
                            {tags.map(tag => (
                              <label key={tag.id} className="flex items-center gap-2 p-2 hover:bg-gray-50 rounded cursor-pointer">
                                <input
                                  type="checkbox"
                                  checked={todo.tags.some(t => t.id === tag.id)}
                                  onChange={() => toggleTagOnTodo(todo.id, tag.id)}
                                  className="w-4 h-4"
                                />
                                <div
                                  className="w-4 h-4 rounded-full"
                                  style={{ backgroundColor: tag.color }}
                                />
                                <span className="text-sm">{tag.name}</span>
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                      <button
                        onClick={() => setAddingSubtaskTo(addingSubtaskTo === todo.id ? null : todo.id)}
                        className="px-3 py-1 bg-purple-100 text-purple-700 rounded hover:bg-purple-200 transition text-sm"
                        title="Add subtask"
                      >
                        +
                      </button>
                      <button
                        onClick={() => {
                          setSaveTemplateTodoId(todo.id);
                          setShowSaveTemplateModal(true);
                        }}
                        className="px-3 py-1 bg-yellow-100 text-yellow-700 rounded hover:bg-yellow-200 transition text-sm"
                        title="Save as template"
                      >
                        📋
                      </button>
                      <button
                        onClick={() => startEdit(todo)}
                        className="px-3 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition text-sm"
                        disabled={!!todo.completed}
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => deleteTodo(todo.id)}
                        className="px-3 py-1 bg-red-100 text-red-700 rounded hover:bg-red-200 transition text-sm"
                      >
                        Delete
                      </button>
                    </div>
                  </div>

                  {/* Add Subtask Form */}
                  {addingSubtaskTo === todo.id && (
                    <div className="px-4 pb-3 border-t border-gray-200 pt-3">
                      <div className="flex gap-2 ml-9">
                        <input
                          type="text"
                          value={newSubtaskTitle[todo.id] || ''}
                          onChange={(e) => setNewSubtaskTitle({ ...newSubtaskTitle, [todo.id]: e.target.value })}
                          placeholder="New subtask..."
                          className="flex-1 px-3 py-1 text-sm border border-gray-300 rounded focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                          onKeyPress={(e) => e.key === 'Enter' && addSubtask(todo.id)}
                          autoFocus
                        />
                        <button
                          onClick={() => addSubtask(todo.id)}
                          className="px-3 py-1 bg-purple-600 text-white rounded hover:bg-purple-700 text-sm"
                        >
                          Add
                        </button>
                        <button
                          onClick={() => setAddingSubtaskTo(null)}
                          className="px-3 py-1 bg-gray-300 text-gray-700 rounded hover:bg-gray-400 text-sm"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Subtasks */}
                  {isExpanded && todo.subtasks.length > 0 && (
                    <div className="px-4 pb-4 border-t border-gray-200">
                      {todo.subtasks.map((subtask) => (
                        <div key={subtask.id} className="flex items-center gap-3 py-2 ml-9 border-l-2 border-gray-300 pl-4">
                          <input
                            type="checkbox"
                            checked={!!subtask.completed}
                            onChange={() => toggleSubtask(todo.id, subtask)}
                            className="w-4 h-4 cursor-pointer"
                          />
                          <span className={`flex-1 text-sm ${
                            subtask.completed ? 'line-through text-gray-500' : 'text-gray-700'
                          }`}>
                            {subtask.title}
                          </span>
                          <button
                            onClick={() => deleteSubtask(todo.id, subtask.id)}
                            className="text-red-600 hover:text-red-800 text-sm"
                          >
                            ✕
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Completed Section */}
        {getFilteredTodos().some(t => t.completed) && (
          <div className="mt-8">
            <h2 className="text-xl font-semibold text-gray-600 mb-4">
              ✅ Completed ({getFilteredTodos().filter(t => t.completed).length})
            </h2>
          </div>
        )}

        {/* Save Template Modal */}
        {showSaveTemplateModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-md">
              <h2 className="text-xl font-semibold mb-4">Save as Template</h2>
              <input
                type="text"
                value={newTemplateName}
                onChange={(e) => setNewTemplateName(e.target.value)}
                placeholder="Template name (e.g., Weekly Report)"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg mb-4"
                autoFocus
              />
              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => {
                    setShowSaveTemplateModal(false);
                    setNewTemplateName('');
                    setSaveTemplateTodoId(null);
                  }}
                  className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300"
                >
                  Cancel
                </button>
                <button
                  onClick={saveAsTemplate}
                  disabled={!newTemplateName.trim()}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Templates Modal */}
        {showTemplateModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto">
              <h2 className="text-xl font-semibold mb-4">📋 Templates</h2>
              
              {templates.length === 0 ? (
                <p className="text-gray-500 text-center py-8">
                  No templates yet. Save a todo as a template to reuse it later!
                </p>
              ) : (
                <div className="space-y-3 mb-6">
                  {templates.map(template => {
                    const subtasks = template.subtasks_json ? JSON.parse(template.subtasks_json) : [];
                    const tagIds = template.tag_ids_json ? JSON.parse(template.tag_ids_json) : [];
                    const templateTags = tags.filter(t => tagIds.includes(t.id));
                    
                    return (
                      <div 
                        key={template.id}
                        className={`p-4 border rounded-lg cursor-pointer transition ${
                          selectedTemplateId === template.id 
                            ? 'border-purple-600 bg-purple-50' 
                            : 'border-gray-200 hover:border-purple-300'
                        }`}
                        onClick={() => setSelectedTemplateId(template.id)}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1">
                            <h3 className="font-semibold text-gray-900">{template.name}</h3>
                            <div className="flex items-center gap-2 mt-1">
                              <span className={`px-2 py-1 rounded-full text-xs ${
                                getPriorityColor(template.priority as Priority)
                              }`}>
                                {template.priority.toUpperCase()}
                              </span>
                              {template.due_date_offset !== 0 && (
                                <span className="text-xs text-gray-500">
                                  Due: {template.due_date_offset > 0 ? '+' : ''}{template.due_date_offset} days
                                </span>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteTemplate(template.id);
                            }}
                            className="text-red-600 hover:text-red-800"
                          >
                            ✕
                          </button>
                        </div>
                        
                        {subtasks.length > 0 && (
                          <div className="mt-2 text-sm text-gray-600">
                            📋 {subtasks.length} subtask{subtasks.length !== 1 ? 's' : ''}
                          </div>
                        )}
                        
                        {templateTags.length > 0 && (
                          <div className="flex gap-2 mt-2 flex-wrap">
                            {templateTags.map(tag => (
                              <span
                                key={tag.id}
                                className="px-2 py-1 rounded text-xs"
                                style={{ backgroundColor: tag.color + '40' }}
                              >
                                {tag.name}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {selectedTemplateId && (
                <div className="mb-4 p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Due Date for New Todo
                  </label>
                  <input
                    type="date"
                    value={templateDueDate}
                    onChange={(e) => setTemplateDueDate(e.target.value)}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  />
                </div>
              )}

              <div className="flex gap-2 justify-end">
                <button
                  onClick={() => {
                    setShowTemplateModal(false);
                    setSelectedTemplateId(null);
                    setTemplateDueDate('');
                  }}
                  className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300"
                >
                  Close
                </button>
                <button
                  onClick={useTemplate}
                  disabled={!selectedTemplateId || !templateDueDate}
                  className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Create Todo
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
