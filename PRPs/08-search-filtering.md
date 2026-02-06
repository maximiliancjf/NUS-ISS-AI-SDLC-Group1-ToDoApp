# PRP-08: Search & Filtering

## Feature Overview

Implement comprehensive search and filtering capabilities enabling users to quickly find todos using real-time text search, advanced search across titles and tags, and multi-criteria filtering by priority, completion status, tags, and date ranges. Search operates client-side for instant responsiveness while maintaining compatibility with large todo lists.

## User Stories

### User Persona: Rachel - Busy Executive

**Story 1: Quick Text Search**
> As Rachel, I want to type a few keywords and instantly see matching todos so that I can quickly find specific tasks.

**Story 2: Search by Tag**
> As Rachel, I want to search todos that have a specific tag so that I can view all tasks in a category.

**Story 3: Filter Completed Todos**
> As Rachel, I want to toggle between showing/hiding completed todos so that I can focus on active tasks while still accessing my history.

**Story 4: Combined Filters**
> As Rachel, I want to apply multiple filters simultaneously (e.g., "high priority + incomplete + tag:Work") so that I can drill down to exactly what I need.

**Story 5: Clear All Filters**
> As Rachel, I want a single button to clear all active filters so that I can quickly return to viewing all my todos.

## User Flow

### Basic Text Search Flow
1. User types "meeting" in search input
2. Todo list filters in real-time (debounced 300ms)
3. Matching todos highlighted/shown:
   - Title contains "meeting" (case-insensitive)
   - Subtasks contain "meeting"
4. Search term highlighted in results
5. Count shown: "Showing 5 of 23 results"

### Advanced Search Flow
1. User clicks "Advanced Search" toggle
2. Additional search options appear:
   - Search in titles
   - Search in tags
   - Search in subtasks (optional)
3. User enters "project" and checks "tags"
4. Results show todos with tags containing "project"
5. Search mode indicator visible

### Multi-Filter Flow
1. User applies priority filter: "High"
2. User applies tag filter: "Work"
3. User toggles "Hide completed"
4. Todo list shows only incomplete, high-priority todos tagged "Work"
5. Active filters displayed as badges above list
6. "Clear all filters" button appears

### Clear Filters Flow
1. User has multiple active filters
2. User clicks "Clear all filters" button
3. All filters reset:
   - Search input cleared
   - Priority filter reset to "All"
   - Tag filter reset to "All"
   - Completion filter shows all todos
4. Full todo list displayed

## Technical Requirements

### Client-Side Implementation

**Key Decision:** Search and filtering implemented client-side for instant responsiveness. No additional API endpoints required beyond `GET /api/todos`.

```typescript
// Types for filter state
interface FilterState {
  searchText: string;
  searchMode: 'simple' | 'advanced';  // simple = title only, advanced = title + tags
  priority: Priority | null;
  tagId: number | null;
  completed: 'all' | 'incomplete' | 'complete';
  dateRange?: {
    start: string;
    end: string;
  };
}

interface SearchOptions {
  caseSensitive: boolean;
  exactMatch: boolean;
  searchInSubtasks: boolean;
}
```

### Search Logic

