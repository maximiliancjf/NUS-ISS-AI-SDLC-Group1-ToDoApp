# PRP-03: Recurring Todos

## Feature Overview

Implement recurring todo functionality that automatically creates the next instance when a todo is marked complete. Support four recurrence patterns: daily, weekly, monthly, and yearly. Each new instance inherits the parent's priority, tags, reminder settings, and subtask structure while calculating the next due date based on the recurrence pattern.

## User Stories

### User Persona: Mike - Fitness Enthusiast

**Story 1: Daily Workout**
> As Mike, I want to create a "Morning workout" todo that repeats every day so that I don't manually recreate it each morning.

**Story 2: Weekly Grocery Shopping**
> As Mike, I want a "Grocery shopping" todo that recurs weekly on Sunday so that I remember my regular errands.

**Story 3: Monthly Bill Payment**
> As Mike, I want a "Pay rent" todo that recurs on the 1st of each month so that I never miss a payment deadline.

**Story 4: Annual Health Checkup**
> As Mike, I want a "Health checkup" todo that repeats yearly so that I maintain annual appointments.

**Story 5: Stop Recurrence**
> As Mike, I want to remove recurrence from a todo so that it stops creating new instances after I complete it once.

## User Flow

### Create Recurring Todo Flow
1. User clicks "Show Advanced Options" in todo form
2. User selects recurrence pattern from dropdown:
   - None (default)
   - Daily
   - Weekly
   - Monthly
   - Yearly
3. User sets initial due date (e.g., "2026-02-10 09:00")
4. User adds todo title, priority, tags, reminder
5. User clicks "Add"
6. Todo created with `recurrence_pattern` field set

### Complete Recurring Todo Flow
1. User checks checkbox to mark recurring todo as complete
2. System sets `completed_at` timestamp
3. System calculates next due date based on pattern:
   - **Daily:** due_date + 1 day
   - **Weekly:** due_date + 7 days
   - **Monthly:** due_date + 1 month (same day)
   - **Yearly:** due_date + 1 year (same date)
4. System creates new todo instance with:
   - Same title
   - New calculated due date
   - Same priority
   - Same recurrence_pattern
   - Same reminder_minutes offset
   - Copied tags (many-to-many relationship)
   - Copied subtasks with reset completion status
   - completed = 0, completed_at = NULL
5. Both completed and new todo appear in list
6. UI shows toast: "Recurring todo completed. Next instance created for [date]"

### Edit Recurrence Pattern Flow
1. User clicks edit on existing todo
2. Form shows current recurrence pattern (if any)
3. User changes pattern or removes it
4. User saves changes
5. Future instances will use new pattern (existing completed instances unchanged)

### Remove Recurrence Flow
1. User edits todo
2. User selects "None" from recurrence dropdown
3. User saves
4. Todo will not create new instance on next completion

## Technical Requirements

### Database Schema

```typescript
// Already exists in todos table from PRP-01
CREATE TABLE todos (
  ...
  recurrence_pattern TEXT,  -- 'daily' | 'weekly' | 'monthly' | 'yearly' | NULL
  ...
)
```

**Key Points:**
- NULL means non-recurring
- Pattern stored as lowercase string for consistency
- No separate recurrence table needed (denormalized design)

### TypeScript Types

```typescript
// From lib/db.ts
export type RecurrencePattern = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface Todo {
  ...
  recurrence_pattern: RecurrencePattern | null;
  ...
}

// Recurrence metadata for UI
export interface RecurrenceConfig {
  value: RecurrencePattern | null;
  label: string;
  description: string;
  icon: string;
}

export const RECURRENCE_CONFIGS: Record<string, RecurrenceConfig> = {
  none: {
    value: null,
    label: 'Does not repeat',
    description: 'One-time task',
    icon: '🔵',
  },
  daily: {
    value: 'daily',
    label: 'Daily',
    description: 'Repeats every day',
    icon: '📅',
  },
  weekly: {
    value: 'weekly',
    label: 'Weekly',
    description: 'Repeats every week',
    icon: '📆',
  },
  monthly: {
    value: 'monthly',
    label: 'Monthly',
    description: 'Repeats every month',
    icon: '📊',
  },
  yearly: {
    value: 'yearly',
    label: 'Yearly',
    description: 'Repeats every year',
    icon: '🎂',
  },
};
```

