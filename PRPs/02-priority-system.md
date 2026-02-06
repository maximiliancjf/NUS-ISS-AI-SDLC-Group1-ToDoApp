# PRP-02: Priority System

## Feature Overview

Implement a three-level priority system (High, Medium, Low) for todos with color-coded visual indicators, automatic sorting, and filtering capabilities. Priorities help users organize their task list by urgency and importance, ensuring critical items are immediately visible.

## User Stories

### User Persona: Sarah - Project Manager

**Story 1: Set Priority on Creation**
> As Sarah, I want to assign a priority level when creating a todo so that I can immediately categorize its urgency without additional steps.

**Story 2: Visual Priority Indicators**
> As Sarah, I want to see color-coded badges for priorities so that I can quickly scan my list and identify urgent tasks.

**Story 3: Priority-Based Sorting**
> As Sarah, I want high-priority todos to appear at the top of my list so that I focus on the most important tasks first.

**Story 4: Change Priority**
> As Sarah, I want to change a todo's priority when circumstances change so that my list reflects current priorities.

**Story 5: Filter by Priority**
> As Sarah, I want to filter todos by priority level so that I can focus exclusively on high-priority items during crunch time.

## User Flow

### Set Priority on Creation Flow
1. User enters todo title
2. User selects priority from dropdown (High/Medium/Low)
3. Dropdown defaults to "Medium" if not changed
4. Priority saved with todo in database
5. Todo appears in list with appropriate color badge

### Change Priority Flow
1. User clicks edit button on existing todo
2. Form loads with current priority pre-selected
3. User selects different priority from dropdown
4. User saves changes
5. UI updates priority badge color immediately
6. List re-sorts if sorting by priority is enabled

### Filter by Priority Flow
1. User clicks priority filter dropdown
2. User selects priority level or "All Priorities"
3. Todo list filters to show only matching todos
4. Filter state persists while navigating sections
5. Clear button resets filter to show all todos

## Technical Requirements

### Database Schema

```typescript
// Already exists in todos table from PRP-01
CREATE TABLE todos (
  ...
  priority TEXT NOT NULL DEFAULT 'medium',  -- 'high' | 'medium' | 'low'
  ...
)
```

**Important:** Priority column must have `NOT NULL` constraint and default value to ensure data integrity.

### TypeScript Types

```typescript
// From lib/db.ts
export type Priority = 'high' | 'medium' | 'low';

export interface Todo {
  ...
  priority: Priority;
  ...
}

// Priority metadata for UI rendering
export interface PriorityConfig {
  value: Priority;
  label: string;
  color: string;       // Tailwind class prefix (e.g., 'red', 'yellow', 'green')
  bgClass: string;     // Full Tailwind background class
  textClass: string;   // Full Tailwind text class
  borderClass: string; // Full Tailwind border class
  sortOrder: number;   // For sorting: high=0, medium=1, low=2
}

export const PRIORITY_CONFIGS: Record<Priority, PriorityConfig> = {
  high: {
    value: 'high',
    label: 'High',
    color: 'red',
    bgClass: 'bg-red-100',
    textClass: 'text-red-800',
    borderClass: 'border-red-300',
    sortOrder: 0,
  },
  medium: {
    value: 'medium',
    label: 'Medium',
    color: 'yellow',
    bgClass: 'bg-yellow-100',
    textClass: 'text-yellow-800',
    borderClass: 'border-yellow-300',
    sortOrder: 1,
  },
  low: {
    value: 'low',
    label: 'Low',
    color: 'green',
    bgClass: 'bg-green-100',
    textClass: 'text-green-800',
    borderClass: 'border-green-300',
    sortOrder: 2,
  },
};
```

### API Endpoints

#### 1. Create Todo with Priority - `POST /api/todos`

**Request Body:**
```typescript
{
  title: string;
  due_date: string;
  priority?: Priority;  // Defaults to 'medium' if not provided
}
```

**Validation:**
```typescript
function validatePriority(priority?: string): Priority {
  const valid: Priority[] = ['high', 'medium', 'low'];
  if (!priority || !valid.includes(priority as Priority)) {
    return 'medium';  // Default fallback
  }
  return priority as Priority;
}
```

#### 2. Update Todo Priority - `PUT /api/todos/[id]`

**Request Body:**
```typescript
{
  priority: Priority;  // One of 'high', 'medium', 'low'
}
```

**Response:**
```typescript
{
  todo: Todo;  // Updated todo with new priority
}
```

#### 3. Get Todos with Priority Filter - `GET /api/todos`

**Query Parameters:**
```typescript
{
  priority?: Priority;  // Optional filter
}
```

