# PRP-10: Calendar View

## Feature Overview

Implement an interactive monthly calendar view displaying todos by their due dates, integrated with Singapore public holidays. Users can visualize their workload distribution across days, navigate between months, and click dates to see detailed todo lists. The calendar respects Singapore timezone for all date calculations and displays holidays with special styling.

## User Stories

### User Persona: Sarah - Project Manager

**Story 1: Visual Workload Overview**
> As Sarah, I want to see my todos laid out on a monthly calendar so that I can visualize my workload distribution and identify busy days.

**Story 2: Plan Around Holidays**
> As Sarah, I want Singapore public holidays highlighted on the calendar so that I can plan my tasks around days off.

**Story 3: Click Date to View Todos**
> As Sarah, I want to click on a calendar date to see all todos due that day so that I can quickly review what's scheduled.

**Story 4: Navigate Between Months**
> As Sarah, I want to navigate to previous/next months so that I can plan ahead or review past todos.

**Story 5: Identify Overloaded Days**
> As Sarah, I want to see a visual indicator (e.g., color intensity) of how many todos are due each day so that I can identify overloaded dates at a glance.

## User Flow

### Initial Calendar Load
1. User clicks "Calendar" tab/link in navigation
2. App loads current month (February 2026) in Singapore timezone
3. Calendar displays:
   - 7-column grid (Sun-Sat)
   - Grey cells for previous/next month days
   - Today highlighted with blue border
   - Each date shows count of todos due (e.g., "3 todos")
   - Public holidays shown with special background (e.g., pink)
4. Calendar header shows "February 2026" with prev/next arrows

### View Todos for Specific Date
1. User clicks on "Feb 15, 2026" (has 3 todos)
2. Modal/sidebar opens showing:
   - "Todos due on February 15, 2026"
   - List of 3 todos with details
   - Ability to complete/edit todos inline
3. User closes modal, returns to calendar view

### Navigate to Next Month
1. User clicks ">" arrow in calendar header
2. Calendar updates to March 2026
3. Holidays for March loaded (if any)
4. URL updates to `/calendar?month=2026-03`

### Holiday Display
1. Calendar renders February 2026
2. February 20 is "Chinese New Year" (public holiday)
3. Date cell shows:
   - Pink background
   - "Chinese New Year" label below date number
   - Any todos due that day still visible
4. User can still click date to view/manage todos

### Visual Density Indication
1. Feb 10 has 1 todo → Light gray background
2. Feb 15 has 5 todos → Darker gray background (heat map style)
3. Feb 20 has 0 todos → White background
4. User quickly identifies Feb 15 as busy day

## Technical Requirements

### Database Schema

**No new tables needed.** Reuse existing todos table and add holidays table:

```sql
-- Already exists from holiday seeding script
CREATE TABLE IF NOT EXISTS holidays (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,  -- YYYY-MM-DD format
  name TEXT NOT NULL,
  year INTEGER NOT NULL
);
```

### API Endpoints

**Endpoint 1: Get Calendar Data**
```typescript
// app/api/calendar/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { db } from '@/lib/db';
import { format, startOfMonth, endOfMonth } from 'date-fns-tz';
import { getSingaporeNow } from '@/lib/timezone';

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const monthParam = searchParams.get('month'); // Format: 2026-02

  // Default to current month if not specified
  const targetDate = monthParam
    ? new Date(`${monthParam}-01T00:00:00Z`)
    : getSingaporeNow();

  const monthStart = format(startOfMonth(targetDate), 'yyyy-MM-dd', { timeZone: 'Asia/Singapore' });
  const monthEnd = format(endOfMonth(targetDate), 'yyyy-MM-dd', { timeZone: 'Asia/Singapore' });

  try {
    // Get todos for this month
    const todos = db.prepare(`
      SELECT id, title, due_date, priority, completed
      FROM todos
      WHERE user_id = ?
        AND due_date >= ?
        AND due_date <= ?
      ORDER BY due_date
    `).all(session.userId, monthStart, monthEnd);

    // Get holidays for this month
    const year = new Date(targetDate).getFullYear();
    const holidays = db.prepare(`
      SELECT date, name
      FROM holidays
      WHERE year = ?
    `).all(year);

    // Group todos by date
    const todosByDate: Record<string, any[]> = {};
    todos.forEach((todo: any) => {
      const dateKey = todo.due_date.split('T')[0]; // Extract YYYY-MM-DD
      if (!todosByDate[dateKey]) {
        todosByDate[dateKey] = [];
      }
      todosByDate[dateKey].push(todo);
    });

    return NextResponse.json({
      month: format(targetDate, 'yyyy-MM', { timeZone: 'Asia/Singapore' }),
      todosByDate,
      holidays: holidays.map((h: any) => ({
        date: h.date,
        name: h.name,
      })),
    });
  } catch (error) {
    console.error('Calendar fetch error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch calendar data' },
      { status: 500 }
    );
  }
}
```