### API Endpoints

#### 1. Create Recurring Todo - `POST /api/todos`

**Request Body:**
```typescript
{
  title: string;
  due_date: string;
  priority?: Priority;
  recurrence_pattern?: RecurrencePattern | null;
  reminder_minutes?: number | null;
}
```

**Validation:**
```typescript
function validateRecurrence(pattern?: string | null): RecurrencePattern | null {
  const valid: RecurrencePattern[] = ['daily', 'weekly', 'monthly', 'yearly'];
  if (!pattern || !valid.includes(pattern as RecurrencePattern)) {
    return null;
  }
  return pattern as RecurrencePattern;
}
```

#### 2. Complete Recurring Todo - `PUT /api/todos/[id]`

**Request Body:**
```typescript
{
  completed: 1;  // Mark as complete
}
```

**Response:**
```typescript
{
  todo: Todo;           // The completed todo
  next_todo?: Todo;     // The newly created next instance (if recurring)
}
```

**Implementation:**
```typescript
// In app/api/todos/[id]/route.ts
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const body = await request.json();
  const todo = todoDB.findById(Number(id));

  if (!todo || todo.user_id !== session.userId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  // Update the todo
  const updatedTodo = todoDB.update(Number(id), {
    ...body,
    completed_at: body.completed ? formatSingaporeDate(getSingaporeNow()) : null,
  });

  // If marked complete and has recurrence, create next instance
  let nextTodo: Todo | undefined;
  if (body.completed && todo.recurrence_pattern) {
    const nextDueDate = calculateNextDueDate(todo.due_date, todo.recurrence_pattern);

    // Create next todo
    nextTodo = todoDB.create({
      user_id: session.userId,
      title: todo.title,
      due_date: nextDueDate,
      priority: todo.priority,
      recurrence_pattern: todo.recurrence_pattern,
      reminder_minutes: todo.reminder_minutes ?? null,
      completed: 0,
    });

    // Copy tags
    const tags = tagDB.findByTodo(todo.id);
    tags.forEach(tag => {
      db.prepare('INSERT INTO todo_tags (todo_id, tag_id) VALUES (?, ?)').run(nextTodo!.id, tag.id);
    });

    // Copy subtasks
    const subtasks = subtaskDB.findByTodo(todo.id);
    subtasks.forEach(subtask => {
      subtaskDB.create({
        todo_id: nextTodo!.id,
        title: subtask.title,
        position: subtask.position,
        completed: 0,  // Reset completion
      });
    });
  }

  return NextResponse.json({ todo: updatedTodo, next_todo: nextTodo });
}
```

### Date Calculation Logic

**File:** `lib/recurrence.ts`

```typescript
import { addDays, addWeeks, addMonths, addYears } from 'date-fns';
import { toZonedTime, format } from 'date-fns-tz';
import { RecurrencePattern } from './db';

const SINGAPORE_TZ = 'Asia/Singapore';

/**
 * Calculate the next due date based on recurrence pattern
 * All calculations maintain Singapore timezone
 */
export function calculateNextDueDate(
  currentDueDate: string,
  pattern: RecurrencePattern
): string {
  const current = toZonedTime(new Date(currentDueDate), SINGAPORE_TZ);
  let next: Date;

  switch (pattern) {
    case 'daily':
      next = addDays(current, 1);
      break;
    case 'weekly':
      next = addWeeks(current, 1);
      break;
    case 'monthly':
      next = addMonths(current, 1);
      break;
    case 'yearly':
      next = addYears(current, 1);
      break;
    default:
      throw new Error(`Invalid recurrence pattern: ${pattern}`);
  }

  return format(toZonedTime(next, SINGAPORE_TZ), 'yyyy-MM-dd HH:mm:ss', {
    timeZone: SINGAPORE_TZ,
  });
}

/**
 * Calculate the next N occurrences for preview
 */
export function calculateNextOccurrences(
  startDate: string,
  pattern: RecurrencePattern,
  count: number = 5
): string[] {
  const occurrences: string[] = [startDate];
  let current = startDate;

  for (let i = 0; i < count - 1; i++) {
    current = calculateNextDueDate(current, pattern);
    occurrences.push(current);
  }

  return occurrences;
}
```