**Implementation:**
```typescript
// In app/api/todos/route.ts
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const priorityFilter = searchParams.get('priority') as Priority | null;

  let todos = todoDB.findByUser(session.userId);

  // Apply priority filter if provided
  if (priorityFilter && ['high', 'medium', 'low'].includes(priorityFilter)) {
    todos = todos.filter(t => t.priority === priorityFilter);
  }

  // Sort by priority (high → medium → low), then due date
  todos.sort((a, b) => {
    // First by completion status
    if (a.completed !== b.completed) {
      return a.completed - b.completed;
    }
    
    // Then by priority
    const priorityOrder = { high: 0, medium: 1, low: 2 };
    const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
    if (priorityDiff !== 0) return priorityDiff;
    
    // Finally by due date
    return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
  });

  return NextResponse.json({ todos });
}
```

### Database Layer Updates

```typescript
// In lib/db.ts
export const todoDB = {
  // ... existing methods

  /**
   * Sort todos by priority and due date
   */
  sortByPriorityAndDate(todos: Todo[]): Todo[] {
    const priorityOrder: Record<Priority, number> = {
      high: 0,
      medium: 1,
      low: 2,
    };

    return todos.sort((a, b) => {
      // Incomplete first
      if (a.completed !== b.completed) {
        return a.completed - b.completed;
      }

      // High priority first
      const priorityDiff = priorityOrder[a.priority] - priorityOrder[b.priority];
      if (priorityDiff !== 0) return priorityDiff;

      // Earlier due date first
      return new Date(a.due_date).getTime() - new Date(b.due_date).getTime();
    });
  },

  /**
   * Get todos filtered by priority
   */
  findByUserAndPriority(userId: number, priority: Priority): Todo[] {
    const stmt = db.prepare(`
      SELECT * FROM todos 
      WHERE user_id = ? AND priority = ?
      ORDER BY completed ASC, due_date ASC
    `);
    return stmt.all(userId, priority) as Todo[];
  },
};
```

## UI Components

### Priority Dropdown Component

```typescript
interface PrioritySelectProps {
  value: Priority;
  onChange: (priority: Priority) => void;
  className?: string;
}

export function PrioritySelect({ value, onChange, className = '' }: PrioritySelectProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as Priority)}
      className={`px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 ${className}`}
    >
      <option value="high">🔴 High Priority</option>
      <option value="medium">🟡 Medium Priority</option>
      <option value="low">🟢 Low Priority</option>
    </select>
  );
}
```

### Priority Badge Component

```typescript
import { PRIORITY_CONFIGS, Priority } from '@/lib/db';

interface PriorityBadgeProps {
  priority: Priority;
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
}

export function PriorityBadge({ 
  priority, 
  size = 'md', 
  showIcon = true 
}: PriorityBadgeProps) {
  const config = PRIORITY_CONFIGS[priority];
  
  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-3 py-1',
    lg: 'text-base px-4 py-2',
  };

  const icons = {
    high: '🔥',
    medium: '⚡',
    low: '✓',
  };

  return (
    <span
      className={`
        inline-flex items-center gap-1 
        font-semibold rounded-full border
        ${config.bgClass} 
        ${config.textClass} 
        ${config.borderClass}
        ${sizeClasses[size]}
      `}
    >
      {showIcon && <span>{icons[priority]}</span>}
      <span>{config.label}</span>
    </span>
  );
}
```

### Priority Filter Component

```typescript
interface PriorityFilterProps {
  selectedPriority: Priority | null;
  onFilterChange: (priority: Priority | null) => void;
}

export function PriorityFilter({ selectedPriority, onFilterChange }: PriorityFilterProps) {
  return (
    <div className="flex items-center gap-2">
      <label className="text-sm font-medium text-gray-700">Filter by Priority:</label>
      <select
        value={selectedPriority || 'all'}
        onChange={(e) => {
          const value = e.target.value;
          onFilterChange(value === 'all' ? null : value as Priority);
        }}
        className="px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
      >
        <option value="all">All Priorities</option>
        <option value="high">🔴 High</option>
        <option value="medium">🟡 Medium</option>
        <option value="low">🟢 Low</option>
      </select>
      
      {selectedPriority && (
        <button
          onClick={() => onFilterChange(null)}
          className="text-sm text-gray-500 hover:text-gray-700 underline"
        >
          Clear filter
        </button>
      )}
    </div>
  );
}
```

### Enhanced Todo List with Priority Sorting