```typescript
// lib/search.ts
import { Todo, TodoWithSubtasks, Tag } from './db';

export function searchTodos(
  todos: TodoWithSubtasks[],
  filters: FilterState,
  options: SearchOptions = {
    caseSensitive: false,
    exactMatch: false,
    searchInSubtasks: true,
  }
): TodoWithSubtasks[] {
  let results = [...todos];

  // Apply search text filter
  if (filters.searchText) {
    const searchTerm = options.caseSensitive
      ? filters.searchText
      : filters.searchText.toLowerCase();

    results = results.filter(todo => {
      // Search in title
      const title = options.caseSensitive ? todo.title : todo.title.toLowerCase();
      const titleMatch = options.exactMatch
        ? title === searchTerm
        : title.includes(searchTerm);

      if (filters.searchMode === 'simple') {
        return titleMatch;
      }

      // Advanced search: include tags
      const tagMatch = todo.tags?.some(tag => {
        const tagName = options.caseSensitive ? tag.name : tag.name.toLowerCase();
        return options.exactMatch
          ? tagName === searchTerm
          : tagName.includes(searchTerm);
      });

      // Search in subtasks
      let subtaskMatch = false;
      if (options.searchInSubtasks && todo.subtasks) {
        subtaskMatch = todo.subtasks.some(subtask => {
          const subtaskTitle = options.caseSensitive
            ? subtask.title
            : subtask.title.toLowerCase();
          return options.exactMatch
            ? subtaskTitle === searchTerm
            : subtaskTitle.includes(searchTerm);
        });
      }

      return titleMatch || tagMatch || subtaskMatch;
    });
  }

  // Apply priority filter
  if (filters.priority) {
    results = results.filter(todo => todo.priority === filters.priority);
  }

  // Apply tag filter
  if (filters.tagId) {
    results = results.filter(todo =>
      todo.tags?.some(tag => tag.id === filters.tagId)
    );
  }

  // Apply completion filter
  if (filters.completed === 'incomplete') {
    results = results.filter(todo => !todo.completed);
  } else if (filters.completed === 'complete') {
    results = results.filter(todo => todo.completed);
  }

  // Apply date range filter
  if (filters.dateRange) {
    const start = new Date(filters.dateRange.start);
    const end = new Date(filters.dateRange.end);

    results = results.filter(todo => {
      const dueDate = new Date(todo.due_date);
      return dueDate >= start && dueDate <= end;
    });
  }

  return results;
}

/**
 * Highlight search term in text
 */
export function highlightSearchTerm(text: string, searchTerm: string): React.ReactNode {
  if (!searchTerm) return text;

  const parts = text.split(new RegExp(`(${searchTerm})`, 'gi'));
  return parts.map((part, index) =>
    part.toLowerCase() === searchTerm.toLowerCase() ? (
      <mark key={index} className="bg-yellow-200">{part}</mark>
    ) : (
      part
    )
  );
}
```

### Debounced Search Hook

```typescript
// lib/hooks/useDebounce.ts
import { useState, useEffect } from 'react';

export function useDebounce<T>(value: T, delay: number = 300): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}
```

## UI Components

### Search Bar Component

```typescript
'use client';

import { useState } from 'react';
import { useDebounce } from '@/lib/hooks/useDebounce';

interface SearchBarProps {
  onSearch: (term: string) => void;
  placeholder?: string;
}

export function SearchBar({ onSearch, placeholder = 'Search todos and subtasks...' }: SearchBarProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm, 300);

  useEffect(() => {
    onSearch(debouncedSearch);
  }, [debouncedSearch, onSearch]);

  return (
    <div className="relative">
      <input
        type="text"
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        placeholder={placeholder}
        className="w-full px-4 py-2 pl-10 border rounded-lg focus:ring-2 focus:ring-blue-500"
      />
      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">
        🔍
      </span>
      {searchTerm && (
        <button
          onClick={() => setSearchTerm('')}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
        >
          ✕
        </button>
      )}
    </div>
  );
}
```

### Advanced Filter Panel Component