### Database Layer Updates

```typescript
// In lib/db.ts
export const todoDB = {
  // ... existing methods

  /**
   * Create next recurring instance
   * Copies tags and subtasks from parent
   */
  createRecurringInstance(parentTodo: Todo): Todo {
    if (!parentTodo.recurrence_pattern) {
      throw new Error('Todo is not recurring');
    }

    const nextDueDate = calculateNextDueDate(
      parentTodo.due_date,
      parentTodo.recurrence_pattern
    );

    // Create next todo
    const nextTodo = this.create({
      user_id: parentTodo.user_id,
      title: parentTodo.title,
      due_date: nextDueDate,
      priority: parentTodo.priority,
      recurrence_pattern: parentTodo.recurrence_pattern,
      reminder_minutes: parentTodo.reminder_minutes ?? null,
      completed: 0,
    });

    // Copy tags (many-to-many)
    const copyTagsStmt = db.prepare(`
      INSERT INTO todo_tags (todo_id, tag_id)
      SELECT ?, tag_id FROM todo_tags WHERE todo_id = ?
    `);
    copyTagsStmt.run(nextTodo.id, parentTodo.id);

    // Copy subtasks
    const subtasks = subtaskDB.findByTodo(parentTodo.id);
    subtasks.forEach(subtask => {
      subtaskDB.create({
        todo_id: nextTodo.id,
        title: subtask.title,
        position: subtask.position,
        completed: 0,
      });
    });

    return nextTodo;
  },

  /**
   * Get all recurring todos (incomplete)
   */
  findRecurringByUser(userId: number): Todo[] {
    const stmt = db.prepare(`
      SELECT * FROM todos 
      WHERE user_id = ? 
        AND recurrence_pattern IS NOT NULL
        AND completed = 0
      ORDER BY due_date ASC
    `);
    return stmt.all(userId) as Todo[];
  },
};
```

## UI Components

### Recurrence Dropdown Component

```typescript
import { RecurrencePattern, RECURRENCE_CONFIGS } from '@/lib/db';

interface RecurrenceSelectProps {
  value: RecurrencePattern | null;
  onChange: (pattern: RecurrencePattern | null) => void;
}

export function RecurrenceSelect({ value, onChange }: RecurrenceSelectProps) {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700">
        Repeat
      </label>
      <select
        value={value || 'none'}
        onChange={(e) => {
          const val = e.target.value;
          onChange(val === 'none' ? null : val as RecurrencePattern);
        }}
        className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
      >
        {Object.entries(RECURRENCE_CONFIGS).map(([key, config]) => (
          <option key={key} value={key}>
            {config.icon} {config.label} - {config.description}
          </option>
        ))}
      </select>
    </div>
  );
}
```

### Recurrence Badge Component

```typescript
interface RecurrenceBadgeProps {
  pattern: RecurrencePattern | null;
}

export function RecurrenceBadge({ pattern }: RecurrenceBadgeProps) {
  if (!pattern) return null;

  const config = RECURRENCE_CONFIGS[pattern];

  return (
    <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-purple-100 text-purple-800 rounded-full border border-purple-300">
      <span>{config.icon}</span>
      <span>{config.label}</span>
    </span>
  );
}
```

