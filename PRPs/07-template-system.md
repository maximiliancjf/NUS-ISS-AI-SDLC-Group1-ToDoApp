# PRP-07: Template System

## Feature Overview

Implement a template system that allows users to save recurring todo patterns with predefined subtasks, priorities, and metadata as reusable templates. Templates support due date offsets (e.g., "due in 7 days") and automatically create fully-formed todos when instantiated, dramatically reducing repetitive task creation.

## User Stories

### User Persona: David - Team Lead

**Story 1: Save Todo as Template**
> As David, I want to save my "Weekly Sprint Planning" todo as a template so that I don't recreate the same checklist every week.

**Story 2: Create Todo from Template**
> As David, I want to select a template and have it automatically create a todo with all subtasks pre-populated so that I save time on setup.

**Story 3: Set Due Date Offset**
> As David, I want templates to calculate due dates dynamically (e.g., "7 days from now") so that each instance has the correct deadline.

**Story 4: Organize Templates by Category**
> As David, I want to categorize templates (e.g., "Work", "Personal", "Meetings") so that I can quickly find the right template.

**Story 5: Edit and Delete Templates**
> As David, I want to modify template content or remove outdated templates so that my template library  stays relevant.

## User Flow

### Create Template from Existing Todo Flow
1. User creates a todo with multiple subtasks, tags, priority
2. User clicks "Save as Template" button on the todo
3. Modal appears with fields:
   - Template name (required)
   - Category (optional dropdown: Work/Personal/Other)
   - Due date offset in days (default: 0)
4. User enters "Sprint Planning" as name, category "Work", offset "7"
5. User clicks "Save Template"
6. System serializes subtasks to JSON
7. Template saved to database
8. Toast notification: "Template created successfully"

### Create Todo from Template Flow
1. User clicks "Templates" button in header/sidebar
2. Template browser opens showing all templates grouped by category
3. User clicks "Sprint Planning" template
4. Preview shows:
   - Template name and category
   - Number of subtasks
   - Due date (calculated: today + offset)
5. User clicks "Use Template"
6. System creates new todo:
   - Title from template
   - Due date: today + 7 days
   - Priority from template
   - Subtasks deserialized from JSON
   - Tags copied (if saved with template)
7. Modal closes, new todo appears in list
8. User can immediately edit if needed

### Edit Template Flow
1. User opens template browser
2. User clicks edit icon on template
3. Form shows current values:
   - Name (editable)
   - Category (editable)
   - Due offset (editable)
   - Subtasks (read-only preview, not editable in template)
4. User modifies fields
5. User clicks "Save"
6. Template updates, all future instances use new values

### Delete Template Flow
1. User opens template browser
2. User clicks delete icon on template
3. Confirmation: "Delete '{template name}'? This won't affect existing todos."
4. User confirms
5. Template removed from database
6. List refreshes

## Technical Requirements

### Database Schema

```typescript
CREATE TABLE templates (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  category TEXT,                    -- 'work' | 'personal' | 'other' | NULL
  title TEXT NOT NULL,             -- Todo title when instantiated
  priority TEXT NOT NULL,           -- 'high' | 'medium' | 'low'
  due_offset_days INTEGER DEFAULT 0, -- Days from today for due date
  subtasks_json TEXT,               -- JSON array of subtask titles
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
)

CREATE INDEX idx_templates_user_id ON templates(user_id);
CREATE INDEX idx_templates_category ON templates(category);
```

**Key Points:**
- `subtasks_json`: Serialized array of subtask objects `[{ title: string, position: number }]`
- `due_offset_days`: Integer (0 = today, 1 = tomorrow, 7 = one week from now)
- No tags stored directly (many-to-many would complicate; implement separately if needed)
- Category helps with organization but is optional

### TypeScript Types

```typescript
// From lib/db.ts
export type TemplateCategory = 'work' | 'personal' | 'other';

export interface Template {
  id: number;
  user_id: number;
  name: string;
  category: TemplateCategory | null;
  title: string;
  priority: Priority;
  due_offset_days: number;
  subtasks_json: string;  // JSON string
  created_at: string;
}

export interface TemplateWithSubtasks extends Template {
  subtasks: Array<{ title: string; position: number; }>;
}

// Helper to parse subtasks from JSON
export function parseTemplateSubtasks(template: Template): TemplateWithSubtasks {
  let subtasks: Array<{ title: string; position: number; }> = [];
  
  if (template.subtasks_json) {
    try {
      subtasks = JSON.parse(template.subtasks_json);
    } catch (error) {
      console.error('Failed to parse template subtasks:', error);
    }
  }

  return { ...template, subtasks };
}
```