### Calendar Utilities

```typescript
// lib/calendar.ts
import { startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, format, isSameMonth } from 'date-fns-tz';

export interface CalendarDay {
  date: Date;
  dateString: string;  // YYYY-MM-DD
  isCurrentMonth: boolean;
  isToday: boolean;
  isHoliday: boolean;
  holidayName?: string;
  todoCount: number;
  todos: any[];
}

/**
 * Generate calendar grid for a given month
 */
export function generateCalendarDays(
  year: number,
  month: number,  // 1-12
  todosByDate: Record<string, any[]>,
  holidays: { date: string; name: string }[]
): CalendarDay[] {
  const targetDate = new Date(year, month - 1, 1);
  const monthStart = startOfMonth(targetDate);
  const monthEnd = endOfMonth(targetDate);
  
  // Get full week range (includes prev/next month days)
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 0 }); // Sunday
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 0 });

  const allDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });
  
  const today = format(new Date(), 'yyyy-MM-dd', { timeZone: 'Asia/Singapore' });
  const holidayMap = new Map(holidays.map(h => [h.date, h.name]));

  return allDays.map(date => {
    const dateString = format(date, 'yyyy-MM-dd', { timeZone: 'Asia/Singapore' });
    const todos = todosByDate[dateString] || [];

    return {
      date,
      dateString,
      isCurrentMonth: isSameMonth(date, targetDate),
      isToday: dateString === today,
      isHoliday: holidayMap.has(dateString),
      holidayName: holidayMap.get(dateString),
      todoCount: todos.length,
      todos,
    };
  });
}

/**
 * Get intensity class for todo count (heat map styling)
 */
export function getTodoIntensityClass(count: number): string {
  if (count === 0) return '';
  if (count === 1) return 'bg-gray-100';
  if (count <= 3) return 'bg-blue-100';
  if (count <= 5) return 'bg-blue-200';
  return 'bg-blue-300';
}
```

## UI Components

### Calendar View Page