```typescript
interface FilterPanelProps {
  filters: FilterState;
  onChange: (filters: Partial<FilterState>) => void;
  onClear: () => void;
}

export function FilterPanel({ filters, onChange, onClear }: FilterPanelProps) {
  const [tags, setTags] = useState<Tag[]>([]);

  useEffect(() => {
    fetchTags();
  }, []);

  async function fetchTags() {
    const res = await fetch('/api/tags');
    const data = await res.json();
    setTags(data.tags);
  }

  const hasActiveFilters =
    filters.searchText ||
    filters.priority ||
    filters.tagId ||
    filters.completed !== 'all' ||
    filters.dateRange;

  return (
    <div className="bg-gray-50 border rounded-lg p-4 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">Filters</h3>
        {hasActiveFilters && (
          <button
            onClick={onClear}
            className="text-sm text-blue-600 hover:underline"
          >
            Clear all
          </button>
        )}
      </div>

      {/* Priority Filter */}
      <div>
        <label className="block text-sm font-medium mb-2">Priority</label>
        <select
          value={filters.priority || 'all'}
          onChange={(e) =>
            onChange({ priority: e.target.value === 'all' ? null : e.target.value as Priority })
          }
          className="w-full px-3 py-2 border rounded-lg"
        >
          <option value="all">All Priorities</option>
          <option value="high">🔴 High</option>
          <option value="medium">🟡 Medium</option>
          <option value="low">🟢 Low</option>
        </select>
      </div>

      {/* Tag Filter */}
      <div>
        <label className="block text-sm font-medium mb-2">Tag</label>
        <select
          value={filters.tagId || 'all'}
          onChange={(e) =>
            onChange({ tagId: e.target.value === 'all' ? null : Number(e.target.value) })
          }
          className="w-full px-3 py-2 border rounded-lg"
        >
          <option value="all">All Tags</option>
          {tags.map(tag => (
            <option key={tag.id} value={tag.id}>{tag.name}</option>
          ))}
        </select>
      </div>

      {/* Completion Filter */}
      <div>
        <label className="block text-sm font-medium mb-2">Status</label>
        <select
          value={filters.completed}
          onChange={(e) => onChange({ completed: e.target.value as any })}
          className="w-full px-3 py-2 border rounded-lg"
        >
          <option value="all">All Todos</option>
          <option value="incomplete">Incomplete Only</option>
          <option value="complete">Completed Only</option>
        </select>
      </div>

      {/* Date Range Filter */}
      <div>
        <label className="block text-sm font-medium mb-2">Due Date Range</label>
        <div className="space-y-2">
          <input
            type="date"
            value={filters.dateRange?.start || ''}
            onChange={(e) =>
              onChange({
                dateRange: {
                  start: e.target.value,
                  end: filters.dateRange?.end || e.target.value,
                },
              })
            }
            className="w-full px-3 py-2 border rounded-lg"
          />
          <input
            type="date"
            value={filters.dateRange?.end || ''}
            onChange={(e) =>
              onChange({
                dateRange: {
                  start: filters.dateRange?.start || e.target.value,
                  end: e.target.value,
                },
              })
            }
            className="w-full px-3 py-2 border rounded-lg"
          />
        </div>
      </div>
    </div>
  );
}
```

### Main Page with Search & Filters

```typescript
'use client';

import { useState, useEffect, useMemo } from 'react';
import { TodoWithSubtasks, FilterState } from '@/lib/db';
import { searchTodos } from '@/lib/search';
import { SearchBar } from '@/components/SearchBar';
import { FilterPanel } from '@/components/FilterPanel';

export default function HomePage() {
  const [allTodos, setAllTodos] = useState<TodoWithSubtasks[]>([]);
  const [filters, setFilters] = useState<FilterState>({
    searchText: '',
    searchMode: 'simple',
    priority: null,
    tagId: null,
    completed: 'incomplete',  // Show incomplete by default
  });

  useEffect(() => {
    fetchTodos();
  }, []);

  async function fetchTodos() {
    const res = await fetch('/api/todos');
    const data = await res.json();
    setAllTodos(data.todos);
  }

  // Apply filters client-side
  const filteredTodos = useMemo(() => {
    return searchTodos(allTodos, filters);
  }, [allTodos, filters]);

  function updateFilters(updates: Partial<FilterState>) {
    setFilters(prev => ({ ...prev, ...updates }));
  }

  function clearFilters() {
    setFilters({
      searchText: '',
      searchMode: 'simple',
      priority: null,
      tagId: null,
      completed: 'all',
    });
  }

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold mb-6">Todo App</h1>

      {/* Search Bar */}
      <div className="mb-4">
        <SearchBar
          onSearch={(term) => updateFilters({ searchText: term })}
        />
      </div>

      {/* Advanced Options Toggle */}
      <button
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="mb-4 text-sm text-blue-600 hover:underline"
      >
        {showAdvanced ? '▼' : '▶'} Advanced Filters
      </button>

      {showAdvanced && (
        <div className="mb-6">
          <FilterPanel
            filters={filters}
            onChange={updateFilters}
            onClear={clearFilters}
          />
        </div>
      )}

      {/* Results Count */}
      <div className="mb-4 text-sm text-gray-600">
        Showing {filteredTodos.length} of {allTodos.length} todos
      </div>

      {/* Todo List */}
      <div className="space-y-2">
        {filteredTodos.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <p>No todos found matching your filters.</p>
            <button
              onClick={clearFilters}
              className="mt-4 text-blue-600 hover:underline"
            >
              Clear filters
            </button>
          </div>
        ) : (
          filteredTodos.map(todo => (
            <TodoItem key={todo.id} todo={todo} searchTerm={filters.searchText} />
          ))
        )}
      </div>
    </div>
  );
}
```

