# PRP-01: Todo CRUD Operations

## Feature Overview

Implement comprehensive Create, Read, Update, and Delete (CRUD) operations for todos with Singapore timezone handling, optimistic UI updates, and validation rules. This forms the foundation of the Todo App and must support all attributes including title, due date, completion status, and relationships with other entities (subtasks, tags, recurring patterns, reminders).

## User Stories

### User Persona: John - Software Developer

**Story 1: Create a Todo**
> As John, I want to quickly add a new todo with a title and due date so that I can track upcoming tasks without complex forms.

**Story 2: View All Todos**
> As John, I want to see all my incomplete todos sorted by due date so that I know what to work on next.

**Story 3: Mark as Complete**
> As John, I want to check off completed todos so that I can track progress and reduce clutter.

**Story 4: Edit a Todo**
> As John, I want to modify a todo's title or due date so that I can adjust plans when priorities change.

**Story 5: Delete a Todo**
> As John, I want to delete todos that are no longer relevant so that my list stays organized.

## User Flow

### Create Todo Flow
1. User enters todo title in the input field
2. User selects due date from datetime picker (defaults to today)
3. User selects priority from dropdown (defaults to Medium)
4. (Optional) User clicks "Show Advanced Options" to set:
   - Recurrence pattern
   - Reminder offset
   - Tags
5. User clicks "Add" button
6. UI optimistically adds the todo to the list
7. API call executes in background
8. On success: Todo persists with server-generated ID
9. On failure: UI reverts, shows error message

### Complete Todo Flow
1. User clicks checkbox next to a todo
2. UI immediately marks todo as completed (strikethrough, gray styling)
3. API call updates `completed_at` timestamp in database
4. If recurring: System creates next instance automatically
5. On failure: UI reverts, shows error toast

### Edit Todo Flow
1. User clicks edit icon on a todo
2. Form populates with current values
3. User modifies title, due date, or priority
4. User saves changes
5. UI updates optimistically
6. API validates and persists changes
7. On failure: UI reverts, shows validation errors

### Delete Todo Flow
1. User clicks delete icon
2. Confirmation prompt appears (optional, based on settings)
3. Todo immediately disappears from UI
4. API call executes cascade delete:
   - Deletes associated subtasks
   - Removes tag relationships
   - Clears reminder
5. On failure: UI restores todo, shows error

## Technical Requirements

### Database Schema

From `lib/db.ts`:

```typescript
CREATE TABLE todos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  due_date TEXT NOT NULL,  -- ISO 8601 in Singapore timezone
  priority TEXT NOT NULL DEFAULT 'medium',  -- 'high' | 'medium' | 'low'
  completed INTEGER DEFAULT 0,  -- Boolean: 0 or 1
  completed_at TEXT,  -- ISO 8601 timestamp
  recurrence_pattern TEXT,  -- 'daily' | 'weekly' | 'monthly' | 'yearly' | NULL
  reminder_minutes INTEGER,  -- Minutes before due date, or NULL
  last_notification_sent TEXT,  -- ISO 8601 timestamp or NULL
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
)
```

### TypeScript Types

```typescript
// From lib/db.ts
export type Priority = 'high' | 'medium' | 'low';
export type RecurrencePattern = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface Todo {
  id: number;
  user_id: number;
  title: string;
  due_date: string;  // ISO 8601 string
  priority: Priority;
  completed: number;  // 0 or 1
  completed_at: string | null;
  recurrence_pattern: RecurrencePattern | null;
  reminder_minutes: number | null;
  last_notification_sent: string | null;
  created_at: string;
}

export interface TodoWithRelations extends Todo {
  subtasks?: Subtask[];
  tags?: Tag[];
}
```

### API Endpoints

#### 1. Create Todo - `POST /api/todos`

**Request Body:**
```typescript
{
  title: string;              // Required, min 1 char, max 500 chars
  due_date: string;           // Required, ISO 8601, must be future or today
  priority?: Priority;        // Optional, defaults to 'medium'
  recurrence_pattern?: RecurrencePattern | null;
  reminder_minutes?: number | null;
}
```

**Response (201 Created):**
```typescript
{
  todo: Todo;  // Includes server-generated id, user_id, timestamps
}
```