```typescript
'use client';

import { useState, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { generateCalendarDays, CalendarDay, getTodoIntensityClass } from '@/lib/calendar';
import { format } from 'date-fns-tz';
import { getSingaporeNow } from '@/lib/timezone';

export default function CalendarPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const monthParam = searchParams.get('month'); // e.g., "2026-02"

  const [currentMonth, setCurrentMonth] = useState(() => {
    if (monthParam) {
      const [year, month] = monthParam.split('-').map(Number);
      return new Date(year, month - 1, 1);
    }
    return getSingaporeNow();
  });

  const [calendarDays, setCalendarDays] = useState<CalendarDay[]>([]);
  const [selectedDate, setSelectedDate] = useState<CalendarDay | null>(null);

  useEffect(() => {
    fetchCalendarData();
  }, [currentMonth]);

  async function fetchCalendarData() {
    const monthStr = format(currentMonth, 'yyyy-MM', { timeZone: 'Asia/Singapore' });
    const res = await fetch(`/api/calendar?month=${monthStr}`);
    const data = await res.json();

    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth() + 1;

    const days = generateCalendarDays(year, month, data.todosByDate, data.holidays);
    setCalendarDays(days);
  }

  function navigateMonth(direction: 'prev' | 'next') {
    const newMonth = new Date(currentMonth);
    newMonth.setMonth(newMonth.getMonth() + (direction === 'next' ? 1 : -1));
    setCurrentMonth(newMonth);

    // Update URL
    const monthStr = format(newMonth, 'yyyy-MM', { timeZone: 'Asia/Singapore' });
    router.push(`/calendar?month=${monthStr}`);
  }

  function handleDateClick(day: CalendarDay) {
    if (day.todoCount > 0 || day.isCurrentMonth) {
      setSelectedDate(day);
    }
  }

  return (
    <div className="container mx-auto p-4">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Calendar</h1>
        <div className="flex items-center gap-4">
          <button
            onClick={() => navigateMonth('prev')}
            className="px-3 py-1 border rounded hover:bg-gray-100"
          >
            ← Prev
          </button>
          <span className="text-xl font-semibold">
            {format(currentMonth, 'MMMM yyyy', { timeZone: 'Asia/Singapore' })}
          </span>
          <button
            onClick={() => navigateMonth('next')}
            className="px-3 py-1 border rounded hover:bg-gray-100"
          >
            Next →
          </button>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="grid grid-cols-7 gap-2">
        {/* Day Headers */}
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
          <div key={day} className="text-center font-semibold p-2 border-b">
            {day}
          </div>
        ))}

        {/* Calendar Days */}
        {calendarDays.map(day => (
          <CalendarDayCell
            key={day.dateString}
            day={day}
            onClick={() => handleDateClick(day)}
          />
        ))}
      </div>

      {/* Legend */}
      <div className="mt-6 flex gap-4 text-sm text-gray-600">
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 border-2 border-blue-500"></div>
          <span>Today</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-pink-100"></div>
          <span>Public Holiday</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-4 h-4 bg-blue-200"></div>
          <span>High Activity</span>
        </div>
      </div>

      {/* Date Detail Modal */}
      {selectedDate && (
        <DateDetailModal
          day={selectedDate}
          onClose={() => setSelectedDate(null)}
        />
      )}
    </div>
  );
}
```

### Calendar Day Cell Component

```typescript
interface CalendarDayCellProps {
  day: CalendarDay;
  onClick: () => void;
}

function CalendarDayCell({ day, onClick }: CalendarDayCellProps) {
  const intensityClass = getTodoIntensityClass(day.todoCount);
  const holidayClass = day.isHoliday ? 'bg-pink-100' : '';
  const todayClass = day.isToday ? 'border-2 border-blue-500' : 'border';
  const inactiveClass = !day.isCurrentMonth ? 'opacity-40' : '';

  return (
    <div
      onClick={onClick}
      className={`
        p-2 min-h-[100px] cursor-pointer hover:shadow-lg transition-shadow
        ${todayClass} ${intensityClass} ${holidayClass} ${inactiveClass} rounded-lg
      `}
    >
      {/* Date Number */}
      <div className="font-semibold text-lg mb-1">
        {format(day.date, 'd', { timeZone: 'Asia/Singapore' })}
      </div>

      {/* Holiday Name */}
      {day.isHoliday && (
        <div className="text-xs text-pink-700 font-semibold mb-2">
          🎉 {day.holidayName}
        </div>
      )}

      {/* Todo Count */}
      {day.todoCount > 0 && (
        <div className="text-sm text-gray-700">
          {day.todoCount} todo{day.todoCount > 1 ? 's' : ''}
        </div>
      )}

      {/* Todo Previews (first 2) */}
      {day.todos.slice(0, 2).map(todo => (
        <div key={todo.id} className="text-xs text-gray-600 truncate">
          • {todo.title}
        </div>
      ))}

      {/* More indicator */}
      {day.todoCount > 2 && (
        <div className="text-xs text-blue-600 mt-1">
          +{day.todoCount - 2} more
        </div>
      )}
    </div>
  );
}
```

### Date Detail Modal Component

