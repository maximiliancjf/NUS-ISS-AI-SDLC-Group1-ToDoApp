import { NextResponse } from 'next/server';
import { getOrCreateUser, createTodo, createSubtask, createTag, addTagToTodo, getTagsByUserId } from '@/lib/db';

export async function POST(request: Request) {
  try {
    const importData = await request.json();
    const user = getOrCreateUser();

    // Validate import data
    if (!importData.todos || !Array.isArray(importData.todos)) {
      return NextResponse.json({ error: 'Invalid import data' }, { status: 400 });
    }

    const existingTags = getTagsByUserId(user.id);
    const tagMapping: { [key: number]: number } = {};
    const todoMapping: { [key: number]: number } = {};

    // Import tags first
    if (importData.tags && Array.isArray(importData.tags)) {
      for (const tag of importData.tags) {
        const existingTag = existingTags.find(t => t.name === tag.name);
        if (existingTag) {
          tagMapping[tag.id] = existingTag.id;
        } else {
          const newTag = createTag(user.id, tag.name, tag.color);
          tagMapping[tag.id] = newTag.id;
        }
      }
    }

    // Import todos
    for (const todo of importData.todos) {
      const newTodo = createTodo(
        user.id,
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