### API Endpoints

#### 1. Create Template - `POST /api/templates`

**Request Body:**
```typescript
{
  name: string;               // Required, 1-100 chars
  category?: TemplateCategory | null;
  todo_id: number;            // Source todo to convert to template
  due_offset_days?: number;   // Default: 0
}
```

**Response (201 Created):**
```typescript
{
  template: Template;
}
```

**Implementation:**
```typescript
// app/api/templates/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { templateDB, todoDB, subtaskDB, tagDB } from '@/lib/db';

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const body = await request.json();
  const { name, category, todo_id, due_offset_days = 0 } = body;

  // Validate name
  if (!name || name.trim().length === 0 || name.length > 100) {
    return NextResponse.json(
      { error: 'Template name must be 1-100 characters' },
      { status: 400 }
    );
  }

  // Get source todo
  const todo = todoDB.findById(todo_id);
  if (!todo || todo.user_id !== session.userId) {
    return NextResponse.json({ error: 'Todo not found' }, { status: 404 });
  }

  // Serialize subtasks
  const subtasks = subtaskDB.findByTodo(todo_id);
  const subtasksData = subtasks.map(s => ({
    title: s.title,
    position: s.position,
  }));
  const subtasks_json = JSON.stringify(subtasksData);

  // Create template
  const template = templateDB.create({
    user_id: session.userId,
    name: name.trim(),
    category: category || null,
    title: todo.title,
    priority: todo.priority,
    due_offset_days,
    subtasks_json,
  });

  return NextResponse.json({ template }, { status: 201 });
}
```

#### 2. Get All Templates - `GET /api/templates`

**Query Parameters:**
```typescript
{
  category?: TemplateCategory;  // Filter by category
}
```

**Response:**
```typescript
{
  templates: TemplateWithSubtasks[];
}
```

#### 3. Use Template - `POST /api/templates/[id]/use`

**URL Parameter:** `id` (template ID)

**Request Body:**
```typescript
{
  due_date_override?: string;  // Optional: override calculated due date
}
```

**Response (201 Created):**
```typescript
{
  todo: TodoWithSubtasks;  // Newly created todo from template
}
```

**Implementation:**
```typescript
// app/api/templates/[id]/use/route.ts
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const template = templateDB.findById(Number(id));
  if (!template || template.user_id !== session.userId) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 });
  }

  const { due_date_override } = await request.json();

  // Calculate due date
  let dueDate: string;
  if (due_date_override) {
    dueDate = due_date_override;
  } else {
    const now = getSingaporeNow();
    const offsetDays = template.due_offset_days || 0;
    const due = addDays(now, offsetDays);
    dueDate = formatSingaporeDate(due, 'yyyy-MM-dd HH:mm:ss');
  }

  // Create todo
  const todo = todoDB.create({
    user_id: session.userId,
    title: template.title,
    due_date: dueDate,
    priority: template.priority,
    completed: 0,
  });

  // Create subtasks
  const subtasksData = JSON.parse(template.subtasks_json || '[]');
  subtasksData.forEach((data: any) => {
    subtaskDB.create({
      todo_id: todo.id,
      title: data.title,
      position: data.position,
      completed: 0,
    });
  });

  // Get todo with subtasks
  const subtasks = subtaskDB.findByTodo(todo.id);
  return NextResponse.json({ todo: { ...todo, subtasks } }, { status: 201 });
}
```

#### 4. Update Template - `PUT /api/templates/[id]`

**URL Parameter:** `id` (template ID)

**Request Body:**
```typescript
{
  name?: string;
  category?: TemplateCategory | null;
  due_offset_days?: number;
}
```

**Response:**
```typescript
{
  template: Template;
}
```

#### 5. Delete Template - `DELETE /api/templates/[id]`

**URL Parameter:** `id` (template ID)

**Response:**
```typescript
{
  success: true;
}
```

### Database Layer Updates