```typescript
'use client';

import { useState, useEffect } from 'react';
import { Todo, Priority } from '@/lib/db';
import { PriorityBadge } from '@/components/PriorityBadge';
import { PriorityFilter } from '@/components/PriorityFilter';

export default function HomePage() {
  const [todos, setTodos] = useState<Todo[]>([]);
  const [priorityFilter, setPriorityFilter] = useState<Priority | null>(null);

  async function fetchTodos() {
    const params = new URLSearchParams();
    if (priorityFilter) {
      params.append('priority', priorityFilter);
    }

    const res = await fetch(`/api/todos?${params}`);
    const data = await res.json();
    setTodos(data.todos);
  }

  useEffect(() => {
    fetchTodos();
  }, [priorityFilter]);

  return (
    <div className="container mx-auto p-4">
      {/* Priority Filter */}
      <div className="mb-6">
        <PriorityFilter
          selectedPriority={priorityFilter}
          onFilterChange={setPriorityFilter}
        />
      </div>

      {/* Todo List */}
      <div className="space-y-2">
        {todos.map((todo) => (
          <div key={todo.id} className="flex items-center gap-4 p-4 border rounded-lg">
            <input
              type="checkbox"
              checked={!!todo.completed}
              onChange={() => handleToggleComplete(todo)}
            />
            <div className="flex-1">
              <h3 className={todo.completed ? 'line-through text-gray-500' : ''}>
                {todo.title}
              </h3>
            </div>
            <PriorityBadge priority={todo.priority} />
          </div>
        ))}
      </div>
    </div>
  );
}
```

## Edge Cases

### 1. Invalid Priority Value
- **Problem:** API receives priority = 'urgent' (not valid)
- **Solution:** Validation function returns default 'medium', log warning
- **Test:** Send invalid priority via API

### 2. Null/Undefined Priority
- **Problem:** Legacy data or database corruption results in null priority
- **Solution:** Database has NOT NULL constraint with DEFAULT 'medium'
- **Test:** Query database with null priority, verify default applied

### 3. Priority Change During Edit
- **Problem:** User opens edit form, another user changes priority
- **Solution:** Last write wins, show toast "Priority was updated by another user"
- **Test:** Simulate concurrent priority changes

### 4. Filter Persistence
- **Problem:** User filters by high priority, navigates away, returns
- **Solution:** Store filter in URL query params or localStorage
- **Test:** Apply filter, refresh page, verify filter persists

### 5. Sorting Stability
- **Problem:** Multiple todos have same priority and due date
- **Solution:** Secondary sort by creation timestamp (stable sort)
- **Test:** Create 5 todos with identical priority/date, verify consistent order

### 6. Case Sensitivity
- **Problem:** Database stores 'High' but code expects 'high'
- **Solution:** Enforce lowercase in database, convert on input
- **Test:** Send 'High' via API, verify stored as 'high'

### 7. Migration from No Priority System
- **Problem:** Existing todos have no priority field
- **Solution:** Migration script sets all existing todos to 'medium'
- **Test:** Run migration on database with null priorities

## Acceptance Criteria

### Priority Selection
- [ ] Default priority is 'medium' for new todos
- [ ] Dropdown shows all three priority levels with visual indicators
- [ ] Selected priority persists after page reload
- [ ] Priority badge appears immediately after creation

### Visual Indicators
- [ ] High priority shows red badge (bg-red-100, text-red-800)
- [ ] Medium priority shows yellow badge (bg-yellow-100, text-yellow-800)
- [ ] Low priority shows green badge (bg-green-100, text-green-800)
- [ ] Badges are readable with sufficient contrast (WCAG AA)
- [ ] Icons (emoji or SVG) enhance visual distinction

### Sorting Behavior
- [ ] Incomplete todos appear before completed
- [ ] High priority todos appear before medium
- [ ] Medium priority todos appear before low
- [ ] Within same priority, earlier due date appears first
- [ ] Sort order updates immediately when priority changes

### Priority Filtering
- [ ] Filter dropdown shows "All Priorities" + 3 priority options
- [ ] Selecting filter updates list in <100ms
- [ ] Filtered state shows count of visible todos
- [ ] "Clear filter" button restores all todos
- [ ] Filter works with other filters (tags, search)

### Priority Updates
- [ ] User can change priority via edit form
- [ ] Priority change updates badge color immediately
- [ ] List re-sorts after priority change
- [ ] API validates priority values
- [ ] Invalid priorities default to 'medium'

## Testing Requirements

### Unit Tests

**File:** `lib/db.test.ts`

