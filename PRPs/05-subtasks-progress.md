# PRP-05: Subtasks & Progress Tracking

## Feature Overview

Implement checklist functionality with subtasks for todos, including visual progress tracking via progress bars and completion percentages. Subtasks support ordering via position field, individual completion tracking, and cascade deletion when parent todo is deleted. This enables granular task breakdown and motivational progress visualization.

## User Stories

### User Persona: Emma - Project Coordinator

**Story 1: Break Down Complex Tasks**
> As Emma, I want to add subtasks to a todo so that I can break down complex projects into manageable steps.

**Story 2: Track Completion Progress**
> As Emma, I want to see a progress bar showing how many subtasks are complete so that I can visualize my progress at a glance.

**Story 3: Reorder Subtasks**
> As Emma, I want to reorder subtasks by dragging or using arrows so that I can prioritize steps.

**Story 4: Complete Subtasks Individually**
> As Emma, I want to check off subtasks as I complete them so that I can track incremental progress without completing the entire todo.

**Story 5: Auto-complete Parent**
> As Emma, I want the parent todo to automatically be marked complete when all subtasks are done so that I don't have redundant actions.

## User Flow

### Add Subtask Flow
1. User hovers over existing todo item
2. User clicks "Add Subtask" button/icon
3. Inline input field appears below todo
4. User types subtask title
5. User presses Enter or clicks checkmark
6. Subtask appears indented below parent
7. Progress bar appears showing "0 of 1 completed (0%)"

### Complete Subtask Flow
1. User clicks checkbox next to subtask
2. Subtask text gets strikethrough style
3. Progress bar updates: "1 of 3 completed (33%)"
4. If all subtasks complete → parent todo checkbox enables
5. Optional: If all subtasks complete → auto-complete parent

### Reorder Subtasks Flow
1. User clicks up/down arrow buttons on subtask
2. Subtask swaps position with adjacent subtask
3. Position field in database updates (e.g., 0 ↔ 1)
4. UI reorders instantly without page reload

### Delete Subtask Flow
1. User clicks delete icon on subtask
2. Confirmation prompt (optional)
3. Subtask removed from UI immediately
4. Progress bar updates: "1 of 2 completed (50%)"
5. If last subtask deleted → progress bar hides

### Delete Parent Todo Flow
1. User deletes parent todo
2. Database CASCADE DELETE removes all subtasks automatically
3. Both parent and subtasks disappear from UI

## Technical Requirements

### Database Schema

```typescript
CREATE TABLE subtasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  todo_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  completed INTEGER DEFAULT 0,  -- Boolean: 0 or 1
  position INTEGER NOT NULL,    -- 0-indexed ordering
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (todo_id) REFERENCES todos(id) ON DELETE CASCADE
)

-- Index for efficient querying
CREATE INDEX idx_subtasks_todo_id ON subtasks(todo_id);
```

**Key Points:**
- `position`: 0-indexed integer for ordering (0 = first, 1 = second, etc.)
- `ON DELETE CASCADE`: Automatically deletes subtasks when parent todo deleted
- Index on `todo_id` for fast lookups

### TypeScript Types

```typescript
// From lib/db.ts
export interface Subtask {
  id: number;
  todo_id: number;
  title: string;
  completed: number;  // 0 or 1
  position: number;
  created_at: string;
}

export interface TodoWithSubtasks extends Todo {
  subtasks: Subtask[];
  progress?: {
    completed: number;
    total: number;
    percentage: number;
  };
}

// Helper to calculate progress
export function calculateProgress(subtasks: Subtask[]): {
  completed: number;
  total: number;
  percentage: number;
} {
  const total = subtasks.length;
  const completed = subtasks.filter(s => s.completed).length;
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

  return { completed, total, percentage };
}
```

### API Endpoints

#### 1. Create Subtask - `POST /api/subtasks`

**Request Body:**
```typescript
{
  todo_id: number;
  title: string;  // Required, 1-200 chars
}
```