### Recurrence Preview Component

```typescript
import { calculateNextOccurrences } from '@/lib/recurrence';

interface RecurrencePreviewProps {
  dueDate: string;
  pattern: RecurrencePattern | null;
}

export function RecurrencePreview({ dueDate, pattern }: RecurrencePreviewProps) {
  if (!pattern || !dueDate) return null;

  const occurrences = calculateNextOccurrences(dueDate, pattern, 5);

  return (
    <div className="mt-2 p-3 bg-blue-50 border border-blue-200 rounded-lg">
      <h4 className="text-sm font-semibold text-blue-900 mb-2">
        Next 5 occurrences:
      </h4>
      <ul className="space-y-1 text-sm text-blue-800">
        {occurrences.map((date, index) => (
          <li key={index}>
            {index + 1}. {new Date(date).toLocaleString('en-SG', {
              dateStyle: 'medium',
              timeStyle: 'short',
              timeZone: 'Asia/Singapore',
            })}
          </li>
        ))}
      </ul>
    </div>
  );
}
```

### Todo Form with Recurrence

```typescript
'use client';

import { useState } from 'react';
import { Priority, RecurrencePattern } from '@/lib/db';
import { RecurrenceSelect } from '@/components/RecurrenceSelect';
import { RecurrencePreview } from '@/components/RecurrencePreview';

export function TodoForm() {
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState<Priority>('medium');
  const [recurrence, setRecurrence] = useState<RecurrencePattern | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const res = await fetch('/api/todos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        due_date: dueDate,
        priority,
        recurrence_pattern: recurrence,
      }),
    });

    if (res.ok) {
      // Reset form
      setTitle('');
      setDueDate('');
      setPriority('medium');
      setRecurrence(null);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Add a new todo..."
        className="w-full px-4 py-2 border rounded-lg"
        required
      />

      <div className="flex gap-4">
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value as Priority)}
          className="px-4 py-2 border rounded-lg"
        >
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>

        <input
          type="datetime-local"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className="px-4 py-2 border rounded-lg"
          required
        />

        <button type="submit" className="px-6 py-2 bg-blue-500 text-white rounded-lg">
          Add
        </button>
      </div>

      {/* Advanced Options */}
      <button
        type="button"
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="text-sm text-blue-600 hover:underline"
      >
        {showAdvanced ? '▼' : '▶'} Show Advanced Options
      </button>

      {showAdvanced && (
        <div className="space-y-4 p-4 bg-gray-50 border rounded-lg">
          <RecurrenceSelect value={recurrence} onChange={setRecurrence} />
          <RecurrencePreview dueDate={dueDate} pattern={recurrence} />
        </div>
      )}
    </form>
  );
}
```

## Edge Cases

### 1. Month End Dates (February Leap Year)
- **Problem:** Todo recurs monthly on Jan 31, but Feb only has 28/29 days
- **Solution:** `date-fns.addMonths()` handles this automatically (moves to last day of month)
- **Test:** Create monthly todo on Jan 31, verify Feb instance is Feb 28/29

### 2. Daylight Saving Time (Not applicable for Singapore)
- **Problem:** Some countries have DST, causing time shifts
- **Solution:** Singapore has no DST, but `date-fns-tz` handles it correctly
- **Test:** N/A for Singapore timezone

### 3. Leap Year (Feb 29)
- **Problem:** Yearly recurrence starting Feb 29, 2024 → Feb 2025 has no 29th
- **Solution:** `date-fns.addYears()` moves to Feb 28 in non-leap years
- **Test:** Create yearly todo on Feb 29, 2024, verify 2025 instance is Feb 28

### 4. Completing Past Recurring Todo
- **Problem:** User completes a recurring todo after its due date has passed
- **Solution:** Calculate next instance from original due date, not current date
- **Test:** Complete a weekly todo 3 days late, verify next instance is 1 week from original, not today