```typescript
interface DateDetailModalProps {
  day: CalendarDay;
  onClose: () => void;
}

function DateDetailModal({ day, onClose }: DateDetailModalProps) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[80vh] overflow-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold">
              {format(day.date, 'EEEE, MMMM d, yyyy', { timeZone: 'Asia/Singapore' })}
            </h2>
            {day.isHoliday && (
              <p className="text-pink-600 font-semibold">🎉 {day.holidayName}</p>
            )}
          </div>
          <button
            onClick={onClose}
            className="text-2xl text-gray-400 hover:text-gray-600"
          >
            ✕
          </button>
        </div>

        {/* Todo List */}
        {day.todoCount === 0 ? (
          <p className="text-gray-500 text-center py-8">
            No todos due on this date.
          </p>
        ) : (
          <div className="space-y-2">
            {day.todos.map(todo => (
              <TodoItem key={todo.id} todo={todo} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
```

### Todo Item Component (simplified for modal)

```typescript
function TodoItem({ todo }: { todo: any }) {
  const [completed, setCompleted] = useState(todo.completed === 1);

  async function handleToggle() {
    await fetch(`/api/todos/${todo.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ completed: !completed }),
    });
    setCompleted(!completed);
  }

  return (
    <div className="flex items-center gap-3 p-3 border rounded-lg hover:bg-gray-50">
      <input
        type="checkbox"
        checked={completed}
        onChange={handleToggle}
        className="w-5 h-5"
      />
      <div className="flex-1">
        <div className={completed ? 'line-through text-gray-400' : ''}>
          {todo.title}
        </div>
        <div className="text-sm text-gray-500">
          Priority: {todo.priority}
        </div>
      </div>
    </div>
  );
}
```

## Edge Cases

### 1. No Todos in Current Month
- **Problem:** User views February 2026, has 0 todos that month
- **Solution:** Show empty calendar grid with message: "No todos due this month"
- **Test:** Navigate to future month with no todos

### 2. Date on Multiple Timezones (SGT vs UTC)
- **Problem:** Todo due "2026-02-15T23:00:00Z" displays wrong date
- **Solution:** All date formatting uses `timeZone: 'Asia/Singapore'` parameter
- **Test:** Create todo at 11 PM UTC (7 AM next day SGT), verify calendar placement

### 3. Month with 5-6 Week Rows
- **Problem:** Some months require 6 rows (e.g., May 2026 starts on Friday)
- **Solution:** Calendar grid dynamically adjusts using `eachDayOfInterval`
- **Test:** Navigate to May 2026, verify all days visible

### 4. Holiday on Same Day as Multiple Todos
- **Problem:** Feb 20 is Chinese New Year + has 5 todos due
- **Solution:** Show both holiday label and todo count, holiday background with todo intensity overlay
- **Test:** Create todos on known holiday date, verify both visible

### 5. Clicking Previous/Next Month Days
- **Problem:** User clicks Feb 1's cell which is part of January
- **Solution:** Clicking inactive month days navigates to that month
- **Test:** Click Jan 31 in Feb calendar, verify navigates to January

### 6. Very Long Todo Titles in Calendar Cell
- **Problem:** "Prepare comprehensive Q1 financial report..." overflows cell
- **Solution:** CSS `truncate` class with ellipsis, full title in detail modal
- **Test:** Create todo with 100-character title, verify cell displays cleanly

### 7. Loading Calendar for Far Future (2050)
- **Problem:** No holidays seeded for year 2050
- **Solution:** Calendar displays normally but without holidays (no error)
- **Test:** Navigate to 2050, verify calendar works without holiday data

### 8. Recurring Todos Creating Multiple Instances in Month
- **Problem:** Daily recurring todo creates 28+ instances in February
- **Solution:** Each instance shown separately in calendar (expected behavior)
- **Test:** Create daily recurring todo, verify all instances visible in calendar

## Acceptance Criteria

### Calendar Display
- [ ] Calendar shows 7-column grid (Sun-Sat)
- [ ] Current month displayed by default
- [ ] Today highlighted with blue border
- [ ] Previous/next month days shown in gray (inactive)
- [ ] All dates use Singapore timezone

### Holidays
- [ ] Singapore public holidays highlighted (pink background)
- [ ] Holiday names displayed below date number
- [ ] Holidays loaded from `holidays` table
- [ ] Holidays don't interfere with todo display

### Todo Visualization
- [ ] Todo count shown on each date
- [ ] First 2 todos previewed in cell
- [ ] "+X more" indicator when >2 todos
- [ ] Heat map coloring based on todo count

### Navigation
- [ ] Prev/Next month arrows functional
- [ ] URL updates with `?month=YYYY-MM` parameter
- [ ] Calendar refreshes when month changes
- [ ] Direct URL navigation works (e.g., `/calendar?month=2026-12`)

### Date Detail Modal
- [ ] Clicking date opens modal
- [ ] Modal shows full date string
- [ ] All todos for that date listed
- [ ] Todos can be completed inline
- [ ] Close button functional

### Performance
- [ ] Calendar loads in < 500ms (typical month)
- [ ] Month navigation feels instant
- [ ] No layout shift during load

## Testing Requirements

### Unit Tests

**File:** `lib/calendar.test.ts`

```typescript
import { generateCalendarDays } from './calendar';

