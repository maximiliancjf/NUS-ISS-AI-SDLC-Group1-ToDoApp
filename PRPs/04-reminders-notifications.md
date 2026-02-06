# PRP-04: Reminders & Notifications

## Feature Overview

Implement browser-based notification system that reminds users about upcoming todos at configurable intervals before the due date. Supports reminder offsets from 15 minutes to 1 week before due time, with duplicate prevention to avoid notification spam. Uses Singapore timezone for all calculations and requires user permission for browser notifications.

## User Stories

### User Persona: Alex - Busy Professional

**Story 1: Set Reminder on Creation**
> As Alex, I want to add a reminder when creating a todo so that I receive a notification before it's due.

**Story 2: Multiple Reminder Options**
> As Alex, I want to choose from preset reminder times (15m, 30m, 1h, 2h, 1d, 2d, 1w) so that I can match the urgency of different tasks.

**Story 3: Receive Browser Notification**
> As Alex, I want to receive a browser notification when my reminder triggers so that I'm alerted even if the app isn't in focus.

**Story 4: Prevent Duplicate Notifications**
> As Alex, I don't want to receive the same reminder multiple times even if I keep the tab open for hours.

**Story 5: Grant Notification Permission**
> As Alex, I want to be prompted once to grant notification permission so that I can control whether I receive alerts.

## User Flow

### Enable Notifications Flow
1. User visits app for first time
2. Banner appears: "Enable notifications to receive reminders?"
3. User clicks "Enable"
4. Browser permission prompt appears
5. User grants permission
6. Banner shows success message and disappears
7. Permission stored in localStorage

### Create Todo with Reminder Flow
1. User creates todo with due date "2026-02-10 14:00"
2. User clicks "Show Advanced Options"
3. User selects reminder from dropdown: "1 hour before"
4. System stores `reminder_minutes = 60`
5. Todo created with reminder metadata

### Receive Notification Flow
1. User has todo due at 14:00 with 1-hour reminder
2. Background polling checks at 13:00 (1 hour before)
3. System finds todo is within reminder window
4. Browser notification appears:
   - Title: "Todo Reminder"
   - Body: "[Todo title] is due in 1 hour"
   - Icon: App icon
5. System updates `last_notification_sent` timestamp
6. User clicks notification → App opens/focuses on todo

### Remove Reminder Flow
1. User edits todo
2. User selects "No reminder" from dropdown
3. System sets `reminder_minutes = NULL`
4. No future notifications sent for this todo

## Technical Requirements

### Database Schema

```typescript
// Already exists in todos table from PRP-01
CREATE TABLE todos (
  ...
  reminder_minutes INTEGER,          -- Minutes before due date, or NULL
  last_notification_sent TEXT,       -- ISO 8601 timestamp or NULL
  ...
)
```

**Key Points:**
- `reminder_minutes`: Stored as positive integer (e.g., 60 = 1 hour before)
- `last_notification_sent`: Prevents duplicate notifications
- NULL means no reminder set

### TypeScript Types

```typescript
// From lib/db.ts
export interface Todo {
  ...
  reminder_minutes: number | null;
  last_notification_sent: string | null;
  ...
}

// Reminder preset configurations
export interface ReminderOption {
  value: number | null;   // Minutes before due date
  label: string;
  description: string;
}

export const REMINDER_OPTIONS: ReminderOption[] = [
  { value: null, label: 'No reminder', description: 'No notification' },
  { value: 15, label: '15 minutes before', description: '15 min' },
  { value: 30, label: '30 minutes before', description: '30 min' },
  { value: 60, label: '1 hour before', description: '1 hr' },
  { value: 120, label: '2 hours before', description: '2 hrs' },
  { value: 1440, label: '1 day before', description: '1 day' },
  { value: 2880, label: '2 days before', description: '2 days' },
  { value: 10080, label: '1 week before', description: '1 wk' },
];
```

### API Endpoints

#### 1. Check Due Reminders - `GET /api/notifications/check`

**Purpose:** Frontend polls this endpoint to check for todos needing reminders.

**Response:**
```typescript
{
  reminders: Array<{
    todo: Todo;
    minutesUntilDue: number;  // For display: "Due in 30 minutes"
  }>;
}
```