### 5. Rapid Completion (Double-click)
- **Problem:** User clicks complete twice rapidly, creating duplicate instances
- **Solution:** Debounce completion handler, check if already completed before creating next
- **Test:** Simulate rapid double-click on checkbox

### 6. Orphaned Recurring Instances
- **Problem:** User deletes parent todo, but later instances already created
- **Solution:** Each instance is independent; deleting one doesn't affect others
- **Test:** Delete a recurring todo, verify next instance still exists (if already created)

### 7. Edit Recurrence After Completion
- **Problem:** User changes recurrence pattern on completed todo
- **Solution:** Pattern change only affects future completions, not past completed instances
- **Test:** Complete recurring todo, edit pattern, verify next completion uses new pattern

### 8. Timezone Boundary Edge Case
- **Problem:** Todo due at 23:59, completed at 00:01 next day
- **Solution:** Always use Singapore timezone for date arithmetic
- **Test:** Create todo due Feb 10 23:59 SGT, complete after midnight

## Acceptance Criteria

### Recurrence Creation
- [ ] User can select recurrence pattern when creating todo
- [ ] Four patterns supported: daily, weekly, monthly, yearly
- [ ] Non-recurring todos have pattern = NULL
- [ ] Pattern persists to database correctly
- [ ] Recurrence badge appears on recurring todos

### Recurring Completion Logic
- [ ] Marking recurring todo complete creates next instance
- [ ] Next due date calculated correctly for all patterns
- [ ] New instance inherits: title, priority, tags, reminder_minutes, recurrence_pattern
- [ ] New instance subtasks copied with reset completion status
- [ ] Original todo remains completed with completed_at timestamp
- [ ] Both todos visible in list (filter by completion status)

### Date Calculations
- [ ] Daily: Adds exactly 24 hours (1 day)
- [ ] Weekly: Adds exactly 7 days
- [ ] Monthly: Same day next month (handles variable month lengths)
- [ ] Yearly: Same date next year (handles leap years)
- [ ] All calculations use Singapore timezone

### Recurrence Updates
- [ ] User can change recurrence pattern on existing todo
- [ ] User can remove recurrence (set to NULL)
- [ ] Pattern updates only affect future completions
- [ ] Editing completed recurring todo doesn't recreate next instance

### UI/UX
- [ ] Recurrence dropdown accessible in advanced options
- [ ] Recurrence badge displays on list items
- [ ] Preview shows next 5 occurrences
- [ ] Toast notification confirms next instance created with date
- [ ] Edit form pre-populates current recurrence value

## Testing Requirements

### Unit Tests

**File:** `lib/recurrence.test.ts`

```typescript
import { describe, test, expect } from 'vitest';
import { calculateNextDueDate, calculateNextOccurrences } from './recurrence';

describe('calculateNextDueDate', () => {
  test('daily adds 1 day', () => {
    const next = calculateNextDueDate('2026-02-10 10:00:00', 'daily');
    expect(next).toBe('2026-02-11 10:00:00');
  });

  test('weekly adds 7 days', () => {
    const next = calculateNextDueDate('2026-02-10 10:00:00', 'weekly');
    expect(next).toBe('2026-02-17 10:00:00');
  });

  test('monthly handles end-of-month correctly', () => {
    const next = calculateNextDueDate('2026-01-31 10:00:00', 'monthly');
    // Feb only has 28 days in 2026
    expect(next).toBe('2026-02-28 10:00:00');
  });

  test('yearly handles leap year correctly', () => {
    const next = calculateNextDueDate('2024-02-29 10:00:00', 'yearly');
    // 2025 is not a leap year
    expect(next).toBe('2025-02-28 10:00:00');
  });

  test('preserves time component', () => {
    const next = calculateNextDueDate('2026-02-10 23:59:59', 'daily');
    expect(next).toBe('2026-02-11 23:59:59');
  });
});

describe('calculateNextOccurrences', () => {
  test('returns correct number of occurrences', () => {
    const occurrences = calculateNextOccurrences('2026-02-10 10:00:00', 'daily', 5);
    expect(occurrences).toHaveLength(5);
  });

  test('weekly occurrences are 7 days apart', () => {
    const occurrences = calculateNextOccurrences('2026-02-10 10:00:00', 'weekly', 3);
    expect(occurrences[0]).toBe('2026-02-10 10:00:00');
    expect(occurrences[1]).toBe('2026-02-17 10:00:00');
    expect(occurrences[2]).toBe('2026-02-24 10:00:00');
  });
});
```