```typescript
describe('Priority System', () => {
  describe('validatePriority', () => {
    test('accepts valid priorities', () => {
      expect(validatePriority('high')).toBe('high');
      expect(validatePriority('medium')).toBe('medium');
      expect(validatePriority('low')).toBe('low');
    });

    test('defaults invalid priorities to medium', () => {
      expect(validatePriority('urgent')).toBe('medium');
      expect(validatePriority(null)).toBe('medium');
      expect(validatePriority(undefined)).toBe('medium');
    });
  });

  describe('todoDB.sortByPriorityAndDate', () => {
    test('sorts by completion status first', () => {
      const todos = [
        { id: 1, priority: 'low', completed: 0, due_date: '2026-02-10' },
        { id: 2, priority: 'high', completed: 1, due_date: '2026-02-09' },
      ];
      
      const sorted = todoDB.sortByPriorityAndDate(todos);
      expect(sorted[0].id).toBe(1);  // Incomplete first
    });

    test('sorts incomplete todos by priority', () => {
      const todos = [
        { id: 1, priority: 'low', completed: 0, due_date: '2026-02-10' },
        { id: 2, priority: 'high', completed: 0, due_date: '2026-02-10' },
        { id: 3, priority: 'medium', completed: 0, due_date: '2026-02-10' },
      ];
      
      const sorted = todoDB.sortByPriorityAndDate(todos);
      expect(sorted.map(t => t.priority)).toEqual(['high', 'medium', 'low']);
    });

    test('sorts same priority by due date', () => {
      const todos = [
        { id: 1, priority: 'high', completed: 0, due_date: '2026-02-15' },
        { id: 2, priority: 'high', completed: 0, due_date: '2026-02-10' },
      ];
      
      const sorted = todoDB.sortByPriorityAndDate(todos);
      expect(sorted[0].id).toBe(2);  // Earlier date first
    });
  });

  describe('todoDB.findByUserAndPriority', () => {
    test('returns only todos with specified priority', () => {
      todoDB.create({ user_id: 1, title: 'High', priority: 'high', due_date: '2026-02-10' });
      todoDB.create({ user_id: 1, title: 'Low', priority: 'low', due_date: '2026-02-10' });
      
      const highTodos = todoDB.findByUserAndPriority(1, 'high');
      expect(highTodos.every(t => t.priority === 'high')).toBe(true);
    });
  });
});
```

### E2E Tests (Playwright)

**File:** `tests/03-priority-system.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

test.describe('Priority System', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should create todo with default medium priority', async ({ page }) => {
    await page.fill('input[placeholder*="Add a new todo"]', 'Default priority');
    await page.click('button:has-text("Add")');

    // Verify medium priority badge
    const badge = page.locator('.bg-yellow-100:has-text("Medium")');
    await expect(badge).toBeVisible();
  });

  test('should create todo with high priority', async ({ page }) => {
    await page.fill('input[placeholder*="Add a new todo"]', 'Urgent task');
    await page.selectOption('select[name="priority"]', 'high');
    await page.click('button:has-text("Add")');

    // Verify high priority badge (red)
    const badge = page.locator('.bg-red-100:has-text("High")');
    await expect(badge).toBeVisible();
  });

  test('should sort todos by priority', async ({ page }) => {
    // Create todos with different priorities
    const todos = [
      { title: 'Low task', priority: 'low' },
      { title: 'High task', priority: 'high' },
      { title: 'Medium task', priority: 'medium' },
    ];

    for (const todo of todos) {
      await page.fill('input[placeholder*="Add a new todo"]', todo.title);
      await page.selectOption('select[name="priority"]', todo.priority);
      await page.click('button:has-text("Add")');
    }

    // Verify sort order: high → medium → low
    const todoElements = page.locator('.todo-item');
    await expect(todoElements.nth(0)).toContainText('High task');
    await expect(todoElements.nth(1)).toContainText('Medium task');
    await expect(todoElements.nth(2)).toContainText('Low task');
  });

  test('should filter todos by priority', async ({ page }) => {
    // Create todos with different priorities
    await page.fill('input[placeholder*="Add a new todo"]', 'High priority task');
    await page.selectOption('select[name="priority"]', 'high');
    await page.click('button:has-text("Add")');

    await page.fill('input[placeholder*="Add a new todo"]', 'Low priority task');
    await page.selectOption('select[name="priority"]', 'low');
    await page.click('button:has-text("Add")');

    // Filter by high priority
    await page.selectOption('select[aria-label="Priority filter"]', 'high');

    // Verify only high priority todo is visible
    await expect(page.locator('text=High priority task')).toBeVisible();
    await expect(page.locator('text=Low priority task')).not.toBeVisible();
  });

  test('should change todo priority', async ({ page }) => {
    // Create a todo
    await page.fill('input[placeholder*="Add a new todo"]', 'Changeable task');
    await page.click('button:has-text("Add")');

    // Click edit button
    await page.click('button[aria-label="Edit todo"]');

    // Change priority
    await page.selectOption('select[name="priority"]', 'high');
    await page.click('button:has-text("Save")');

    // Verify badge color changed to red
    const badge = page.locator('.bg-red-100:has-text("High")');
    await expect(badge).toBeVisible();
  });

  test('should clear priority filter', async ({ page }) => {
    // Create mixed priority todos
    await page.fill('input[placeholder*="Add a new todo"]', 'Task 1');
    await page.selectOption('select[name="priority"]', 'high');
    await page.click('button:has-text("Add")');

    await page.fill('input[placeholder*="Add a new todo"]', 'Task 2');
    await page.selectOption('select[name="priority"]', 'low');
    await page.click('button:has-text("Add")');

    // Apply filter
    await page.selectOption('select[aria-label="Priority filter"]', 'high');
    await expect(page.locator('.todo-item')).toHaveCount(1);

    // Clear filter
    await page.click('button:has-text("Clear filter")');
    await expect(page.locator('.todo-item')).toHaveCount(2);
  });

  test('should maintain priority color contrast for accessibility', async ({ page }) => {
    await page.fill('input[placeholder*="Add a new todo"]', 'Accessible task');
    await page.selectOption('select[name="priority"]', 'high');
    await page.click('button:has-text("Add")');

    // Check contrast ratio (requires axe accessibility testing)
    const badge = page.locator('.bg-red-100');
    const bgColor = await badge.evaluate(el => 
      window.getComputedStyle(el).backgroundColor
    );
    const textColor = await badge.evaluate(el => 
      window.getComputedStyle(el).color
    );

    // Verify colors are set (actual contrast calculation would need additional library)
    expect(bgColor).toBeTruthy();
    expect(textColor).toBeTruthy();
  });
});
```