describe('generateCalendarDays', () => {
  test('generates 35 or 42 days for a month', () => {
    const days = generateCalendarDays(2026, 2, {}, []);
    
    // February 2026 requires 35 or 42 days (5-6 weeks)
    expect([35, 42]).toContain(days.length);
  });

  test('marks today correctly', () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth() + 1;

    const days = generateCalendarDays(year, month, {}, []);
    
    const todayDays = days.filter(d => d.isToday);
    expect(todayDays).toHaveLength(1);
  });

  test('includes previous and next month days', () => {
    const days = generateCalendarDays(2026, 2, {}, []);
    
    const currentMonthDays = days.filter(d => d.isCurrentMonth);
    const otherMonthDays = days.filter(d => !d.isCurrentMonth);

    expect(currentMonthDays.length).toBe(28); // Feb 2026 has 28 days
    expect(otherMonthDays.length).toBeGreaterThan(0);
  });

  test('attaches todos to correct dates', () => {
    const todosByDate = {
      '2026-02-15': [{ id: 1, title: 'Test Todo' }],
    };

    const days = generateCalendarDays(2026, 2, todosByDate, []);
    
    const feb15 = days.find(d => d.dateString === '2026-02-15');
    expect(feb15).toBeDefined();
    expect(feb15!.todoCount).toBe(1);
    expect(feb15!.todos[0].title).toBe('Test Todo');
  });

  test('marks holidays correctly', () => {
    const holidays = [
      { date: '2026-02-20', name: 'Chinese New Year' },
    ];

    const days = generateCalendarDays(2026, 2, {}, holidays);
    
    const feb20 = days.find(d => d.dateString === '2026-02-20');
    expect(feb20!.isHoliday).toBe(true);
    expect(feb20!.holidayName).toBe('Chinese New Year');
  });
});
```

### E2E Tests (Playwright)

**File:** `tests/11-calendar-view.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