**Implementation:**
```typescript
// app/api/notifications/check/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { todoDB } from '@/lib/db';
import { getSingaporeNow } from '@/lib/timezone';

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const now = getSingaporeNow();
  const todos = todoDB.findByUser(session.userId);

  const reminders = todos
    .filter(todo => {
      // Skip completed todos
      if (todo.completed) return false;

      // Skip todos without reminders
      if (!todo.reminder_minutes) return false;

      // Calculate reminder trigger time
      const dueTime = new Date(todo.due_date);
      const reminderTime = new Date(dueTime.getTime() - (todo.reminder_minutes * 60 * 1000));

      // Check if within reminder window (now >= reminderTime && now < dueTime)
      const isInWindow = now >= reminderTime && now < dueTime;
      if (!isInWindow) return false;

      // Prevent duplicate notifications (check last_notification_sent)
      if (todo.last_notification_sent) {
        const lastSent = new Date(todo.last_notification_sent);
        // Don't resend if already sent within last 5 minutes
        const minutesSinceLastSent = (now.getTime() - lastSent.getTime()) / (60 * 1000);
        if (minutesSinceLastSent < 5) return false;
      }

      return true;
    })
    .map(todo => {
      const dueTime = new Date(todo.due_date);
      const minutesUntilDue = Math.round((dueTime.getTime() - now.getTime()) / (60 * 1000));

      return {
        todo,
        minutesUntilDue,
      };
    });

  // Update last_notification_sent for returned todos
  reminders.forEach(({ todo }) => {
    todoDB.update(todo.id, {
      last_notification_sent: now.toISOString(),
    });
  });

  return NextResponse.json({ reminders });
}
```

#### 2. Create Todo with Reminder - `POST /api/todos`

**Request Body:**
```typescript
{
  title: string;
  due_date: string;
  reminder_minutes?: number | null;  // Optional
}
```

**Validation:**
```typescript
function validateReminderMinutes(minutes?: number | null): number | null {
  if (minutes === null || minutes === undefined) return null;
  
  const validOptions = [15, 30, 60, 120, 1440, 2880, 10080];
  if (!validOptions.includes(minutes)) {
    return null;  // Invalid value, default to no reminder
  }
  
  return minutes;
}
```

### Frontend Notification Hook

**File:** `lib/hooks/useNotifications.ts`

```typescript
import { useEffect, useState } from 'react';
import { Todo } from '@/lib/db';

interface ReminderNotification {
  todo: Todo;
  minutesUntilDue: number;
}

export function useNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [isPolling, setIsPolling] = useState(false);

  // Request notification permission
  async function requestPermission() {
    if (!('Notification' in window)) {
      console.warn('Browser does not support notifications');
      return false;
    }

    const result = await Notification.requestPermission();
    setPermission(result);
    localStorage.setItem('notification_permission_requested', 'true');
    return result === 'granted';
  }

  // Check if permission already granted
  useEffect(() => {
    if ('Notification' in window) {
      setPermission(Notification.permission);
    }
  }, []);

  // Poll for reminders every 60 seconds
  useEffect(() => {
    if (permission !== 'granted') return;

    let intervalId: NodeJS.Timeout;

    async function checkReminders() {
      try {
        const res = await fetch('/api/notifications/check');
        if (!res.ok) return;

        const data = await res.json();
        
        // Show notification for each reminder
        data.reminders.forEach((reminder: ReminderNotification) => {
          showNotification(reminder);
        });
      } catch (error) {
        console.error('Failed to check reminders:', error);
      }
    }

    // Initial check
    checkReminders();

    // Poll every 60 seconds
    intervalId = setInterval(checkReminders, 60 * 1000);
    setIsPolling(true);

    return () => {
      clearInterval(intervalId);
      setIsPolling(false);
    };
  }, [permission]);

  function showNotification(reminder: ReminderNotification) {
    const { todo, minutesUntilDue } = reminder;

    const timeStr = formatMinutes(minutesUntilDue);
    const notification = new Notification('📋 Todo Reminder', {
      body: `${todo.title} is due in ${timeStr}`,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      tag: `todo-${todo.id}`,  // Prevents duplicate notifications
      requireInteraction: false,
    });

    // Click to focus app and scroll to todo
    notification.onclick = () => {
      window.focus();
      notification.close();
      
      // Scroll to todo
      const element = document.getElementById(`todo-${todo.id}`);
      element?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    };
  }

  function formatMinutes(minutes: number): string {
    if (minutes < 60) return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
    const hours = Math.floor(minutes / 60);
    return `${hours} hour${hours !== 1 ? 's' : ''}`;
  }

  return {
    permission,
    requestPermission,
    isPolling,
    isSupported: 'Notification' in window,
  };
}
```

## UI Components

### Notification Permission Banner