```typescript
// In lib/db.ts
export const templateDB = {
  /**
   * Create a new template
   */
  create(data: {
    user_id: number;
    name: string;
    category: TemplateCategory | null;
    title: string;
    priority: Priority;
    due_offset_days: number;
    subtasks_json: string;
  }): Template {
    const stmt = db.prepare(`
      INSERT INTO templates (user_id, name, category, title, priority, due_offset_days, subtasks_json)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);
    const info = stmt.run(
      data.user_id,
      data.name,
      data.category,
      data.title,
      data.priority,
      data.due_offset_days,
      data.subtasks_json
    );
    return this.findById(Number(info.lastInsertRowid))!;
  },

  /**
   * Find template by ID
   */
  findById(id: number): Template | null {
    const stmt = db.prepare('SELECT * FROM templates WHERE id = ?');
    return stmt.get(id) as Template | null;
  },

  /**
   * Find all templates for a user
   */
  findByUser(userId: number): Template[] {
    const stmt = db.prepare(`
      SELECT * FROM templates 
      WHERE user_id = ? 
      ORDER BY category ASC, name ASC
    `);
    return stmt.all(userId) as Template[];
  },

  /**
   * Find templates by category
   */
  findByCategory(userId: number, category: TemplateCategory): Template[] {
    const stmt = db.prepare(`
      SELECT * FROM templates 
      WHERE user_id = ? AND category = ?
      ORDER BY name ASC
    `);
    return stmt.all(userId, category) as Template[];
  },

  /**
   * Update template
   */
  update(id: number, data: Partial<Template>): Template {
    const fields = Object.keys(data);
    const values = Object.values(data);
    
    const setClause = fields.map(f => `${f} = ?`).join(', ');
    const stmt = db.prepare(`UPDATE templates SET ${setClause} WHERE id = ?`);
    stmt.run(...values, id);
    
    return this.findById(id)!;
  },

  /**
   * Delete template
   */
  delete(id: number): void {
    const stmt = db.prepare('DELETE FROM templates WHERE id = ?');
    stmt.run(id);
  },

  /**
   * Get all templates with parsed subtasks
   */
  findByUserWithSubtasks(userId: number): TemplateWithSubtasks[] {
    const templates = this.findByUser(userId);
    return templates.map(t => parseTemplateSubtasks(t));
  },
};
```

## UI Components

### Template Browser Modal

```typescript
'use client';

import { useState, useEffect } from 'react';
import { TemplateWithSubtasks, TemplateCategory } from '@/lib/db';
import { TemplateCard } from './TemplateCard';

