import { NextResponse } from 'next/server';
import { getAllTodosWithTags, createTodo, getOrCreateUser } from '@/lib/db';

export async function GET() {
  try {
    const user = getOrCreateUser();
    const todos = getAllTodosWithTags(user.id);
    return NextResponse.json(todos);
  } catch (error) {
    console.error('Error fetching todos:', error);
    return NextResponse.json({ error: 'Failed to fetch todos' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { title, due_date, priority, recurrence_pattern, reminder_minutes } = await request.json();

    if (!title || !due_date) {
      return NextResponse.json(
        { error: 'Title and due date are required' },
        { status: 400 }
      );
    }

    const user = getOrCreateUser();
    const todo = createTodo(user.id, title, due_date, priority || 'medium');
    
    // Update recurrence pattern and reminder if provided
    const db = require('@/lib/db').default;
    if (recurrence_pattern || reminder_minutes !== undefined) {
      const updates: string[] = [];
      const values: any[] = [];
      
      if (recurrence_pattern) {
        updates.push('recurrence_pattern = ?');
        values.push(recurrence_pattern);
      }
      if (reminder_minutes !== undefined) {
        updates.push('reminder_minutes = ?');
        values.push(reminder_minutes);
      }
      
      values.push(todo.id);
      db.prepare(`UPDATE todos SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    }
    
    return NextResponse.json(todo, { status: 201 });
  } catch (error) {
    console.error('Error creating todo:', error);
    return NextResponse.json({ error: 'Failed to create todo' }, { status: 500 });
  }
}