**Response (201 Created):**
```typescript
{
  subtask: Subtask;  // Includes server-generated id, position
}
```

**Implementation:**
```typescript
// app/api/subtasks/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { subtaskDB, todoDB } from '@/lib/db';

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const body = await request.json();
  const { todo_id, title } = body;

  // Validate title
  if (!title || title.trim().length === 0 || title.length > 200) {
    return NextResponse.json(
      { error: 'Title must be 1-200 characters' },
      { status: 400 }
    );
  }

  // Verify todo exists and belongs to user
  const todo = todoDB.findById(todo_id);
  if (!todo || todo.user_id !== session.userId) {
    return NextResponse.json({ error: 'Todo not found' }, { status: 404 });
  }

  // Get next position (max + 1)
  const existingSubtasks = subtaskDB.findByTodo(todo_id);
  const nextPosition = existingSubtasks.length;  // 0-indexed, so length = next position

  const subtask = subtaskDB.create({
    todo_id,
    title: title.trim(),
    completed: 0,
    position: nextPosition,
  });

  return NextResponse.json({ subtask }, { status: 201 });
}
```

#### 2. Update Subtask - `PUT /api/subtasks/[id]`

**URL Parameter:** `id` (subtask ID)

**Request Body:**
```typescript
{
  title?: string;
  completed?: number;  // 0 or 1
  position?: number;
}
```

**Response (200 OK):**
```typescript
{
  subtask: Subtask;
}
```

**Implementation:**
```typescript
// app/api/subtasks/[id]/route.ts
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const body = await request.json();
  const subtask = subtaskDB.findById(Number(id));

  if (!subtask) {
    return NextResponse.json({ error: 'Subtask not found' }, { status: 404 });
  }

  // Verify ownership via parent todo
  const todo = todoDB.findById(subtask.todo_id);
  if (!todo || todo.user_id !== session.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  // Update subtask
  const updated = subtaskDB.update(Number(id), body);

  return NextResponse.json({ subtask: updated });
}
```

#### 3. Delete Subtask - `DELETE /api/subtasks/[id]`

**URL Parameter:** `id` (subtask ID)

**Response (200 OK):**
```typescript
{
  success: true;
}
```

**Implementation:**
```typescript
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const subtask = subtaskDB.findById(Number(id));
  if (!subtask) {
    return NextResponse.json({ error: 'Subtask not found' }, { status: 404 });
  }

  // Verify ownership
  const todo = todoDB.findById(subtask.todo_id);
  if (!todo || todo.user_id !== session.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  subtaskDB.delete(Number(id));

  // Reorder remaining subtasks (close gaps in position)
  const remaining = subtaskDB.findByTodo(subtask.todo_id);
  remaining.sort((a, b) => a.position - b.position);
  remaining.forEach((s, index) => {
    if (s.position !== index) {
      subtaskDB.update(s.id, { position: index });
    }
  });

  return NextResponse.json({ success: true });
}
```

#### 4. Reorder Subtasks - `POST /api/subtasks/reorder`

**Request Body:**
```typescript
{
  subtask_id: number;
  new_position: number;
}
```

**Response (200 OK):**
```typescript
{
  subtasks: Subtask[];  // All subtasks for the todo, reordered
}
```

**Implementation:**
```typescript
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { subtask_id, new_position } = await request.json();
  const subtask = subtaskDB.findById(subtask_id);

  if (!subtask) {
    return NextResponse.json({ error: 'Subtask not found' }, { status: 404 });
  }

  // Verify ownership
  const todo = todoDB.findById(subtask.todo_id);
  if (!todo || todo.user_id !== session.userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
  }

  // Reorder logic
  const allSubtasks = subtaskDB.findByTodo(subtask.todo_id);
  const oldPosition = subtask.position;

  if (new_position < 0 || new_position >= allSubtasks.length) {
    return NextResponse.json({ error: 'Invalid position' }, { status: 400 });
  }

  // Shift positions
  if (new_position < oldPosition) {
    // Moving up: shift others down
    allSubtasks.forEach(s => {
      if (s.position >= new_position && s.position < oldPosition) {
        subtaskDB.update(s.id, { position: s.position + 1 });
      }
    });
  } else if (new_position > oldPosition) {
    // Moving down: shift others up
    allSubtasks.forEach(s => {
      if (s.position > oldPosition && s.position <= new_position) {
        subtaskDB.update(s.id, { position: s.position - 1 });
      }
    });
  }

  // Update target subtask
  subtaskDB.update(subtask_id, { position: new_position });

  // Return reordered list
  const subtasks = subtaskDB.findByTodo(subtask.todo_id);
  subtasks.sort((a, b) => a.position - b.position);

  return NextResponse.json({ subtasks });
}
```