## Edge Cases

### 1. Empty Search Results
- **Problem:** User search returns 0 results
- **Solution:** Show helpful message with "Clear filters" button
- **Test:** Search for non-existent term, verify friendly message

### 2. Very Long Search Terms (100+ chars)
- **Problem:** Performance degrades with long search strings
- **Solution:** No hard limit, but unlikely to match, so performant by default
- **Test:** Search with 200-character string

### 3. Special Characters in Search
- **Problem:** User searches for "[Meeting]" with brackets
- **Solution:** Treat as literal string, not regex
- **Test:** Search with special regex chars: `.*+?[](){}|^$\`

### 4. Case Sensitivity Toggle
- **Problem:** User wants case-sensitive search
- **Solution:** Provide toggle in advanced options (optional enhancement)
- **Test:** Search "Work" vs "work" with case-sensitive enabled

### 5. Debounce Cancellation
- **Problem:** User types fast then clears input
- **Solution:** useDebounce hook properly cleanups timeouts
- **Test:** Type quickly, clear input, verify no lag

### 6. Filter State Persistence
- **Problem:** User refreshes page, loses filters
- **Solution:** Optional: Store in URL query params or localStorage
- **Test:** Apply filters, refresh, verify state (if implemented)

### 7. Large Todo Lists (1000+ items)
- **Problem:** Filtering 1000 todos might lag
- **Solution:** useMemo memoizes results, only recalculates on filter change
- **Test:** Benchmark with 1000 todos, verify <100ms filter time

### 8. Combining Incompatible Filters
- **Problem:** User filters for "completed + has reminder"
- **Solution:** Allow it (reminders can exist on completed todos)
- **Test:** Apply multiple filters, verify AND logic works

## Acceptance Criteria

### Basic Search
- [ ] Search input debounced (300ms delay)
- [ ] Search case-insensitive by default
- [ ] Search matches todo titles
- [ ] Results update in real-time (<100ms after debounce)
- [ ] Search term highlighted in results

### Advanced Search
- [ ] Search mode toggle (simple vs advanced)
- [ ] Advanced mode searches titles + tags + subtasks
- [ ] Clear search button visible when text entered
- [ ] Search works with partial matches

### Filtering
- [ ] Filter by priority (High/Medium/Low/All)
- [ ] Filter by tag
- [ ] Filter by completion status (All/Incomplete/Complete)
- [ ] Filter by date range
- [ ] Multiple filters apply simultaneously (AND logic)

### Filter UI
- [ ] Active filters displayed as badges
- [ ] "Clear all filters" button appears when filters active
- [ ] Results count shown (e.g., "Showing 5 of 23 todos")
- [ ] Empty state when no results match filters

### Performance
- [ ] Search executes in < 100ms for 500 todos
- [ ] No UI lag when typing in search
- [ ] useMemo prevents unnecessary recalculations
- [ ] Debounce reduces API calls (N/A for client-side search)

## Testing Requirements

### Unit Tests

**File:** `lib/search.test.ts`

```typescript
describe('searchTodos', () => {
  const mockTodos: TodoWithSubtasks[] = [
    {
      id: 1,
      title: 'Morning Meeting',
      priority: 'high',
      completed: 0,
      tags: [{ id: 1, name: 'Work', color: '#3B82F6' }],
      subtasks: [],
    },
    {
      id: 2,
      title: 'Grocery Shopping',
      priority: 'low',
      completed: 1,
      tags: [{ id: 2, name: 'Personal', color: '#EF4444' }],
      subtasks: [{ id: 1, title: 'Buy milk', position: 0, completed: 0 }],
    },
  ];

  test('filters by search text in title', () => {
    const results = searchTodos(mockTodos, {
      searchText: 'meeting',
      searchMode: 'simple',
      priority: null,
      tagId: null,
      completed: 'all',
    });

    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Morning Meeting');
  });

  test('filters by priority', () => {
    const results = searchTodos(mockTodos, {
      searchText: '',
      searchMode: 'simple',
      priority: 'high',
      tagId: null,
      completed: 'all',
    });

    expect(results).toHaveLength(1);
    expect(results[0].priority).toBe('high');
  });

  test('filters by tag', () => {
    const results = searchTodos(mockTodos, {
      searchText: '',
      searchMode: 'simple',
      priority: null,
      tagId: 1,  // Work tag
      completed: 'all',
    });

    expect(results).toHaveLength(1);
    expect(results[0].tags?.some(t => t.id === 1)).toBe(true);
  });

  test('filters by completion status', () => {
    const results = searchTodos(mockTodos, {
      searchText: '',
      searchMode: 'simple',
      priority: null,
      tagId: null,
      completed: 'complete',
    });

    expect(results).toHaveLength(1);
    expect(results[0].completed).toBe(1);
  });

  test('combines multiple filters (AND logic)', () => {
    const results = searchTodos(mockTodos, {
      searchText: 'meeting',
      searchMode: 'simple',
      priority: 'high',
      tagId: null,
      completed: 'incomplete',
    });

    expect(results).toHaveLength(1);
    expect(results[0].title).toBe('Morning Meeting');
  });

  test('searches in subtasks when enabled', () => {
    const results = searchTodos(
      mockTodos,
      {
        searchText: 'milk',
        searchMode: 'advanced',
        priority: null,
        tagId: null,
        completed: 'all',
      },
      { caseSensitive: false, exactMatch: false, searchInSubtasks: true }
    );

    expect(results).toHaveLength(1);
    expect(results[0].subtasks).toBeTruthy();
  });

  test('returns empty array when no matches', () => {
    const results = searchTodos(mockTodos, {
      searchText: 'nonexistent',
      searchMode: 'simple',
      priority: null,
      tagId: null,
      completed: 'all',
    });

    expect(results).toHaveLength(0);
  });
});
```

### E2E Tests (Playwright)

**File:** `tests/09-search-filtering.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