test.describe('Calendar View', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/calendar');
  });

  test('should display current month calendar', async ({ page }) => {
    // Verify header shows current month/year
    const header = page.locator('h1:has-text("Calendar")');
    await expect(header).toBeVisible();

    // Verify 7-column grid
    const dayHeaders = page.locator('text=Sun, text=Mon, text=Tue, text=Wed, text=Thu, text=Fri, text=Sat');
    await expect(dayHeaders.first()).toBeVisible();

    // Verify at least 28 day cells (minimum for any month)
    const dayCells = page.locator('[class*="calendar-day"]');
    await expect(dayCells.count()).resolves.toBeGreaterThanOrEqual(28);
  });

  test('should navigate to next month', async ({ page }) => {
    // Get current month
    const currentMonth = await page.locator('[class*="month-header"]').textContent();

    // Click next arrow
    await page.click('button:has-text("Next")');

    // Verify month changed
    const newMonth = await page.locator('[class*="month-header"]').textContent();
    expect(newMonth).not.toBe(currentMonth);
  });

  test('should navigate to previous month', async ({ page }) => {
    const currentMonth = await page.locator('[class*="month-header"]').textContent();

    await page.click('button:has-text("Prev")');

    const newMonth = await page.locator('[class*="month-header"]').textContent();
    expect(newMonth).not.toBe(currentMonth);
  });

  test('should display todos on calendar dates', async ({ page }) => {
    // Setup: Create todo with due date
    await createTodoWithDueDate(page, 'Calendar Test Todo', '2026-02-15');

    // Navigate to February 2026
    await page.goto('/calendar?month=2026-02');

    // Verify todo appears on Feb 15
    const feb15Cell = page.locator('[data-date="2026-02-15"]');
    await expect(feb15Cell).toContainText('1 todo');
    await expect(feb15Cell).toContainText('Calendar Test Todo');
  });

  test('should open date detail modal on click', async ({ page }) => {
    // Setup
    await createTodoWithDueDate(page, 'Modal Test', '2026-02-15');
    await page.goto('/calendar?month=2026-02');

    // Click date
    await page.click('[data-date="2026-02-15"]');

    // Verify modal opens
    await expect(page.locator('text=Friday, February 15, 2026')).toBeVisible();
    await expect(page.locator('text=Modal Test')).toBeVisible();
  });

  test('should display Singapore public holidays', async ({ page }) => {
    // Navigate to month with known holiday (e.g., February for CNY)
    await page.goto('/calendar?month=2026-02');

    // Verify holiday displayed (assuming CNY is seeded)
    const holidayCell = page.locator('[data-date*="2026-02"]:has-text("Chinese New Year")');
    await expect(holidayCell).toBeVisible();
  });

  test('should apply heat map styling based on todo count', async ({ page }) => {
    // Setup: Create multiple todos on same date
    await createTodoWithDueDate(page, 'Todo 1', '2026-02-15');
    await createTodoWithDueDate(page, 'Todo 2', '2026-02-15');
    await createTodoWithDueDate(page, 'Todo 3', '2026-02-15');
    await createTodoWithDueDate(page, 'Todo 4', '2026-02-15');
    await createTodoWithDueDate(page, 'Todo 5', '2026-02-15');

    await page.goto('/calendar?month=2026-02');

    // Verify heat map styling (high intensity for 5 todos)
    const feb15Cell = page.locator('[data-date="2026-02-15"]');
    await expect(feb15Cell).toHaveClass(/bg-blue-300/);  // Highest intensity
  });
});

// Helper
async function createTodoWithDueDate(page, title, dueDate) {
  await page.goto('/');
  await page.fill('input[placeholder*="Add a new todo"]', title);
  await page.fill('input[type="date"]', dueDate);
  await page.click('button:has-text("Add")');
}
```

## Out of Scope

The following features are **NOT** included in this PRP:

- ❌ Week view or day view
- ❌ Drag-and-drop to reschedule todos
- ❌ Multi-day events or date ranges
- ❌ Calendar sync with Google Calendar/Outlook
- ❌ Event creation directly from calendar (must use main page)
- ❌ Recurring event visualization (e.g., striped pattern)
- ❌ Timezone selector (always Singapore)

## Success Metrics

### Usage Metrics
- [ ] 40%+ of active users visit calendar view monthly
- [ ] Average session duration in calendar: 2+ minutes
- [ ] Date detail modal opened on 60%+ of calendar visits

### Visual Metrics
- [ ] Users identify busy days within 3 seconds (heat map effective)
- [ ] Holiday awareness: 80%+ of users notice holiday indicators
- [ ] No reports of date misalignment issues

### Performance Metrics
- [ ] Calendar loads in < 500ms (typical month)
- [ ] Month navigation completes in < 300ms
- [ ] No layout shift during load

### User Satisfaction
- [ ] 85%+ of users find calendar "helpful" or "very helpful"
- [ ] Calendar views correlate with better task planning (measured by on-time completion)

---

**Last Updated:** February 5, 2026  
**Version:** 1.0  
**Dependencies:** PRP-01 (Todo CRUD), PRP-02 (Priority), Holiday seeding script  
**Dependents:** None (visualization feature)