### Integration Tests

**File:** `tests/api/priority-api.test.ts`

```typescript
import { describe, test, expect } from 'vitest';

describe('Priority API Integration', () => {
  test('POST /api/todos validates priority', async () => {
    const res = await fetch('/api/todos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: 'Test',
        due_date: '2026-02-10T10:00:00',
        priority: 'invalid',
      }),
    });

    const data = await res.json();
    // Should default to medium
    expect(data.todo.priority).toBe('medium');
  });

  test('GET /api/todos filters by priority', async () => {
    // Create mixed priority todos
    await createTodo({ title: 'High', priority: 'high' });
    await createTodo({ title: 'Low', priority: 'low' });

    const res = await fetch('/api/todos?priority=high');
    const data = await res.json();

    expect(data.todos.every(t => t.priority === 'high')).toBe(true);
  });

  test('PUT /api/todos/[id] updates priority', async () => {
    const todo = await createTodo({ title: 'Test', priority: 'low' });

    const res = await fetch(`/api/todos/${todo.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ priority: 'high' }),
    });

    const data = await res.json();
    expect(data.todo.priority).toBe('high');
  });
});
```

## Out of Scope

The following features are **NOT** included in this PRP:

- ❌ Custom priority levels (only 3 levels supported)
- ❌ Priority-based notifications (e.g., email for high priority)
- ❌ Dynamic priority calculation based on due date proximity
- ❌ Priority history tracking
- ❌ Bulk priority updates
- ❌ Priority templates

## Success Metrics

### Performance Metrics
- [ ] Priority filtering completes in < 50ms
- [ ] Sorting 1000+ todos by priority in < 100ms
- [ ] Badge rendering does not impact list scroll performance

### User Experience Metrics
- [ ] Users can identify priority at a glance (color + label)
- [ ] 100% of todos have valid priority value
- [ ] Priority changes reflect immediately in UI
- [ ] Filter state persists across sessions

### Code Quality Metrics
- [ ] Test coverage: 90%+ for priority logic
- [ ] No hardcoded color values (use Tailwind classes)
- [ ] Type safety: No `any` types for priority
- [ ] Accessibility: WCAG AA contrast for all priority badges

### Adoption Metrics
- [ ] 80%+ of todos have non-default priority (indicates usage)
- [ ] Priority filter used by 60%+ of active users
- [ ] <5% of API calls contain invalid priority values

---

**Last Updated:** February 5, 2026  
**Version:** 1.0  
**Dependencies:** PRP-01 (Todo CRUD)  
**Dependents:** PRP-03 (Recurring), PRP-07 (Templates), PRP-08 (Filtering)