**Validation Rules:**
- Title: 1-500 characters, trimmed
- Due date: Valid ISO 8601, cannot be in the past (Singapore time)
- Priority: Must be 'high', 'medium', or 'low'
- Reminder: If set, must be positive integer (minutes)

**Error Responses:**
- `400 Bad Request` - Validation errors
- `401 Unauthorized` - No active session
- `500 Internal Server Error` - Database errors

#### 2. Get All Todos - `GET /api/todos`

**Query Parameters:**
```typescript
{
  include_completed?: boolean;  // Default: false
  priority?: Priority;          // Filter by priority
  tag_id?: number;              // Filter by tag
}
```

**Response (200 OK):**
```typescript
{
  todos: TodoWithRelations[];  // Includes subtasks and tags
}
```

**Sorting Logic:**
- Primary: Completion status (incomplete first)
- Secondary: Priority (high → medium → low)
- Tertiary: Due date (earliest first)

#### 3. Update Todo - `PUT /api/todos/[id]`

**URL Parameter:** `id` (todo ID)

**Request Body:**
```typescript
{
  title?: string;
  due_date?: string;
  priority?: Priority;
  completed?: number;  // 0 or 1
  recurrence_pattern?: RecurrencePattern | null;
  reminder_minutes?: number | null;
}
```

**Response (200 OK):**
```typescript
{
  todo: Todo;
  next_todo?: Todo;  // If recurring and marked complete
}
```

**Special Logic for Completion:**
- Set `completed_at` to current Singapore timestamp
- If `recurrence_pattern` exists, create next instance:
  - Calculate new due date based on pattern
  - Copy priority, tags, reminder_minutes
  - Reset completed status
  - Return as `next_todo` in response

#### 4. Delete Todo - `DELETE /api/todos/[id]`

**URL Parameter:** `id` (todo ID)

**Response (200 OK):**
```typescript
{
  success: true;
}
```

**Cascade Behavior:**
- Deletes all associated subtasks (CASCADE in DB)
- Removes all tag relationships from `todo_tags` table
- Automatic via foreign key constraints

### Implementation Files

**API Route:** `app/api/todos/route.ts` (GET, POST)
**API Route:** `app/api/todos/[id]/route.ts` (GET, PUT, DELETE)
**Database Layer:** `lib/db.ts` (export `todoDB` object with CRUD methods)
**Client Component:** `app/page.tsx` (main UI with state management)
**Timezone Utilities:** `lib/timezone.ts` (Singapore time handling)

### Singapore Timezone Handling

**CRITICAL:** All date/time operations MUST use Singapore timezone (`Asia/Singapore`).

```typescript
// lib/timezone.ts
import { toZonedTime, format } from 'date-fns-tz';

const SINGAPORE_TZ = 'Asia/Singapore';

export function getSingaporeNow(): Date {
  return toZonedTime(new Date(), SINGAPORE_TZ);
}

export function formatSingaporeDate(date: Date | string, formatStr: string = 'yyyy-MM-dd HH:mm:ss'): string {
  const d = typeof date === 'string' ? new Date(date) : date;
  return format(toZonedTime(d, SINGAPORE_TZ), formatStr, { timeZone: SINGAPORE_TZ });
}

export function parseSingaporeDate(dateStr: string): Date {
  return toZonedTime(new Date(dateStr), SINGAPORE_TZ);
}
```

**Usage in API Routes:**
```typescript
import { getSingaporeNow, formatSingaporeDate } from '@/lib/timezone';

// When creating a todo
const now = getSingaporeNow();
const formattedDate = formatSingaporeDate(now, 'yyyy-MM-dd HH:mm:ss');
```

**Validation Example:**
```typescript
function validateDueDate(dueDate: string): boolean {
  const due = parseSingaporeDate(dueDate);
  const now = getSingaporeNow();
  return due >= now;  // Must be today or future
}
```

## UI Components

### Main Todo List Component

**Location:** `app/page.tsx` (client component)