### Database Layer Updates

```typescript
// In lib/db.ts
export const subtaskDB = {
  /**
   * Create a new subtask
   */
  create(data: {
    todo_id: number;
    title: string;
    completed: number;
    position: number;
  }): Subtask {
    const stmt = db.prepare(`
      INSERT INTO subtasks (todo_id, title, completed, position)
      VALUES (?, ?, ?, ?)
    `);
    const info = stmt.run(data.todo_id, data.title, data.completed, data.position);
    return this.findById(Number(info.lastInsertRowid))!;
  },

  /**
   * Find subtask by ID
   */
  findById(id: number): Subtask | null {
    const stmt = db.prepare('SELECT * FROM subtasks WHERE id = ?');
    return stmt.get(id) as Subtask | null;
  },

  /**
   * Find all subtasks for a todo (sorted by position)
   */
  findByTodo(todoId: number): Subtask[] {
    const stmt = db.prepare(`
      SELECT * FROM subtasks 
      WHERE todo_id = ? 
      ORDER BY position ASC
    `);
    return stmt.all(todoId) as Subtask[];
  },

  /**
   * Update subtask
   */
  update(id: number, data: Partial<Subtask>): Subtask {
    const fields = Object.keys(data);
    const values = Object.values(data);
    
    const setClause = fields.map(f => `${f} = ?`).join(', ');
    const stmt = db.prepare(`UPDATE subtasks SET ${setClause} WHERE id = ?`);
    stmt.run(...values, id);
    
    return this.findById(id)!;
  },

  /**
   * Delete subtask
   */
  delete(id: number): void {
    const stmt = db.prepare('DELETE FROM subtasks WHERE id = ?');
    stmt.run(id);
  },

  /**
   * Delete all subtasks for a todo (called automatically via CASCADE)
   */
  deleteByTodo(todoId: number): void {
    const stmt = db.prepare('DELETE FROM subtasks WHERE todo_id = ?');
    stmt.run(todoId);
  },
};
```

## UI Components

### Subtask List Component

```typescript
import { Subtask } from '@/lib/db';
import { SubtaskItem } from './SubtaskItem';
import { SubtaskInput } from './SubtaskInput';

interface SubtaskListProps {
  todoId: number;
  subtasks: Subtask[];
  onUpdate: () => void;  // Refresh parent data
}

export function SubtaskList({ todoId, subtasks, onUpdate }: SubtaskListProps) {
  const [isAdding, setIsAdding] = useState(false);

  async function handleAdd(title: string) {
    const res = await fetch('/api/subtasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ todo_id: todoId, title }),
    });

    if (res.ok) {
      setIsAdding(false);
      onUpdate();
    }
  }

  return (
    <div className="ml-8 mt-2 space-y-1">
      {subtasks.map((subtask) => (
        <SubtaskItem
          key={subtask.id}
          subtask={subtask}
          onUpdate={onUpdate}
        />
      ))}

      {isAdding ? (
        <SubtaskInput
          onSubmit={handleAdd}
          onCancel={() => setIsAdding(false)}
        />
      ) : (
        <button
          onClick={() => setIsAdding(true)}
          className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
        >
          <span>+</span> Add subtask
        </button>
      )}
    </div>
  );
}
```

### Subtask Item Component

