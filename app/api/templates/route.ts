import { NextRequest, NextResponse } from 'next/server';
import {
  createTemplate,
  getTemplatesByUserId,
  getTodoById,
  getSubtasksByTodoId,
  getTagsForTodo,
  Priority
} from '@/lib/db';

export async function GET(request: NextRequest) {
  try {
    const userId = 1; // Default user
    const templates = getTemplatesByUserId(userId);
    return NextResponse.json(templates);
  } catch (error) {
    console.error('Error fetching templates:', error);
    return NextResponse.json({ error: 'Failed to fetch templates' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, todoId } = body;

    if (!name || !todoId) {
      return NextResponse.json({ error: 'Name and todoId are required' }, { status: 400 });
    }

    const userId = 1; // Default user

    // Get the todo to use as template
    const todo = getTodoById(todoId);
    if (!todo) {
      return NextResponse.json({ error: 'Todo not found' }, { status: 404 });
    }

    // Get subtasks
    const subtasks = getSubtasksByTodoId(todoId);
    const subtasksJson = subtasks.length > 0
      ? JSON.stringify(subtasks.map(s => ({ title: s.title })))
      : null;

    // Get tags
    const tags = getTagsForTodo(todoId);
    const tagIdsJson = tags.length > 0
      ? JSON.stringify(tags.map(t => t.id))
      : null;

    // Calculate due date offset (days from now)
    let dueDateOffset = 0;
    if (todo.due_date) {
      const dueDate = new Date(todo.due_date);
      const now = new Date();
      dueDateOffset = Math.ceil((dueDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
    }

    const templateId = createTemplate(
      userId,
      name,
      null, // category
      dueDateOffset,
      todo.priority as Priority,
      subtasksJson,
      tagIdsJson
    );

    return NextResponse.json({ id: templateId, message: 'Template created successfully' });
  } catch (error) {
    console.error('Error creating template:', error);
    return NextResponse.json({ error: 'Failed to create template' }, { status: 500 });
  }
}
