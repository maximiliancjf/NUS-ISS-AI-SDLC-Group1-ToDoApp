import { NextRequest, NextResponse } from 'next/server';
import { getTodosNeedingReminders, updateLastNotificationSent } from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const userId = 1; // Default user
    const todos = getTodosNeedingReminders(userId);
    
    const now = new Date();
    const todosToNotify = todos.filter(todo => {
      const dueDate = new Date(todo.due_date);
      const reminderTime = new Date(dueDate.getTime() - (todo.reminder_minutes! * 60 * 1000));
      return now >= reminderTime && now < dueDate;
    });

    // Mark as notified
    for (const todo of todosToNotify) {
      updateLastNotificationSent(todo.id);
    }

    return NextResponse.json(todosToNotify);
  } catch (error) {
    console.error('Error fetching reminders:', error);
    return NextResponse.json({ error: 'Failed to fetch reminders' }, { status: 500 });
  }
}