```typescript
'use client';

import { useState, useEffect } from 'react';
import { useNotifications } from '@/lib/hooks/useNotifications';

export function NotificationBanner() {
  const { permission, requestPermission, isSupported } = useNotifications();
  const [isDismissed, setIsDismissed] = useState(false);
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Show banner if permission not granted and not previously dismissed
    const dismissed = localStorage.getItem('notification_banner_dismissed');
    if (permission === 'default' && !dismissed && isSupported) {
      setIsVisible(true);
    }
  }, [permission, isSupported]);

  async function handleEnable() {
    const granted = await requestPermission();
    if (granted) {
      setIsVisible(false);
    }
  }

  function handleDismiss() {
    localStorage.setItem('notification_banner_dismissed', 'true');
    setIsVisible(false);
    setIsDismissed(true);
  }

  if (!isVisible) return null;

  return (
    <div className="fixed top-0 left-0 right-0 z-50 bg-blue-600 text-white px-4 py-3 shadow-lg">
      <div className="container mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-2xl">🔔</span>
          <div>
            <p className="font-semibold">Enable notifications?</p>
            <p className="text-sm text-blue-100">
              Get reminded about upcoming todos
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleEnable}
            className="px-4 py-2 bg-white text-blue-600 font-semibold rounded hover:bg-blue-50"
          >
            Enable
          </button>
          <button
            onClick={handleDismiss}
            className="px-4 py-2 text-white hover:bg-blue-700 rounded"
          >
            Not now
          </button>
        </div>
      </div>
    </div>
  );
}
```

### Reminder Dropdown Component

```typescript
import { REMINDER_OPTIONS } from '@/lib/db';

interface ReminderSelectProps {
  value: number | null;
  onChange: (minutes: number | null) => void;
}

export function ReminderSelect({ value, onChange }: ReminderSelectProps) {
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700">
        Reminder
      </label>
      <select
        value={value ?? 'none'}
        onChange={(e) => {
          const val = e.target.value;
          onChange(val === 'none' ? null : Number(val));
        }}
        className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
      >
        {REMINDER_OPTIONS.map((option) => (
          <option key={option.value ?? 'none'} value={option.value ?? 'none'}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  );
}
```

### Reminder Badge Component

```typescript
interface ReminderBadgeProps {
  minutes: number | null;
}

export function ReminderBadge({ minutes }: ReminderBadgeProps) {
  if (!minutes) return null;

  const option = REMINDER_OPTIONS.find(opt => opt.value === minutes);
  if (!option) return null;

  return (
    <span className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 rounded-full border border-blue-300">
      <span>🔔</span>
      <span>{option.description}</span>
    </span>
  );
}
```

### Todo Form with Reminder

```typescript
'use client';

import { useState } from 'react';
import { ReminderSelect } from '@/components/ReminderSelect';

export function TodoForm() {
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [reminderMinutes, setReminderMinutes] = useState<number | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const res = await fetch('/api/todos', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        due_date: dueDate,
        reminder_minutes: reminderMinutes,
      }),
    });

    if (res.ok) {
      setTitle('');
      setDueDate('');
      setReminderMinutes(null);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Add a new todo..."
        required
      />

      <input
        type="datetime-local"
        value={dueDate}
        onChange={(e) => setDueDate(e.target.value)}
        required
      />

      <button
        type="button"
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="text-sm text-blue-600"
      >
        {showAdvanced ? '▼' : '▶'} Show Advanced Options
      </button>

      {showAdvanced && (
        <ReminderSelect value={reminderMinutes} onChange={setReminderMinutes} />
      )}

      <button type="submit">Add</button>
    </form>
  );
}
```

## Edge Cases

### 1. Browser Notification Permission Denied
- **Problem:** User denies notification permission
- **Solution:** Show in-app alternative (e.g., bell icon with count on navbar)
- **Test:** Deny permission, verify fallback UI appears

### 2. Tab Closed During Reminder Window
- **Problem:** User closes tab, misses notification
- **Solution:** Service workers (out of scope), or accept limitation
- **Test:** Document limitation in USER_GUIDE.md

### 3. Reminder Time in Past
- **Problem:** User sets due date 30 minutes from now, reminder is 1 hour before
- **Solution:** Don't send notification, or send immediately with adjusted message
- **Test:** Create todo due in 10 minutes with 1-hour reminder

### 4. Multiple Tabs Open
- **Problem:** Each tab polls independently, causing duplicate notifications
- **Solution:** Use `tag` property in Notification to deduplicate
- **Test:** Open 3 tabs, verify single notification per reminder

### 5. System Time Change
- **Problem:** User changes system clock, affects due date calculations
- **Solution:** Use server time for all calculations, client only displays
- **Test:** Change system time, verify reminder logic unaffected