```typescript
interface SubtaskItemProps {
  subtask: Subtask;
  onUpdate: () => void;
}

export function SubtaskItem({ subtask, onUpdate }: SubtaskItemProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [title, setTitle] = useState(subtask.title);

  async function handleToggle() {
    await fetch(`/api/subtasks/${subtask.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: subtask.completed ? 0 : 1 }),
    });
    onUpdate();
  }

  async function handleSave() {
    await fetch(`/api/subtasks/${subtask.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title }),
    });
    setIsEditing(false);
    onUpdate();
  }

  async function handleDelete() {
    if (!confirm('Delete this subtask?')) return;

    await fetch(`/api/subtasks/${subtask.id}`, { method: 'DELETE' });
    onUpdate();
  }

  async function handleMove(direction: 'up' | 'down') {
    const newPosition = direction === 'up' ? subtask.position - 1 : subtask.position + 1;

    await fetch('/api/subtasks/reorder', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ subtask_id: subtask.id, new_position: newPosition }),
    });
    onUpdate();
  }

  return (
    <div className="flex items-center gap-2 py-1 px-2 hover:bg-gray-50 rounded group">
      <input
        type="checkbox"
        checked={!!subtask.completed}
        onChange={handleToggle}
        className="w-4 h-4"
      />

      {isEditing ? (
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={handleSave}
          onKeyDown={(e) => e.key === 'Enter' && handleSave()}
          className="flex-1 px-2 py-1 border rounded"
          autoFocus
        />
      ) : (
        <span
          className={`flex-1 text-sm ${
            subtask.completed ? 'line-through text-gray-500' : 'text-gray-700'
          }`}
          onDoubleClick={() => setIsEditing(true)}
        >
          {subtask.title}
        </span>
      )}

      {/* Reorder buttons (show on hover) */}
      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition">
        <button
          onClick={() => handleMove('up')}
          className="p-1 hover:bg-gray-200 rounded"
          title="Move up"
        >
          ↑
        </button>
        <button
          onClick={() => handleMove('down')}
          className="p-1 hover:bg-gray-200 rounded"
          title="Move down"
        >
          ↓
        </button>
        <button
          onClick={handleDelete}
          className="p-1 text-red-500 hover:bg-red-50 rounded"
          title="Delete"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
```

### Progress Bar Component

```typescript
import { calculateProgress, Subtask } from '@/lib/db';

interface ProgressBarProps {
  subtasks: Subtask[];
}

export function ProgressBar({ subtasks }: ProgressBarProps) {
  if (subtasks.length === 0) return null;

  const { completed, total, percentage } = calculateProgress(subtasks);

  return (
    <div className="mt-2 space-y-1">
      <div className="flex items-center justify-between text-xs text-gray-600">
        <span>{completed} of {total} completed</span>
        <span>{percentage}%</span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-2">
        <div
          className="bg-blue-500 h-2 rounded-full transition-all duration-300"
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
```

### Todo Item with Subtasks

```typescript
export function TodoItem({ todo }: { todo: TodoWithSubtasks }) {
  const [subtasks, setSubtasks] = useState(todo.subtasks || []);

  async function fetchSubtasks() {
    // Re-fetch subtasks after updates
    const res = await fetch(`/api/todos/${todo.id}`);
    const data = await res.json();
    setSubtasks(data.todo.subtasks);
  }

  return (
    <div className="border rounded-lg p-4">
      {/* Todo title and checkbox */}
      <div className="flex items-center gap-3">
        <input type="checkbox" checked={!!todo.completed} />
        <h3>{todo.title}</h3>
      </div>

      {/* Progress bar */}
      <ProgressBar subtasks={subtasks} />

      {/* Subtask list */}
      <SubtaskList
        todoId={todo.id}
        subtasks={subtasks}
        onUpdate={fetchSubtasks}
      />
    </div>
  );
}
```

## Edge Cases

### 1. Empty Subtask Title
- **Problem:** User submits empty or whitespace-only subtask
- **Solution:** Validation on frontend and backend (trim and check length)
- **Test:** Attempt to create subtask with empty title

### 2. Reordering at Boundaries
- **Problem:** User tries to move first subtask up or last subtask down
- **Solution:** Disable buttons when at boundaries
- **Test:** Verify up button disabled on first item, down button disabled on last

### 3. Concurrent Reordering
- **Problem:** Two users reorder subtasks simultaneously
- **Solution:** Use database transactions, last write wins
- **Test:** Simulate concurrent reorder requests

### 4. Delete Parent with Many Subtasks
- **Problem:** Deleting todo with 100+ subtasks could be slow
- **Solution:** CASCADE DELETE is efficient, but add loading state
- **Test:** Delete todo with 100 subtasks, verify all deleted

### 5. Position Gaps After Deletion
- **Problem:** Deleting subtask at position 1 leaves gaps (0, 2, 3...)
- **Solution:** Reorder remaining subtasks to close gaps
- **Test:** Delete middle subtask, verify positions are 0, 1, 2...

### 6. All Subtasks Complete
- **Problem:** Should parent todo auto-complete?
- **Solution:** Optional behavior (implement as user preference or default to manual)
- **Test:** Complete all subtasks, verify parent remains incomplete

### 7. Subtask Created on Completed Todo
- **Problem:** User adds subtask to already-completed parent
- **Solution:** Allow it, but show warning or auto-uncomplete parent
- **Test:** Add subtask to completed todo

### 8. Long Subtask Titles
- **Problem:** 500-character subtask title breaks UI
- **Solution:** Enforce 200-character limit, truncate in UI with tooltip
- **Test:** Create subtask with 201 characters

## Acceptance Criteria

### Subtask Creation
- [ ] User can add subtask to any todo
- [ ] Subtask title required (1-200 chars)
- [ ] New subtasks appended to bottom (highest position)
- [ ] Subtask appears immediately in UI
- [ ] Progress bar updates after creation

### Subtask Completion
- [ ] User can toggle subtask completion independently
- [ ] Completed subtasks have strikethrough styling
- [ ] Progress bar updates dynamically
- [ ] Percentage calculation accurate

### Subtask Ordering
- [ ] Subtasks displayed in position order (0→N)
- [ ] User can move subtasks up/down
- [ ] Reorder buttons disabled at boundaries
- [ ] Position gaps closed after deletion
- [ ] Order persists after page reload

### Visual Progress Tracking
- [ ] Progress bar shows completed/total counts
- [ ] Percentage displayed (0-100%)
- [ ] Bar width animates smoothly
- [ ] Bar color indicates progress (blue for incomplete, green for 100%)
- [ ] Hidden when no subtasks exist

### Cascade Deletion
- [ ] Deleting parent todo removes all subtasks
- [ ] No orphaned subtasks in database
- [ ] Fast deletion (< 500ms for 100 subtasks)

### Edit & Delete
- [ ] User can edit subtask title (double-click or button)
- [ ] User can delete individual subtask
- [ ] Deletion confirmation prompt (optional)
- [ ] UI updates optimistically

## Testing Requirements

### Unit Tests

**File:** `lib/db.test.ts`

```typescript
describe('subtaskDB', () => {
  test('create() assigns next position automatically', () => {
    const todo = todoDB.create({ user_id: 1, title: 'Parent', due_date: '2026-02-10', priority: 'medium' });
    
    const sub1 = subtaskDB.create({ todo_id: todo.id, title: 'First', completed: 0, position: 0 });
    const sub2 = subtaskDB.create({ todo_id: todo.id, title: 'Second', completed: 0, position: 1 });

    expect(sub1.position).toBe(0);
    expect(sub2.position).toBe(1);
  });

  test('findByTodo() returns subtasks sorted by position', () => {
    const todo = todoDB.create({ user_id: 1, title: 'Parent', due_date: '2026-02-10', priority: 'medium' });
    
    subtaskDB.create({ todo_id: todo.id, title: 'Third', completed: 0, position: 2 });
    subtaskDB.create({ todo_id: todo.id, title: 'First', completed: 0, position: 0 });
    subtaskDB.create({ todo_id: todo.id, title: 'Second', completed: 0, position: 1 });

    const subtasks = subtaskDB.findByTodo(todo.id);
    expect(subtasks.map(s => s.title)).toEqual(['First', 'Second', 'Third']);
  });

  test('calculateProgress() computes correct percentage', () => {
    const subtasks = [
      { completed: 1 },
      { completed: 0 },
      { completed: 1 },
    ];

    const progress = calculateProgress(subtasks as Subtask[]);
    expect(progress.completed).toBe(2);
    expect(progress.total).toBe(3);
    expect(progress.percentage).toBe(67);  // Rounded
  });

  test('cascade delete removes subtasks when todo deleted', () => {
    const todo = todoDB.create({ user_id: 1, title: 'Parent', due_date: '2026-02-10', priority: 'medium' });
    subtaskDB.create({ todo_id: todo.id, title: 'Child', completed: 0, position: 0 });

    todoDB.delete(todo.id);

    const subtasks = subtaskDB.findByTodo(todo.id);
    expect(subtasks).toHaveLength(0);
  });
});
```

### E2E Tests (Playwright)

**File:** `tests/06-subtasks-progress.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

test.describe('Subtasks & Progress Tracking', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should add subtask to todo', async ({ page }) => {
    // Create todo
    await page.fill('input[placeholder*="Add a new todo"]', 'Project setup');
    await page.click('button:has-text("Add")');

    // Add subtask
    await page.click('button:has-text("Add subtask")');
    await page.fill('input[placeholder="Subtask title"]', 'Install dependencies');
    await page.press('input[placeholder="Subtask title"]', 'Enter');

    // Verify subtask appears
    await expect(page.locator('text=Install dependencies')).toBeVisible();
  });

  test('should show progress bar', async ({ page }) => {
    // Create todo with subtasks
    await page.fill('input[placeholder*="Add a new todo"]', 'Todo with progress');
    await page.click('button:has-text("Add")');

    await page.click('button:has-text("Add subtask")');
    await page.fill('input[placeholder="Subtask title"]', 'Subtask 1');
    await page.press('input[placeholder="Subtask title"]', 'Enter');

    // Verify progress bar shows
    await expect(page.locator('text=0 of 1 completed')).toBeVisible();
    await expect(page.locator('text=0%')).toBeVisible();
  });

  test('should update progress on subtask completion', async ({ page }) => {
    // Setup: todo with 2 subtasks
    await page.fill('input[placeholder*="Add a new todo"]', 'Progress test');
    await page.click('button:has-text("Add")');

    await page.click('button:has-text("Add subtask")');
    await page.fill('input[placeholder="Subtask title"]', 'Task 1');
    await page.press('input[placeholder="Subtask title"]', 'Enter');

    await page.click('button:has-text("Add subtask")');
    await page.fill('input[placeholder="Subtask title"]', 'Task 2');
    await page.press('input[placeholder="Subtask title"]', 'Enter');

    // Complete first subtask
    await page.click('input[type="checkbox"][aria-label*="Task 1"]');

    // Verify progress
    await expect(page.locator('text=1 of 2 completed')).toBeVisible();
    await expect(page.locator('text=50%')).toBeVisible();

    // Verify progress bar width
    const progressBar = page.locator('.bg-blue-500');
    const width = await progressBar.evaluate(el => el.style.width);
    expect(width).toBe('50%');
  });

  test('should reorder subtasks', async ({ page }) => {
    // Create todo with 2 subtasks
    await page.fill('input[placeholder*="Add a new todo"]', 'Reorder test');
    await page.click('button:has-text("Add")');

    await page.click('button:has-text("Add subtask")');
    await page.fill('input[placeholder="Subtask title"]', 'First');
    await page.press('input[placeholder="Subtask title"]', 'Enter');

    await page.click('button:has-text("Add subtask")');
    await page.fill('input[placeholder="Subtask title"]', 'Second');
    await page.press('input[placeholder="Subtask title"]', 'Enter');

    // Move second up
    const secondSubtask = page.locator('text=Second').locator('..');
    await secondSubtask.hover();
    await secondSubtask.locator('button[title="Move up"]').click();

    // Verify order changed
    const subtasks = await page.locator('.subtask-item').allTextContents();
    expect(subtasks[0]).toContain('Second');
    expect(subtasks[1]).toContain('First');
  });

  test('should delete subtask', async ({ page }) => {
    // Create todo with subtask
    await page.fill('input[placeholder*="Add a new todo"]', 'Delete test');
    await page.click('button:has-text("Add")');

    await page.click('button:has-text("Add subtask")');
    await page.fill('input[placeholder="Subtask title"]', 'To be deleted');
    await page.press('input[placeholder="Subtask title"]', 'Enter');

    // Delete subtask
    page.once('dialog', dialog => dialog.accept());
    await page.hover('text=To be deleted');
    await page.click('button[title="Delete"]');

    // Verify gone
    await expect(page.locator('text=To be deleted')).not.toBeVisible();
  });

  test('should cascade delete subtasks with parent', async ({ page }) => {
    // Create todo with subtasks
    await page.fill('input[placeholder*="Add a new todo"]', 'Cascade test');
    await page.click('button:has-text("Add")');

    await page.click('button:has-text("Add subtask")');
    await page.fill('input[placeholder="Subtask title"]', 'Child task');
    await page.press('input[placeholder="Subtask title"]', 'Enter');

    // Delete parent
    page.once('dialog', dialog => dialog.accept());
    await page.click('button[aria-label="Delete todo"]');

    // Verify both gone
    await expect(page.locator('text=Cascade test')).not.toBeVisible();
    await expect(page.locator('text=Child task')).not.toBeVisible();
  });

  test('should edit subtask title', async ({ page }) => {
    // Create subtask
    await page.fill('input[placeholder*="Add a new todo"]', 'Edit test');
    await page.click('button:has-text("Add")');

    await page.click('button:has-text("Add subtask")');
    await page.fill('input[placeholder="Subtask title"]', 'Original title');
    await page.press('input[placeholder="Subtask title"]', 'Enter');

    // Double-click to edit
    await page.dblclick('text=Original title');
    await page.fill('input[value="Original title"]', 'Updated title');
    await page.press('input[value="Updated title"]', 'Enter');

    // Verify updated
    await expect(page.locator('text=Updated title')).toBeVisible();
    await expect(page.locator('text=Original title')).not.toBeVisible();
  });
});
```

## Out of Scope

The following features are **NOT** included in this PRP:

- ❌ Drag-and-drop reordering (only up/down arrows)
- ❌ Subtask due dates (only parent has due date)
- ❌ Nested subtasks (sub-subtasks)
- ❌ Subtask priority (only parent has priority)
- ❌ Bulk subtask operations (select multiple, delete all)
- ❌ Subtask templates

## Success Metrics

### Performance Metrics
- [ ] Subtask creation completes in < 150ms
- [ ] Progress bar updates in < 50ms
- [ ] Reordering completes in < 200ms
- [ ] Rendering 100 subtasks without lag

### User Experience Metrics
- [ ] Progress bar accurately reflects completion
- [ ] Subtask order persists after reload
- [ ] 100% cascade delete success rate
- [ ] Reorder buttons intuitive (no user confusion)

### Code Quality Metrics
- [ ] Test coverage: 90%+ for subtask logic
- [ ] All position gaps closed after operations
- [ ] No orphaned subtasks in database

### Adoption Metrics
- [ ] 40%+ of todos have subtasks
- [ ] Average 3-5 subtasks per todo
- [ ] Progress tracking increases completion rates by 15%

---

**Last Updated:** February 5, 2026  
**Version:** 1.0  
**Dependencies:** PRP-01 (Todo CRUD)  
**Dependents:** PRP-03 (Recurring - copies subtasks), PRP-07 (Templates - includes subtasks)
