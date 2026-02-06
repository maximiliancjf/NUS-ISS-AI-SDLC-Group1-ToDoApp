import { NextRequest, NextResponse } from 'next/server';
import { getTodosNeedingReminders, updateLastNotificationSent } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const todos = getTodosNeedingReminders(session.userId);
    
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