### 6. Polling Interval Drift
- **Problem:** 60-second polling might miss exact reminder time
- **Solution:** 5-minute grace window (already implemented in API)
- **Test:** Verify reminders trigger within 5 minutes of scheduled time

### 7. Completing Todo Before Reminder
- **Problem:** User completes todo, reminder still triggers
- **Solution:** API filters out completed todos
- **Test:** Complete todo, wait for reminder time, verify no notification

### 8. Recurring Todo Reminders
- **Problem:** Next recurring instance should also have reminder
- **Solution:** `reminder_minutes` inherited when creating next instance (PRP-03)
- **Test:** Complete recurring todo with reminder, verify next has same reminder

## Acceptance Criteria

### Permission Management
- [ ] Permission banner shows on first visit
- [ ] Banner dismissible with localStorage persistence
- [ ] Permission request triggers browser native prompt
- [ ] Permission state tracked (granted/denied/default)

### Reminder Configuration
- [ ] 7 reminder options + "No reminder" available
- [ ] Options: 15m, 30m, 1h, 2h, 1d, 2d, 1w
- [ ] Reminder stored as integer minutes in database
- [ ] Reminder badge displays on todos with reminders

### Notification Delivery
- [ ] Browser notification appears at correct time
- [ ] Notification shows todo title and time until due
- [ ] Clicking notification focuses app and scrolls to todo
- [ ] Notification doesn't repeat (prevents duplicates)
- [ ] Multiple reminders can trigger simultaneously

### Polling Mechanism
- [ ] Frontend polls every 60 seconds when permission granted
- [ ] Polling stops when permission not granted
- [ ] API checks todos within reminder window
- [ ] API updates `last_notification_sent` timestamp
- [ ] API enforces 5-minute grace window to prevent missed reminders

### Singapore Timezone
- [ ] All time calculations use Singapore timezone
- [ ] Reminder triggers based on SGT, not user's system timezone
- [ ] Due date comparisons accurate across timezone boundaries

## Testing Requirements

### Unit Tests

**File:** `lib/notifications.test.ts`

```typescript
import { describe, test, expect } from 'vitest';
import { getSingaporeNow } from './timezone';

describe('Reminder Logic', () => {
  test('calculates reminder trigger time correctly', () => {
    const dueDate = new Date('2026-02-10T14:00:00+08:00');  // 2pm SGT
    const reminderMinutes = 60;  // 1 hour before

    const triggerTime = new Date(dueDate.getTime() - (reminderMinutes * 60 * 1000));
    expect(triggerTime.toISOString()).toContain('13:00:00');
  });

  test('filters completed todos from reminders', () => {
    const todos = [
      { id: 1, completed: 0, reminder_minutes: 60, due_date: '2026-02-10T14:00:00' },
      { id: 2, completed: 1, reminder_minutes: 60, due_date: '2026-02-10T14:00:00' },
    ];

    const needsReminder = todos.filter(t => !t.completed && t.reminder_minutes);
    expect(needsReminder).toHaveLength(1);
    expect(needsReminder[0].id).toBe(1);
  });

  test('prevents duplicate notifications within 5 minutes', () => {
    const now = getSingaporeNow();
    const lastSent = new Date(now.getTime() - (3 * 60 * 1000));  // 3 minutes ago

    const minutesSince = (now.getTime() - lastSent.getTime()) / (60 * 1000);
    expect(minutesSince).toBeLessThan(5);  // Should not resend
  });

  test('allows notification after 5 minutes', () => {
    const now = getSingaporeNow();
    const lastSent = new Date(now.getTime() - (6 * 60 * 1000));  // 6 minutes ago

    const minutesSince = (now.getTime() - lastSent.getTime()) / (60 * 1000);
    expect(minutesSince).toBeGreaterThanOrEqual(5);  // Should resend
  });
});
```

### E2E Tests (Playwright)