### E2E Tests (Playwright)

**File:** `tests/04-recurring-todos.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

test.describe('Recurring Todos', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should create daily recurring todo', async ({ page }) => {
    await page.fill('input[placeholder*="Add a new todo"]', 'Daily standup');
    await page.fill('input[type="datetime-local"]', '2026-02-10T09:00');
    
    // Show advanced options
    await page.click('button:has-text("Show Advanced Options")');
    await page.selectOption('select[aria-label="Recurrence"]', 'daily');
    await page.click('button:has-text("Add")');

    // Verify recurrence badge
    const badge = page.locator('.bg-purple-100:has-text("Daily")');
    await expect(badge).toBeVisible();
  });

  test('should create next instance when completed', async ({ page }) => {
    // Create recurring todo
    await page.fill('input[placeholder*="Add a new todo"]', 'Weekly meeting');
    await page.fill('input[type="datetime-local"]', '2026-02-10T14:00');
    await page.click('button:has-text("Show Advanced Options")');
    await page.selectOption('select[aria-label="Recurrence"]', 'weekly');
    await page.click('button:has-text("Add")');

    // Mark as complete
    await page.click('input[type="checkbox"]');

    // Verify toast notification
    await expect(page.locator('text=Next instance created')).toBeVisible();

    // Verify new instance with correct due date (7 days later)
    const todos = page.locator('.todo-item:has-text("Weekly meeting")');
    await expect(todos).toHaveCount(2);  // Completed + new instance
  });

  test('should copy tags to next recurring instance', async ({ page }) => {
    // Create tag
    await page.click('button:has-text("Manage Tags")');
    await page.fill('input[placeholder="Tag name"]', 'Work');
    await page.click('button:has-text("Add Tag")');

    // Create recurring todo with tag
    await page.fill('input[placeholder*="Add a new todo"]', 'Daily report');
    await page.click('button:has-text("Show Advanced Options")');
    await page.selectOption('select[aria-label="Recurrence"]', 'daily');
    await page.check('input[type="checkbox"][value="Work"]');
    await page.click('button:has-text("Add")');

    // Complete todo
    await page.click('input[type="checkbox"]');

    // Verify next instance has same tag
    const newTodo = page.locator('.todo-item:has-text("Daily report")').last();
    await expect(newTodo.locator('.tag-badge:has-text("Work")')).toBeVisible();
  });

  test('should copy subtasks to next recurring instance', async ({ page }) => {
    // Create recurring todo
    await page.fill('input[placeholder*="Add a new todo"]', 'Weekly cleanup');
    await page.click('button:has-text("Show Advanced Options")');
    await page.selectOption('select[aria-label="Recurrence"]', 'weekly');
    await page.click('button:has-text("Add")');

    // Add subtask
    await page.click('button[aria-label="Add subtask"]');
    await page.fill('input[placeholder="Subtask title"]', 'Empty trash');
    await page.press('input[placeholder="Subtask title"]', 'Enter');

    // Complete main todo
    await page.click('input[type="checkbox"][aria-label="Mark todo complete"]');

    // Verify next instance has subtask (uncompleted)
    const newTodo = page.locator('.todo-item:has-text("Weekly cleanup")').last();
    await expect(newTodo.locator('text=Empty trash')).toBeVisible();
    
    // Subtask should not be checked
    const subtaskCheckbox = newTodo.locator('input[type="checkbox"][aria-label="Mark subtask complete"]');
    await expect(subtaskCheckbox).not.toBeChecked();
  });

  test('should handle monthly recurrence on month-end', async ({ page }) => {
    // Create todo on Jan 31
    await page.fill('input[placeholder*="Add a new todo"]', 'Monthly report');
    await page.fill('input[type="datetime-local"]', '2026-01-31T17:00');
    await page.click('button:has-text("Show Advanced Options")');
    await page.selectOption('select[aria-label="Recurrence"]', 'monthly');
    await page.click('button:has-text("Add")');

    // Complete todo
    await page.click('input[type="checkbox"]');

    // Next instance should be Feb 28 (since Feb doesn't have 31 days)
    const nextTodo = page.locator('.todo-item:has-text("Monthly report")').last();
    await expect(nextTodo).toContainText('Feb 28');
  });

  test('should show recurrence preview', async ({ page }) => {
    await page.fill('input[placeholder*="Add a new todo"]', 'Test todo');
    await page.fill('input[type="datetime-local"]', '2026-02-10T10:00');
    await page.click('button:has-text("Show Advanced Options")');
    await page.selectOption('select[aria-label="Recurrence"]', 'weekly');

    // Verify preview shows next 5 occurrences
    await expect(page.locator('text=Next 5 occurrences:')).toBeVisible();
    await expect(page.locator('text=Feb 10')).toBeVisible();  // 1st
    await expect(page.locator('text=Feb 17')).toBeVisible();  // 2nd
    await expect(page.locator('text=Feb 24')).toBeVisible();  // 3rd
  });

  test('should allow removing recurrence pattern', async ({ page }) => {
    // Create recurring todo
    await page.fill('input[placeholder*="Add a new todo"]', 'Remove recurrence');
    await page.click('button:has-text("Show Advanced Options")');
    await page.selectOption('select[aria-label="Recurrence"]', 'daily');
    await page.click('button:has-text("Add")');

    // Edit and remove recurrence
    await page.click('button[aria-label="Edit todo"]');
    await page.selectOption('select[aria-label="Recurrence"]', 'none');
    await page.click('button:has-text("Save")');

    // Complete todo - should NOT create next instance
    await page.click('input[type="checkbox"]');
    await expect(page.locator('text=Next instance created')).not.toBeVisible();
  });
});
```