test.describe('Search & Filtering', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');

    // Setup: Create diverse todos
    await createTodo(page, 'Morning Meeting', 'high', ['Work']);
    await createTodo(page, 'Grocery Shopping', 'low', ['Personal']);
    await createTodo(page, 'Project Review', 'medium', ['Work']);
  });

  test('should filter todos by search text', async ({ page }) => {
    await page.fill('input[placeholder*="Search"]', 'meeting');

    // Wait for debounce
    await page.waitForTimeout(400);

    await expect(page.locator('text=Morning Meeting')).toBeVisible();
    await expect(page.locator('text=Grocery Shopping')).not.toBeVisible();
  });

  test('should highlight search term in results', async ({ page }) => {
    await page.fill('input[placeholder*="Search"]', 'meeting');
    await page.waitForTimeout(400);

    // Verify highlight
    const highlight = page.locator('mark:has-text("meeting")');
    await expect(highlight).toBeVisible();
  });

  test('should filter by priority', async ({ page }) => {
    await page.click('button:has-text("Advanced Filters")');
    await page.selectOption('select[aria-label="Priority filter"]', 'high');

    await expect(page.locator('text=Morning Meeting')).toBeVisible();
    await expect(page.locator('text=Grocery Shopping')).not.toBeVisible();
  });

  test('should filter by tag', async ({ page }) => {
    await page.click('button:has-text("Advanced Filters")');
    await page.selectOption('select[aria-label="Tag filter"]', 'Work');

    await expect(page.locator('text=Morning Meeting')).toBeVisible();
    await expect(page.locator('text=Project Review')).toBeVisible();
    await expect(page.locator('text=Grocery Shopping')).not.toBeVisible();
  });

  test('should show results count', async ({ page }) => {
    await page.fill('input[placeholder*="Search"]', 'meeting');
    await page.waitForTimeout(400);

    await expect(page.locator('text=Showing 1 of 3 todos')).toBeVisible();
  });

  test('should clear all filters', async ({ page }) => {
    // Apply multiple filters
    await page.fill('input[placeholder*="Search"]', 'meeting');
    await page.click('button:has-text("Advanced Filters")');
    await page.selectOption('select[aria-label="Priority filter"]', 'high');

    // Clear
    await page.click('button:has-text("Clear all")');

    // Verify all todos visible
    await expect(page.locator('.todo-item')).toHaveCount(3);
    await expect(page.locator('input[placeholder*="Search"]')).toHaveValue('');
  });

  test('should show empty state when no matches', async ({ page }) => {
    await page.fill('input[placeholder*="Search"]', 'nonexistent task');
    await page.waitForTimeout(400);

    await expect(page.locator('text=No todos found matching your filters')).toBeVisible();
    await expect(page.locator('button:has-text("Clear filters")')).toBeVisible();
  });

  test('should combine multiple filters', async ({ page }) => {
    await page.fill('input[placeholder*="Search"]', 'meeting');
    await page.click('button:has-text("Advanced Filters")');
    await page.selectOption('select[aria-label="Priority filter"]', 'high');
    await page.selectOption('select[aria-label="Tag filter"]', 'Work');

    await page.waitForTimeout(400);

    // Only Morning Meeting matches all criteria
    await expect(page.locator('.todo-item')).toHaveCount(1);
    await expect(page.locator('text=Morning Meeting')).toBeVisible();
  });
});

