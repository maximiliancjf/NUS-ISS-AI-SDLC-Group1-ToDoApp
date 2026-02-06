import { NextResponse } from 'next/server';
import { getTodoById, updateTodo, deleteTodo, createTodo, getSubtasksByTodoId, createSubtask, getTagsForTodo, addTagToTodo, getOrCreateUser } from '@/lib/db';

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const updates = await request.json();
    
    const todo = getTodoById(parseInt(id));
    if (!todo) {
      return NextResponse.json({ error: 'Todo not found' }, { status: 404 });
    }

    // Handle recurring todo completion
    if (updates.completed === 1 && todo.recurrence_pattern && !todo.completed) {
      const user = getOrCreateUser();
      const dueDate = new Date(todo.due_date);
      let nextDueDate: Date;

      switch (todo.recurrence_pattern) {
        case 'daily':
          nextDueDate = new Date(dueDate.setDate(dueDate.getDate() + 1));
          break;
        case 'weekly':
          nextDueDate = new Date(dueDate.setDate(dueDate.getDate() + 7));
          break;
        case 'monthly':
          nextDueDate = new Date(dueDate.setMonth(dueDate.getMonth() + 1));
          break;
        case 'yearly':
          nextDueDate = new Date(dueDate.setFullYear(dueDate.getFullYear() + 1));
          break;
        default:
          nextDueDate = dueDate;
      }

      // Create next instance
      const newTodo = createTodo(user.id, todo.title, nextDueDate.toISOString(), todo.priority);
      
      // Copy recurrence pattern
      const db = require('@/lib/db').default;
      db.prepare('UPDATE todos SET recurrence_pattern = ? WHERE id = ?').run(todo.recurrence_pattern, newTodo.id);

      // Copy subtasks
      const subtasks = getSubtasksByTodoId(todo.id);
      for (const subtask of subtasks) {
        createSubtask(newTodo.id, subtask.title);
      }

      // Copy tags
      const tags = getTagsForTodo(todo.id);
      for (const tag of tags) {
        addTagToTodo(newTodo.id, tag.id);
      }
    }

    const updatedTodo = updateTodo(parseInt(id), updates);
    return NextResponse.json(updatedTodo);
  } catch (error) {
    console.error('Error updating todo:', error);
    return NextResponse.json({ error: 'Failed to update todo' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const success = deleteTodo(parseInt(id));
    
    if (!success) {
      return NextResponse.json({ error: 'Todo not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error deleting todo:', error);
    return NextResponse.json({ error: 'Failed to delete todo' }, { status: 500 });
  }
}