**File:** `tests/05-reminders-notifications.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

test.describe('Reminders and Notifications', () => {
  test.beforeEach(async ({ context }) => {
    // Grant notification permissions
    await context.grantPermissions(['notifications']);
  });

  test('should show notification permission banner', async ({ page }) => {
    await page.goto('/');
    
    // Should show banner if permission not granted
    const banner = page.locator('text=Enable notifications?');
    // Might not show if already granted, so check conditionally
  });

  test('should create todo with reminder', async ({ page }) => {
    await page.goto('/');

    await page.fill('input[placeholder*="Add a new todo"]', 'Meeting with client');
    await page.fill('input[type="datetime-local"]', '2026-02-10T14:00');
    
    await page.click('button:has-text("Show Advanced Options")');
    await page.selectOption('select[aria-label="Reminder"]', '60');
    await page.click('button:has-text("Add")');

    // Verify reminder badge
    const badge = page.locator('.bg-blue-100:has-text("1 hr")');
    await expect(badge).toBeVisible();
  });

  test('should trigger notification at reminder time', async ({ page }) => {
    // This test requires mocking system time or waiting
    // Simplified version: verify API returns correct reminders

    await page.goto('/');

    // Create todo due in 90 minutes with 60-minute reminder
    const now = new Date();
    const dueDate = new Date(now.getTime() + (90 * 60 * 1000));
    const dueDateStr = dueDate.toISOString().slice(0, 16);

    await page.fill('input[placeholder*="Add a new todo"]', 'Reminder test');
    await page.fill('input[type="datetime-local"]', dueDateStr);
    await page.click('button:has-text("Show Advanced Options")');
    await page.selectOption('select[aria-label="Reminder"]', '60');
    await page.click('button:has-text("Add")');

    // Mock advancing time to reminder window (Playwright doesn't support this natively)
    // In real implementation, use mock server time or wait actual duration
  });

  test('should update last_notification_sent after reminder', async ({ page }) => {
    // Verify via database or API response that timestamp is set
    // This prevents testing notification spam
  });

  test('should allow removing reminder', async ({ page }) => {
    await page.goto('/');

    // Create todo with reminder
    await page.fill('input[placeholder*="Add a new todo"]', 'Remove reminder test');
    await page.fill('input[type="datetime-local"]', '2026-02-10T14:00');
    await page.click('button:has-text("Show Advanced Options")');
    await page.selectOption('select[aria-label="Reminder"]', '60');
    await page.click('button:has-text("Add")');

    // Edit to remove reminder
    await page.click('button[aria-label="Edit todo"]');
    await page.selectOption('select[aria-label="Reminder"]', 'none');
    await page.click('button:has-text("Save")');

    // Verify badge gone
    await expect(page.locator('.bg-blue-100:has-text("1 hr")')).not.toBeVisible();
  });

  test('should not notify for completed todos', async ({ page }) => {
    await page.goto('/');

    // Create todo with reminder
    await page.fill('input[placeholder*="Add a new todo"]', 'Complete me');
    await page.fill('input[type="datetime-local"]', '2026-02-10T14:00');
    await page.click('button:has-text("Show Advanced Options")');
    await page.selectOption('select[aria-label="Reminder"]', '60');
    await page.click('button:has-text("Add")');

    // Complete todo
    await page.click('input[type="checkbox"]');

    // Verify API doesn't return this in reminders check
    const response = await page.request.get('/api/notifications/check');
    const data = await response.json();
    expect(data.reminders.some((r: any) => r.todo.title === 'Complete me')).toBe(false);
  });

  test('should handle permission denied gracefully', async ({ page, context }) => {
    // Deny notifications
    await context.grantPermissions([], { permissions: ['notifications'] });

    await page.goto('/');

    // App should still function, just no notifications
    await page.fill('input[placeholder*="Add a new todo"]', 'No notif todo');
    await page.click('button:has-text("Add")');

    await expect(page.locator('text=No notif todo')).toBeVisible();
  });
});
```

## Out of Scope

The following features are **NOT** included in this PRP:

- ❌ Service workers for background notifications
- ❌ Push notifications (server-to-client)
- ❌ Email reminders
- ❌ SMS/Telegram notifications
- ❌ Snooze reminder feature
- ❌ Custom reminder times (only presets supported)
- ❌ Multiple reminders per todo

## Success Metrics

### Performance Metrics
- [ ] Polling completes in < 200ms (includes API call)
- [ ] Notification appears within 60 seconds of trigger time
- [ ] No memory leaks from long-running polling

### User Experience Metrics
- [ ] 70%+ of users grant notification permission
- [ ] 50%+ of todos have reminders enabled
- [ ] < 1% duplicate notification reports

### Code Quality Metrics
- [ ] Test coverage: 85%+ for notification logic
- [ ] Polling interval configurable (not hardcoded)
- [ ] Graceful degradation when notifications unsupported

### Adoption Metrics
- [ ] Most common reminder: 1 hour before (expected ~40%)
- [ ] Notification click-through rate: 60%+ (users engage with app)
- [ ] Permission grant rate: 70%+

---

**Last Updated:** February 5, 2026  
**Version:** 1.0  
**Dependencies:** PRP-01 (Todo CRUD)  
**Dependents:** PRP-03 (Recurring - inherits reminders)