// Helper function
async function createTodo(page, title, priority, tags) {
  await page.fill('input[placeholder*="Add a new todo"]', title);
  await page.selectOption('select[name="priority"]', priority);
  // ... assign tags ...
  await page.click('button:has-text("Add")');
}
```

## Out of Scope

The following features are **NOT** included in this PRP:

- ❌ Saved search queries
- ❌ Search history
- ❌ Fuzzy matching (e.g., "meetting" → "meeting")
- ❌ Regular expression search
- ❌ Search operators (AND, OR, NOT)
- ❌ Server-side full-text search (Postgres FTS, Elasticsearch)

## Success Metrics

### Performance Metrics
- [ ] Search executes in < 100ms for 500 todos
- [ ] Debounce reduces unnecessary searches by 70%
- [ ] Filter updates complete in < 50ms

### User Experience Metrics
- [ ] Search used by 80%+ of active users
- [ ] Average search-to-result time: < 2 seconds
- [ ] 90%+ of searches return at least 1 result

### Code Quality Metrics
- [ ] Test coverage: 90%+ for search logic
- [ ] useMemo prevents unnecessary re-renders
- [ ] No memory leaks from debounce timers

### Adoption Metrics
- [ ] Most common search terms: "meeting", "work", "urgent"
- [ ] Filter combinations: priority + completion (70%)
- [ ] Clear filters button used frequently (indicates active filtering)

---

**Last Updated:** February 5, 2026  
**Version:** 1.0  
**Dependencies:** PRP-01 (Todo CRUD), PRP-02 (Priority), PRP-06 (Tags)  
**Dependents:** None (enhances existing UX)