export function TemplateBrowser({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [templates, setTemplates] = useState<TemplateWithSubtasks[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<TemplateCategory | 'all'>('all');

  useEffect(() => {
    if (isOpen) {
      fetchTemplates();
    }
  }, [isOpen]);

  async function fetchTemplates() {
    const res = await fetch('/api/templates');
    const data = await res.json();
    setTemplates(data.templates);
  }

  async function handleUseTemplate(templateId: number) {
    const res = await fetch(`/api/templates/${templateId}/use`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    if (res.ok) {
      onClose();
      // Refresh todos (trigger parent refresh)
      window.location.reload();  // Simplified; use proper state management in production
    }
  }

  const filteredTemplates = selectedCategory === 'all'
    ? templates
    : templates.filter(t => t.category === selectedCategory);

  const groupedTemplates = filteredTemplates.reduce((acc, template) => {
    const cat = template.category || 'other';
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(template);
    return acc;
  }, {} as Record<string, TemplateWithSubtasks[]>);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[80vh] overflow-hidden">
        <div className="p-6 border-b">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold">Templates</h2>
            <button onClick={onClose} className="text-gray-500 hover:text-gray-700 text-2xl">
              ×
            </button>
          </div>

          {/* Category Filter */}
          <div className="flex gap-2 mt-4">
            {['all', 'work', 'personal', 'other'].map(cat => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat as any)}
                className={`px-4 py-2 rounded-lg ${
                  selectedCategory === cat
                    ? 'bg-blue-500 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {cat.charAt(0).toUpperCase() + cat.slice(1)}
              </button>
            ))}
          </div>
        </div>

        <div className="p-6 overflow-y-auto max-h-[60vh]">
          {Object.entries(groupedTemplates).map(([category, temps]) => (
            <div key={category} className="mb-6">
              <h3 className="text-lg font-semibold mb-3 capitalize">
                {category} Templates
              </h3>
              <div className="grid grid-cols-2 gap-4">
                {temps.map(template => (
                  <TemplateCard
                    key={template.id}
                    template={template}
                    onUse={() => handleUseTemplate(template.id)}
                    onEdit={() => {}}  // TODO: Implement edit
                    onDelete={() => {}}  // TODO: Implement delete
                  />
                ))}
              </div>
            </div>
          ))}

          {filteredTemplates.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              <p>No templates found.</p>
              <p className="text-sm mt-2">Create your first template by saving a todo!</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
```

### Template Card Component

```typescript
import { TemplateWithSubtasks } from '@/lib/db';
import { PriorityBadge } from './PriorityBadge';
import { addDays } from 'date-fns';
import { getSingaporeNow, formatSingaporeDate } from '@/lib/timezone';

interface TemplateCardProps {
  template: TemplateWithSubtasks;
  onUse: () => void;
  onEdit: () => void;
  onDelete: () => void;
}

export function TemplateCard({ template, onUse, onEdit, onDelete }: TemplateCardProps) {
  // Calculate preview due date
  const calculatedDueDate = addDays(getSingaporeNow(), template.due_offset_days);
  const dueDateStr = formatSingaporeDate(calculatedDueDate, 'MMM d, yyyy');

  return (
    <div className="border rounded-lg p-4 hover:shadow-md transition">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h4 className="font-semibold text-lg">{template.name}</h4>
          <p className="text-sm text-gray-600">{template.title}</p>
        </div>
        <PriorityBadge priority={template.priority} size="sm" />
      </div>

      <div className="space-y-2 mb-4">
        <p className="text-sm text-gray-600">
          📅 Due: {dueDateStr} ({template.due_offset_days === 0 ? 'today' : `in ${template.due_offset_days} days`})
        </p>
        
        {template.subtasks.length > 0 && (
          <p className="text-sm text-gray-600">
            ✓ {template.subtasks.length} subtask{template.subtasks.length !== 1 ? 's' : ''}
          </p>
        )}
      </div>

      {/* Preview Subtasks */}
      {template.subtasks.length > 0 && (
        <div className="mb-4 p-2 bg-gray-50 rounded text-xs">
          <p className="font-medium mb-1">Subtasks:</p>
          <ul className="list-disc list-inside space-y-0.5 text-gray-600">
            {template.subtasks.slice(0, 3).map((subtask, idx) => (
              <li key={idx}>{subtask.title}</li>
            ))}
            {template.subtasks.length > 3 && (
              <li className="text-gray-500">+ {template.subtasks.length - 3} more...</li>
            )}
          </ul>
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={onUse}
          className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
        >
          Use Template
        </button>
        <button
          onClick={onEdit}
          className="px-3 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
        >
          Edit
        </button>
        <button
          onClick={onDelete}
          className="px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
```

### Save as Template Button Component

```typescript
interface SaveAsTemplateProps {
  todoId: number;
  onSave: () => void;
}

export function SaveAsTemplateButton({ todoId, onSave }: SaveAsTemplateProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [name, setName] = useState('');
  const [category, setCategory] = useState<TemplateCategory | null>(null);
  const [dueOffset, setDueOffset] = useState(0);

  async function handleSave() {
    const res = await fetch('/api/templates', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        category,
        todo_id: todoId,
        due_offset_days: dueOffset,
      }),
    });

    if (res.ok) {
      setIsOpen(false);
      setName('');
      setCategory(null);
      setDueOffset(0);
      onSave();
      alert('Template created successfully!');
    } else {
      const error = await res.json();
      alert(error.error);
    }
  }

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="text-sm text-blue-600 hover:underline"
      >
        💾 Save as Template
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white rounded-lg shadow-xl p-6 max-w-md w-full">
            <h3 className="text-xl font-bold mb-4">Save as Template</h3>

            <form onSubmit={(e) => { e.preventDefault(); handleSave(); }} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Template Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g., Weekly Sprint Planning"
                  className="w-full px-3 py-2 border rounded-lg"
                  required
                  maxLength={100}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Category</label>
                <select
                  value={category || ''}
                  onChange={(e) => setCategory(e.target.value as TemplateCategory || null)}
                  className="w-full px-3 py-2 border rounded-lg"
                >
                  <option value="">None</option>
                  <option value="work">Work</option>
                  <option value="personal">Personal</option>
                  <option value="other">Other</option>
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">
                  Due Date Offset (days from today)
                </label>
                <input
                  type="number"
                  value={dueOffset}
                  onChange={(e) => setDueOffset(Number(e.target.value))}
                  className="w-full px-3 py-2 border rounded-lg"
                  min={0}
                  max={365}
                />
                <p className="text-xs text-gray-500 mt-1">
                  0 = today, 7 = one week from now
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  type="submit"
                  className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                >
                  Save Template
                </button>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
```

## Edge Cases

### 1. Empty Subtasks in Template
- **Problem:** User saves todo with no subtasks as template
- **Solution:** Allow it, template creates todo without subtasks
- **Test:** Create template from todo with no subtasks

### 2. Invalid JSON in subtasks_json
- **Problem:** Database corruption or manual edit causes invalid JSON
- **Solution:** Try-catch with fallback to empty array, log error
- **Test:** Manually corrupt JSON, attempt to use template

### 3. Negative Due Offset
- **Problem:** User sets due_offset_days = -7 (past date)
- **Solution:** Frontend prevents negative values, backend validates >= 0
- **Test:** Attempt to create template with negative offset

### 4. Template from Completed Todo
- **Problem:** User tries to save completed todo as template
- **Solution:** Allow it, but reset completion status when instantiating
- **Test:** Save completed todo, use template, verify new todo is incomplete

### 5. Very Long Subtask List (100+)
- **Problem:** Template with 100 subtasks causes large JSON string
- **Solution:** No hard limit but warn user in UI about performance
- **Test:** Create template with 100 subtasks, verify instantiation works

### 6. Deleting Template in Use
- **Problem:** Template deleted while user is previewing it
- **Solution:** Return 404, show error message
- **Test:** Simulate race condition

### 7. Category Mismatch
- **Problem:** User changes category enum values in code
- **Solution:** NULL category is always valid fallback
- **Test:** Query template with invalid category value

### 8. Due Date Calculation Edge Cases
- **Problem:** Template with offset=365 creates due date next year on  Feb 29
- **Solution:** Date arithmetic handles leap years automatically
- **Test:** Create template on Feb 29 with large offset

## Acceptance Criteria

### Template Creation
- [ ] User can save todo as template
- [ ] Template name required (1-100 chars)
- [ ] Category optional (work/personal/other)
- [ ] Due offset defaults to 0
- [ ] Subtasks serialized to JSON correctly
- [ ] Template appears in browser immediately

### Template Usage
- [ ] User can browse templates by category
- [ ] User can preview template details before using
- [ ] Using template creates new todo with:
  - Same title
  - Calculated due date (today + offset)
  - Same priority
  - All subtasks recreated
- [ ] New todo is editable independently

### Template Management
- [ ] User can edit template name, category, offset
- [ ] User can delete templates
- [ ] Deleting template doesn't affect existing todos
- [ ] Templates sorted alphabetically within category

### Date Calculation
- [ ] Due offset calculated correctly in Singapore timezone
- [ ] Preview shows correct date (e.g., "Feb 17, 2026 (in 7 days)")
- [ ] Zero offset creates todo due today
- [ ] Large offsets (365+) work correctly

### Subtasks Handling
- [ ] Subtasks JSON serialized correctly
- [ ] Subtasks deserialized and recreated on use
- [ ] Subtask positions preserved
- [ ] Empty subtask lists handled gracefully

## Testing Requirements

### Unit Tests

**File:** `lib/db.test.ts`

```typescript
describe('templateDB', () => {
  test('create() serializes subtasks to JSON', () => {
    const todo = todoDB.create({ user_id: 1, title: 'Task', due_date: '2026-02-10', priority: 'medium' });
    subtaskDB.create({ todo_id: todo.id, title: 'Step 1', position: 0, completed: 0 });
    subtaskDB.create({ todo_id: todo.id, title: 'Step 2', position: 1, completed: 0 });

    const subtasks = subtaskDB.findByTodo(todo.id);
    const subtasks_json = JSON.stringify(subtasks.map(s => ({ title: s.title, position: s.position })));

    const template = templateDB.create({
      user_id: 1,
      name: 'Test Template',
      category: 'work',
      title: todo.title,
      priority: todo.priority,
      due_offset_days: 7,
      subtasks_json,
    });

    expect(template.subtasks_json).toBeTruthy();
    const parsed = JSON.parse(template.subtasks_json);
    expect(parsed).toHaveLength(2);
    expect(parsed[0].title).toBe('Step 1');
  });

  test('parseTemplateSubtasks() handles invalid JSON gracefully', () => {
    const template = {
      ...sampleTemplate,
      subtasks_json: 'invalid json',
    };

    const parsed = parseTemplateSubtasks(template);
    expect(parsed.subtasks).toEqual([]);
  });

  test('findByCategory() filters correctly', () => {
    templateDB.create({ user_id: 1, name: 'Work Template', category: 'work', ...defaults });
    templateDB.create({ user_id: 1, name: 'Personal Template', category: 'personal', ...defaults });

    const workTemplates = templateDB.findByCategory(1, 'work');
    expect(workTemplates.every(t => t.category === 'work')).toBe(true);
  });
});
```

### E2E Tests (Playwright)

**File:** `tests/08-template-system.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

test.describe('Template System', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should save todo as template', async ({ page }) => {
    // Create todo with subtasks
    await page.fill('input[placeholder*="Add a new todo"]', 'Sprint Planning');
    await page.click('button:has-text("Add")');

    await page.click('button:has-text("Add subtask")');
    await page.fill('input[placeholder="Subtask title"]', 'Review backlog');
    await page.press('input[placeholder="Subtask title"]', 'Enter');

    // Save as template
    await page.click('button:has-text("Save as Template")');
    await page.fill('input[placeholder*="Template Name"]', 'Weekly Sprint');
    await page.selectOption('select[aria-label="Category"]', 'work');
    await page.fill('input[type="number"]', '7');
    await page.click('button:has-text("Save Template")');

    await expect(page.locator('text=Template created successfully')).toBeVisible();
  });

  test('should create todo from template', async ({ page }) => {
    // Assume template exists
    await page.click('button:has-text("Templates")');
    await page.click('.template-card:has-text("Weekly Sprint")');
    await page.click('button:has-text("Use Template")');

    // Verify todo created
    await expect(page.locator('text=Sprint Planning')).toBeVisible();
    await expect(page.locator('text=Review backlog')).toBeVisible();
  });

  test('should calculate due date with offset', async ({ page }) => {
    // Create template with 7-day offset
    // ... setup code ...

    await page.click('button:has-text("Templates")');
    
    // Verify preview shows "in 7 days"
    await expect(page.locator('text=in 7 days')).toBeVisible();
  });

  test('should filter templates by category', async ({ page }) => {
    // Assume mixed categories exist
    await page.click('button:has-text("Templates")');
    await page.click('button:has-text("Work")');

    // Only work templates visible
    await expect(page.locator('.template-card[data-category="work"]')).toBeVisible();
    await expect(page.locator('.template-card[data-category="personal"]')).not.toBeVisible();
  });

  test('should delete template', async ({ page }) => {
    await page.click('button:has-text("Templates")');
    
    page.once('dialog', dialog => dialog.accept());
    await page.click('.template-card button:has-text("Delete")');

    await expect(page.locator('.template-card:has-text("Weekly Sprint")')).not.toBeVisible();
  });
});
```

## Out of Scope

The following features are **NOT** included in this PRP:

- ❌ Template sharing between users
- ❌ Template marketplace/library
- ❌ Template versioning/history
- ❌ Template variables (e.g., $TODAY, $USERNAME)
- ❌ Conditional subtasks based on selections
- ❌ Template tags (saved with template, applied on use)

## Success Metrics

### Performance Metrics
- [ ] Template creation completes in < 200ms
- [ ] Template instantiation completes in < 300ms (including subtasks)
- [ ] Template browser loads in < 150ms

### User Experience Metrics
- [ ] 30%+ of users create at least one template
- [ ] Templates reduce task creation time by 50%
- [ ] Average 3-5 templates per active user

### Code Quality Metrics
- [ ] Test coverage: 85%+ for template logic
- [ ] JSON serialization tested with edge cases
- [ ] No data loss when parsing subtasks

### Adoption Metrics
- [ ] Top use case: Weekly recurring meetings/tasks
- [ ] 40% of todos created from templates after 1 month
- [ ] Template satisfaction rating: 85%+

---

**Last Updated:** February 5, 2026  
**Version:** 1.0  
**Dependencies:** PRP-01 (Todo CRUD), PRP-02 (Priority), PRP-05 (Subtasks)  
**Dependents:** None (standalone productivity feature)
