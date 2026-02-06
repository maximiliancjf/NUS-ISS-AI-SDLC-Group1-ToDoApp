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
    const { title, due_date, priority } = await request.json();

    if (!title || !due_date) {
      return NextResponse.json(
        { error: 'Title and due date are required' },
        { status: 400 }
      );
    }

    const user = getOrCreateUser();
    const todo = createTodo(user.id, title, due_date, priority || 'medium');
    
    return NextResponse.json(todo, { status: 201 });
  } catch (error) {
    console.error('Error creating todo:', error);
    return NextResponse.json({ error: 'Failed to create todo' }, { status: 500 });
  }
}
