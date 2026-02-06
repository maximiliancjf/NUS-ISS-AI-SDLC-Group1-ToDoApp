import { NextResponse } from 'next/server';
import { createSubtask, getTodoById } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const { todo_id, title } = await request.json();

    if (!todo_id || !title) {
      return NextResponse.json(
        { error: 'Todo ID and title are required' },
        { status: 400 }
      );
    }

    // Verify todo exists
    const todo = getTodoById(todo_id);
    if (!todo) {
      return NextResponse.json({ error: 'Todo not found' }, { status: 404 });
    }

    const subtask = createSubtask(todo_id, title);
    return NextResponse.json(subtask, { status: 201 });
  } catch (error) {
    console.error('Error creating subtask:', error);
    return NextResponse.json({ error: 'Failed to create subtask' }, { status: 500 });
  }
}