## Out of Scope

The following features are **NOT** included in this PRP:

- ❌ Custom recurrence intervals (e.g., every 3 days, every 2 weeks)
- ❌ Specific day-of-week recurring (e.g., every Monday and Wednesday)
- ❌ Recurrence end date (stop after N occurrences)
- ❌ Skip/postpone single instance of recurring todo
- ❌ Recurrence history/audit log
- ❌ Undo completion of recurring todo

## Success Metrics

### Performance Metrics
- [ ] Next instance creation completes in < 300ms
- [ ] Date calculations for 100+ occurrences in < 50ms

### User Experience Metrics
- [ ] 100% of next instances created successfully
- [ ] 0 incorrect date calculations reported
- [ ] Recurrence preview loads in < 100ms

### Code Quality Metrics
- [ ] Test coverage: 90%+ for recurrence logic
- [ ] All date calculations tested across timezone boundaries
- [ ] No hardcoded date arithmetic (use date-fns)

### Adoption Metrics
- [ ] 30%+ of todos use recurrence feature
- [ ] Most common pattern: weekly (expected ~50% of recurring todos)
- [ ] <1% of users report date calculation issues

---

**Last Updated:** February 5, 2026  
**Version:** 1.0  
**Dependencies:** PRP-01 (Todo CRUD), PRP-02 (Priority)  
**Dependents:** PRP-05 (Subtasks), PRP-06 (Tags), PRP-07 (Templates)