**Component Structure:**
```typescript
'use client';

import { useState, useEffect } from 'react';
import { Todo, Priority } from '@/lib/db';

export default function HomePage() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [newDueDate, setNewDueDate] = useState('');
  const [newPriority, setNewPriority] = useState<Priority>('medium');
  const [loading, setLoading] = useState(false);

  // Fetch todos on mount
  useEffect(() => {
    fetchTodos();
  }, []);

  async function fetchTodos() {
    const res = await fetch('/api/todos');
    const data = await res.json();
    setTodos(data.todos);
  }

  async function handleAddTodo(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;

    // Optimistic UI update
    const tempTodo = {
      id: Date.now(),  // Temporary ID
      title: newTitle,
      due_date: newDueDate,
      priority: newPriority,
      completed: 0,
      // ... other fields
    };
    setTodos(prev => [...prev, tempTodo]);

    try {
      const res = await fetch('/api/todos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle,
          due_date: newDueDate,
          priority: newPriority,
        }),
      });

      if (!res.ok) throw new Error('Failed to create todo');

      const data = await res.json();
      // Replace temp todo with real one
      setTodos(prev => prev.map(t => t.id === tempTodo.id ? data.todo : t));
      
      // Reset form
      setNewTitle('');
      setNewDueDate('');
      setNewPriority('medium');
    } catch (error) {
      // Revert optimistic update
      setTodos(prev => prev.filter(t => t.id !== tempTodo.id));
      alert('Failed to add todo');
    }
  }

  async function handleToggleComplete(todo: Todo) {
    // Optimistic update
    setTodos(prev => prev.map(t => 
      t.id === todo.id 
        ? { ...t, completed: t.completed ? 0 : 1 }
        : t
    ));

    try {
      const res = await fetch(`/api/todos/${todo.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed: todo.completed ? 0 : 1 }),
      });

      if (!res.ok) throw new Error('Failed to update');

      const data = await res.json();
      // If recurring, add next instance
      if (data.next_todo) {
        setTodos(prev => [...prev, data.next_todo]);
      }
    } catch (error) {
      // Revert
      setTodos(prev => prev.map(t => 
        t.id === todo.id 
          ? { ...t, completed: t.completed ? 0 : 1 }
          : t
      ));
      alert('Failed to update todo');
    }
  }

  async function handleDeleteTodo(id: number) {
    if (!confirm('Delete this todo?')) return;

    // Optimistic removal
    const backup = todos.find(t => t.id === id);
    setTodos(prev => prev.filter(t => t.id !== id));

    try {
      const res = await fetch(`/api/todos/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete');
    } catch (error) {
      // Restore
      if (backup) setTodos(prev => [...prev, backup]);
      alert('Failed to delete todo');
    }
  }

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold mb-6">Todo App</h1>

      {/* Add Todo Form */}
      <form onSubmit={handleAddTodo} className="mb-8 space-y-4">
        <input
          type="text"
          value={newTitle}
          onChange={e => setNewTitle(e.target.value)}
          placeholder="Add a new todo..."
          className="w-full px-4 py-2 border rounded"
          maxLength={500}
        />
        <div className="flex gap-4">
          <select
            value={newPriority}
            onChange={e => setNewPriority(e.target.value as Priority)}
            className="px-4 py-2 border rounded"
          >
            <option value="low">Low</option>
            <option value="medium">Medium</option>
            <option value="high">High</option>
          </select>
          <input
            type="datetime-local"
            value={newDueDate}
            onChange={e => setNewDueDate(e.target.value)}
            className="px-4 py-2 border rounded"
          />
          <button
            type="submit"
            className="px-6 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
          >
            Add
          </button>
        </div>
      </form>

      {/* Todo List */}
      <div className="space-y-2">
        {todos.map(todo => (
          <div
            key={todo.id}
            className={`flex items-center gap-4 p-4 border rounded ${
              todo.completed ? 'bg-gray-100' : 'bg-white'
            }`}
          >
            <input
              type="checkbox"
              checked={!!todo.completed}
              onChange={() => handleToggleComplete(todo)}
              className="w-5 h-5"
            />
            <div className="flex-1">
              <h3 className={todo.completed ? 'line-through text-gray-500' : ''}>
                {todo.title}
              </h3>
              <p className="text-sm text-gray-500">
                Due: {new Date(todo.due_date).toLocaleString()}
              </p>
            </div>
            <span className={`px-2 py-1 rounded text-xs ${
              todo.priority === 'high' ? 'bg-red-100 text-red-800' :
              todo.priority === 'medium' ? 'bg-yellow-100 text-yellow-800' :
              'bg-green-100 text-green-800'
            }`}>
              {todo.priority}
            </span>
            <button
              onClick={() => handleDeleteTodo(todo.id)}
              className="px-3 py-1 text-red-500 hover:bg-red-50 rounded"
            >
              Delete
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
```

### Priority Badge Component

```typescript
function PriorityBadge({ priority }: { priority: Priority }) {
  const styles = {
    high: 'bg-red-100 text-red-800 border-red-300',
    medium: 'bg-yellow-100 text-yellow-800 border-yellow-300',
    low: 'bg-green-100 text-green-800 border-green-300',
  };

  return (
    <span className={`px-2 py-1 text-xs font-semibold rounded border ${styles[priority]}`}>
      {priority.toUpperCase()}
    </span>
  );
}
```

## Edge Cases

### 1. Timezone Edge Cases
- **Problem:** User creates todo at 23:55 SGT, server is in UTC
- **Solution:** Always convert to Singapore timezone before validation
- **Test:** Create todo at midnight boundary

### 2. Concurrent Updates
- **Problem:** User opens two tabs, updates same todo in both
- **Solution:** Last write wins, show conflict toast if detected
- **Test:** Simulate rapid concurrent updates

### 3. Optimistic UI Failures
- **Problem:** Network fails after optimistic update
- **Solution:** Revert UI state, show error message, offer retry
- **Test:** Mock API failure scenarios

### 4. Long Titles
- **Problem:** User enters 1000+ character titles
- **Solution:** Enforce 500 char limit in frontend and backend
- **Test:** Attempt to create todo with 501 chars

### 5. Invalid Date Format
- **Problem:** User manipulates API to send invalid date
- **Solution:** Validate ISO 8601 format, return 400 Bad Request
- **Test:** Send malformed date string via API

### 6. Orphaned Data on Delete
- **Problem:** Delete todo but subtasks remain
- **Solution:** Use CASCADE DELETE in foreign key constraints
- **Test:** Verify no orphaned records after deletion

### 7. Past Due Dates
- **Problem:** User selects yesterday's date
- **Solution:** Client-side and server-side validation to prevent past dates
- **Test:** Attempt to create todo with date < now

### 8. Session Expiry During Operation
- **Problem:** JWT expires while user is creating todo
- **Solution:** Return 401, redirect to login, preserve form data in localStorage
- **Test:** Simulate expired session

## Acceptance Criteria

### Create Todo
- [ ] User can create todo with title and due date
- [ ] Title is required (1-500 chars)
- [ ] Due date defaults to current date if not specified
- [ ] Priority defaults to 'medium'
- [ ] Todo appears immediately in list (optimistic update)
- [ ] Server-generated ID replaces temp ID on success
- [ ] Error message shown on failure, UI reverts
- [ ] Created todo stored in database with correct user_id

### Read Todos
- [ ] All incomplete todos load on page mount
- [ ] Todos sorted by: completion status → priority → due date
- [ ] Each todo displays: checkbox, title, due date, priority badge, actions
- [ ] Completed todos have gray background and strikethrough text
- [ ] Loading state shown while fetching

### Update Todo
- [ ] User can edit todo title, due date, priority
- [ ] Changes persist to database
- [ ] UI updates optimistically
- [ ] Validation errors shown inline
- [ ] Marking complete sets `completed_at` timestamp
- [ ] Recurring todos create next instance on completion

### Delete Todo
- [ ] Delete button removes todo from UI immediately
- [ ] Confirmation prompt shown (configurable)
- [ ] Associated subtasks deleted (cascade)
- [ ] Tag relationships removed
- [ ] UI reverts if API call fails
- [ ] Deleted todo removed from database

### Timezone Handling
- [ ] All dates stored in Singapore timezone
- [ ] Due date validation uses Singapore current time
- [ ] Displayed dates formatted in Singapore timezone
- [ ] No UTC conversion bugs

## Testing Requirements

### Unit Tests

**File:** `lib/db.test.ts`

```typescript
describe('todoDB', () => {
  test('create() inserts todo with correct fields', () => {
    const todo = todoDB.create({
      user_id: 1,
      title: 'Test Todo',
      due_date: '2026-02-10 10:00:00',
      priority: 'high',
    });
    
    expect(todo.id).toBeGreaterThan(0);
    expect(todo.title).toBe('Test Todo');
    expect(todo.completed).toBe(0);
  });

  test('findByUser() returns only user todos', () => {
    todoDB.create({ user_id: 1, title: 'User 1 Todo', due_date: '2026-02-10', priority: 'medium' });
    todoDB.create({ user_id: 2, title: 'User 2 Todo', due_date: '2026-02-10', priority: 'medium' });
    
    const todos = todoDB.findByUser(1);
    expect(todos.every(t => t.user_id === 1)).toBe(true);
  });

  test('update() modifies only specified fields', () => {
    const todo = todoDB.create({ user_id: 1, title: 'Original', due_date: '2026-02-10', priority: 'low' });
    todoDB.update(todo.id, { title: 'Updated' });
    
    const updated = todoDB.findById(todo.id);
    expect(updated.title).toBe('Updated');
    expect(updated.priority).toBe('low');  // Unchanged
  });

  test('delete() removes todo and cascades to subtasks', () => {
    const todo = todoDB.create({ user_id: 1, title: 'Parent', due_date: '2026-02-10', priority: 'medium' });
    subtaskDB.create({ todo_id: todo.id, title: 'Child', position: 0 });
    
    todoDB.delete(todo.id);
    
    expect(todoDB.findById(todo.id)).toBeNull();
    expect(subtaskDB.findByTodo(todo.id)).toHaveLength(0);
  });
});
```

### E2E Tests (Playwright)

**File:** `tests/02-todo-crud.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

test.describe('Todo CRUD Operations', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    // Assume user is authenticated
  });

  test('should create a new todo', async ({ page }) => {
    await page.fill('input[placeholder*="Add a new todo"]', 'Buy groceries');
    await page.selectOption('select[name="priority"]', 'high');
    await page.fill('input[type="datetime-local"]', '2026-02-10T14:00');
    await page.click('button:has-text("Add")');

    // Verify todo appears in list
    const todo = page.locator('text=Buy groceries');
    await expect(todo).toBeVisible();
    
    // Verify priority badge
    const badge = page.locator('.bg-red-100:has-text("HIGH")');
    await expect(badge).toBeVisible();
  });

  test('should mark todo as complete', async ({ page }) => {
    // Create a todo first
    await page.fill('input[placeholder*="Add a new todo"]', 'Complete me');
    await page.click('button:has-text("Add")');

    // Click checkbox
    const checkbox = page.locator('input[type="checkbox"]').first();
    await checkbox.check();

    // Verify strikethrough styling
    const todoText = page.locator('text=Complete me');
    await expect(todoText).toHaveClass(/line-through/);
  });

  test('should delete a todo', async ({ page }) => {
    // Create a todo
    await page.fill('input[placeholder*="Add a new todo"]', 'Delete me');
    await page.click('button:has-text("Add")');

    // Click delete button
    page.once('dialog', dialog => dialog.accept());  // Auto-accept confirmation
    await page.click('button:has-text("Delete")');

    // Verify todo is gone
    await expect(page.locator('text=Delete me')).not.toBeVisible();
  });

  test('should validate required title', async ({ page }) => {
    // Try to submit empty form
    await page.click('button:has-text("Add")');

    // Form should not submit (HTML5 validation)
    const todoCount = await page.locator('.todo-item').count();
    expect(todoCount).toBe(0);
  });

  test('should handle API failure gracefully', async ({ page }) => {
    // Mock API failure
    await page.route('/api/todos', route => route.abort());

    await page.fill('input[placeholder*="Add a new todo"]', 'Will fail');
    await page.click('button:has-text("Add")');

    // Verify error message
    await expect(page.locator('text=Failed to add todo')).toBeVisible();
    
    // Verify optimistic update was reverted
    await expect(page.locator('text=Will fail')).not.toBeVisible();
  });

  test('should sort todos correctly', async ({ page }) => {
    // Create todos with different priorities and dates
    const todos = [
      { title: 'Low priority', priority: 'low', date: '2026-02-15T10:00' },
      { title: 'High priority', priority: 'high', date: '2026-02-10T10:00' },
      { title: 'Medium priority', priority: 'medium', date: '2026-02-12T10:00' },
    ];

    for (const todo of todos) {
      await page.fill('input[placeholder*="Add a new todo"]', todo.title);
      await page.selectOption('select[name="priority"]', todo.priority);
      await page.fill('input[type="datetime-local"]', todo.date);
      await page.click('button:has-text("Add")');
    }

    // Verify order: high → medium → low
    const todoTitles = await page.locator('.todo-item h3').allTextContents();
    expect(todoTitles[0]).toContain('High priority');
    expect(todoTitles[1]).toContain('Medium priority');
    expect(todoTitles[2]).toContain('Low priority');
  });
});
```

## Out of Scope

The following features are **NOT** included in this PRP (covered in other PRPs):

- ❌ Subtask creation and management (see PRP-05)
- ❌ Tag assignment and filtering (see PRP-06)
- ❌ Recurring todo logic (see PRP-03)
- ❌ Reminder configuration (see PRP-04)
- ❌ Template creation from todos (see PRP-07)
- ❌ Advanced search and filtering (see PRP-08)
- ❌ Export/import functionality (see PRP-09)
- ❌ Calendar view (see PRP-10)
- ❌ User authentication (see PRP-11)

## Success Metrics

### Performance Metrics
- [ ] Todo creation completes in < 200ms (p95)
- [ ] List rendering handles 1000+ todos without lag
- [ ] Optimistic updates appear in < 50ms
- [ ] API response time < 100ms (p95)

### User Experience Metrics
- [ ] 0 data loss incidents due to failed operations
- [ ] 100% of validation errors caught before API call
- [ ] Timezone bugs: 0 reported incidents

### Code Quality Metrics
- [ ] Test coverage: 80%+ for database layer
- [ ] Test coverage: 90%+ for API routes
- [ ] E2E test coverage: All critical user flows
- [ ] TypeScript: No `any` types in CRUD operations

### Adoption Metrics
- [ ] User can create first todo in < 30 seconds
- [ ] 95%+ success rate for CRUD operations
- [ ] 0 orphaned database records after 1 week of use

## Implementation Checklist

### Phase 1: Database Layer
- [ ] Create `todos` table with all required columns
- [ ] Implement `todoDB.create()` method
- [ ] Implement `todoDB.findByUser()` method
- [ ] Implement `todoDB.findById()` method
- [ ] Implement `todoDB.update()` method
- [ ] Implement `todoDB.delete()` with cascade
- [ ] Add foreign key constraints

### Phase 2: API Routes
- [ ] Create `app/api/todos/route.ts` (GET, POST)
- [ ] Create `app/api/todos/[id]/route.ts` (GET, PUT, DELETE)
- [ ] Implement session authentication checks
- [ ] Add input validation for all endpoints
- [ ] Handle Singapore timezone conversions
- [ ] Add error handling and status codes

### Phase 3: Client UI
- [ ] Create main page component at `app/page.tsx`
- [ ] Implement todo list rendering
- [ ] Add create todo form
- [ ] Implement optimistic UI updates
- [ ] Add edit functionality
- [ ] Add delete confirmation
- [ ] Implement error toasts
- [ ] Add loading states

### Phase 4: Testing
- [ ] Write unit tests for `todoDB` methods
- [ ] Write API route integration tests
- [ ] Write E2E tests for all CRUD flows
- [ ] Test timezone edge cases
- [ ] Test concurrent update scenarios
- [ ] Test API failure handling

### Phase 5: Documentation
- [ ] Document API endpoints in README
- [ ] Add JSDoc comments to database methods
- [ ] Create USER_GUIDE.md section for CRUD operations
- [ ] Add inline code comments for complex logic

---

**Last Updated:** February 5, 2026  
**Version:** 1.0  
**Dependencies:** None (foundation feature)  
**Dependents:** All other features depend on this PRP
