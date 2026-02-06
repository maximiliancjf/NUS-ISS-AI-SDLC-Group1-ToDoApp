import { NextResponse } from 'next/server';
import { createTodo, createSubtask, createTag, addTagToTodo, getTagsByUserId } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const importData = await request.json();

    // Validate import data
    if (!importData.todos || !Array.isArray(importData.todos)) {
      return NextResponse.json({ error: 'Invalid import data' }, { status: 400 });
    }

    const existingTags = getTagsByUserId(session.userId);
    const tagMapping: { [key: number]: number } = {};
    const todoMapping: { [key: number]: number } = {};

    // Import tags first
    if (importData.tags && Array.isArray(importData.tags)) {
      for (const tag of importData.tags) {
        const existingTag = existingTags.find(t => t.name === tag.name);
        if (existingTag) {
          tagMapping[tag.id] = existingTag.id;
        } else {
          const newTag = createTag(session.userId, tag.name, tag.color);
          tagMapping[tag.id] = newTag.id;
        }
      }
    }

    // Import todos
    for (const todo of importData.todos) {
      const newTodo = createTodo(
        session.userId,
        todo.title,
        todo.due_date,
        todo.priority || 'medium'
      );
      todoMapping[todo.id] = newTodo.id;

      // Import subtasks
      if (todo.subtasks && Array.isArray(todo.subtasks)) {
        for (const subtask of todo.subtasks) {
          createSubtask(newTodo.id, subtask.title);
        }
      }

      // Import tags
      if (todo.tags && Array.isArray(todo.tags)) {
        for (const tag of todo.tags) {
          const newTagId = tagMapping[tag.id];
          if (newTagId) {
            addTagToTodo(newTodo.id, newTagId);
          }
        }
      }
    }

    return NextResponse.json({
      success: true,
      imported: {
        todos: importData.todos.length,
        tags: Object.keys(tagMapping).length,
      },
    });
  } catch (error) {
    console.error('Error importing data:', error);
    return NextResponse.json({ error: 'Failed to import data' }, { status: 500 });
  }
}
