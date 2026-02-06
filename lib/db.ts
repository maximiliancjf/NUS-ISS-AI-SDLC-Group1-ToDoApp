import Database from 'better-sqlite3';
import path from 'path';

const db = new Database(path.join(process.cwd(), 'todos.db'));

// Enable foreign keys
db.pragma('foreign_keys = ON');

// Initialize database schema
export function initializeDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS todos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      due_date TEXT NOT NULL,
      priority TEXT NOT NULL DEFAULT 'medium',
      completed INTEGER DEFAULT 0,
      completed_at TEXT,
      recurrence_pattern TEXT,
      reminder_minutes INTEGER,
      last_notification_sent TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS subtasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      todo_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      completed INTEGER DEFAULT 0,
      position INTEGER NOT NULL,
      FOREIGN KEY (todo_id) REFERENCES todos(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      color TEXT NOT NULL,
      UNIQUE(user_id, name),
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS todo_tags (
      todo_id INTEGER NOT NULL,
      tag_id INTEGER NOT NULL,
      PRIMARY KEY (todo_id, tag_id),
      FOREIGN KEY (todo_id) REFERENCES todos(id) ON DELETE CASCADE,
      FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      category TEXT,
      due_date_offset INTEGER DEFAULT 0,
      priority TEXT NOT NULL DEFAULT 'medium',
      subtasks_json TEXT,
      tag_ids_json TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS authenticators (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      credential_id TEXT UNIQUE NOT NULL,
      credential_public_key BLOB NOT NULL,
      counter INTEGER NOT NULL DEFAULT 0,
      transports TEXT,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_authenticators_user_id ON authenticators(user_id);
    CREATE INDEX IF NOT EXISTS idx_authenticators_credential_id ON authenticators(credential_id);
  `);
}

// Initialize on import
initializeDatabase();

// Types
export type Priority = 'high' | 'medium' | 'low';
export type RecurrencePattern = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface Todo {
  id: number;
  user_id: number;
  title: string;
  due_date: string;
  priority: Priority;
  completed: number;
  completed_at: string | null;
  recurrence_pattern: RecurrencePattern | null;
  reminder_minutes: number | null;
  last_notification_sent: string | null;
  created_at: string;
}

export interface Subtask {
  id: number;
  todo_id: number;
  title: string;
  completed: number;
  position: number;
}

export interface Tag {
  id: number;
  user_id: number;
  name: string;
  color: string;
}

export interface Template {
  id: number;
  user_id: number;
  name: string;
  category: string | null;
  due_date_offset: number;
  priority: Priority;
  subtasks_json: string | null;
  tag_ids_json: string | null;
  created_at: string;
}

// CRUD Operations for Todos
export function createTodo(
  userId: number,
  title: string,
  dueDate: string,
  priority: Priority = 'medium'
): Todo {
  const stmt = db.prepare(`
    INSERT INTO todos (user_id, title, due_date, priority)
    VALUES (?, ?, ?, ?)
  `);
  const result = stmt.run(userId, title, dueDate, priority);
  return getTodoById(result.lastInsertRowid as number)!;
}

export function getTodoById(id: number): Todo | undefined {
  const stmt = db.prepare('SELECT * FROM todos WHERE id = ?');
  return stmt.get(id) as Todo | undefined;
}

export function getTodosByUserId(userId: number): Todo[] {
  const stmt = db.prepare(`
    SELECT * FROM todos 
    WHERE user_id = ? 
    ORDER BY completed ASC, due_date ASC
  `);
  return stmt.all(userId) as Todo[];
}

export function updateTodo(
  id: number,
  updates: Partial<Pick<Todo, 'title' | 'due_date' | 'priority' | 'completed'>>
): Todo | undefined {
  const fields: string[] = [];
  const values: any[] = [];

  if (updates.title !== undefined) {
    fields.push('title = ?');
    values.push(updates.title);
  }
  if (updates.due_date !== undefined) {
    fields.push('due_date = ?');
    values.push(updates.due_date);
  }
  if (updates.priority !== undefined) {
    fields.push('priority = ?');
    values.push(updates.priority);
  }
  if (updates.completed !== undefined) {
    fields.push('completed = ?');
    values.push(updates.completed);
    if (updates.completed === 1) {
      fields.push('completed_at = ?');
      values.push(new Date().toISOString());
    } else {
      fields.push('completed_at = NULL');
    }
  }

  if (fields.length === 0) return getTodoById(id);

  values.push(id);
  const stmt = db.prepare(`
    UPDATE todos 
    SET ${fields.join(', ')}
    WHERE id = ?
  `);
  stmt.run(...values);
  return getTodoById(id);
}

export function deleteTodo(id: number): boolean {
  const stmt = db.prepare('DELETE FROM todos WHERE id = ?');
  const result = stmt.run(id);
  return result.changes > 0;
}

export function getTodosNeedingReminders(userId: number): Todo[] {
  const stmt = db.prepare(`
    SELECT * FROM todos 
    WHERE user_id = ? 
      AND completed = 0 
      AND reminder_minutes IS NOT NULL
      AND (
        last_notification_sent IS NULL 
        OR datetime(last_notification_sent) < datetime('now', '-1 hour')
      )
    ORDER BY due_date ASC
  `);
  return stmt.all(userId) as Todo[];
}

export function updateLastNotificationSent(id: number): void {
  const stmt = db.prepare(`
    UPDATE todos 
    SET last_notification_sent = datetime('now')
    WHERE id = ?
  `);
  stmt.run(id);
}

// Subtask Operations
export function createSubtask(todoId: number, title: string): Subtask {
  // Get max position for this todo
  const maxPosStmt = db.prepare('SELECT MAX(position) as maxPos FROM subtasks WHERE todo_id = ?');
  const result = maxPosStmt.get(todoId) as { maxPos: number | null };
  const position = (result.maxPos ?? -1) + 1;

  const stmt = db.prepare(`
    INSERT INTO subtasks (todo_id, title, position)
    VALUES (?, ?, ?)
  `);
  const insertResult = stmt.run(todoId, title, position);
  return getSubtaskById(insertResult.lastInsertRowid as number)!;
}

export function getSubtaskById(id: number): Subtask | undefined {
  const stmt = db.prepare('SELECT * FROM subtasks WHERE id = ?');
  return stmt.get(id) as Subtask | undefined;
}

export function getSubtasksByTodoId(todoId: number): Subtask[] {
  const stmt = db.prepare('SELECT * FROM subtasks WHERE todo_id = ? ORDER BY position ASC');
  return stmt.all(todoId) as Subtask[];
}

export function updateSubtask(
  id: number,
  updates: Partial<Pick<Subtask, 'title' | 'completed' | 'position'>>
): Subtask | undefined {
  const fields: string[] = [];
  const values: any[] = [];

  if (updates.title !== undefined) {
    fields.push('title = ?');
    values.push(updates.title);
  }
  if (updates.completed !== undefined) {
    fields.push('completed = ?');
    values.push(updates.completed);
  }
  if (updates.position !== undefined) {
    fields.push('position = ?');
    values.push(updates.position);
  }

  if (fields.length === 0) return getSubtaskById(id);

  values.push(id);
  const stmt = db.prepare(`UPDATE subtasks SET ${fields.join(', ')} WHERE id = ?`);
  stmt.run(...values);
  return getSubtaskById(id);
}

export function deleteSubtask(id: number): boolean {
  const stmt = db.prepare('DELETE FROM subtasks WHERE id = ?');
  const result = stmt.run(id);
  return result.changes > 0;
}

export function getTodoWithSubtasks(id: number): (Todo & { subtasks: Subtask[] }) | undefined {
  const todo = getTodoById(id);
  if (!todo) return undefined;

  const subtasks = getSubtasksByTodoId(id);
  return { ...todo, subtasks };
}

export function getAllTodosWithSubtasks(userId: number): (Todo & { subtasks: Subtask[] })[] {
  const todos = getTodosByUserId(userId);
  return todos.map(todo => ({
    ...todo,
    subtasks: getSubtasksByTodoId(todo.id),
  }));
}

export function calculateProgress(subtasks: Subtask[]): {
  completed: number;
  total: number;
  percentage: number;
} {
  const total = subtasks.length;
  const completed = subtasks.filter(s => s.completed).length;
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;
  return { completed, total, percentage };
}

// Tag Operations
export const TAG_COLORS = [
  '#EF4444', // Red
  '#F59E0B', // Amber
  '#10B981', // Green
  '#3B82F6', // Blue
  '#6366F1', // Indigo
  '#8B5CF6', // Purple
  '#EC4899', // Pink
  '#14B8A6', // Teal
  '#F97316', // Orange
  '#84CC16', // Lime
];

export function getRandomTagColor(): string {
  return TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)];
}

export function createTag(userId: number, name: string, color?: string): Tag {
  const tagColor = color || getRandomTagColor();
  const stmt = db.prepare(`
    INSERT INTO tags (user_id, name, color)
    VALUES (?, ?, ?)
  `);
  const result = stmt.run(userId, name, tagColor);
  return getTagById(result.lastInsertRowid as number)!;
}

export function getTagById(id: number): Tag | undefined {
  const stmt = db.prepare('SELECT * FROM tags WHERE id = ?');
  return stmt.get(id) as Tag | undefined;
}

export function getTagsByUserId(userId: number): Tag[] {
  const stmt = db.prepare('SELECT * FROM tags WHERE user_id = ? ORDER BY name ASC');
  return stmt.all(userId) as Tag[];
}

export function updateTag(
  id: number,
  updates: Partial<Pick<Tag, 'name' | 'color'>>
): Tag | undefined {
  const fields: string[] = [];
  const values: any[] = [];

  if (updates.name !== undefined) {
    fields.push('name = ?');
    values.push(updates.name);
  }
  if (updates.color !== undefined) {
    fields.push('color = ?');
    values.push(updates.color);
  }

  if (fields.length === 0) return getTagById(id);

  values.push(id);
  const stmt = db.prepare(`UPDATE tags SET ${fields.join(', ')} WHERE id = ?`);
  stmt.run(...values);
  return getTagById(id);
}

export function deleteTag(id: number): boolean {
  const stmt = db.prepare('DELETE FROM tags WHERE id = ?');
  const result = stmt.run(id);
  return result.changes > 0;
}

export function addTagToTodo(todoId: number, tagId: number): void {
  const stmt = db.prepare(`
    INSERT OR IGNORE INTO todo_tags (todo_id, tag_id)
    VALUES (?, ?)
  `);
  stmt.run(todoId, tagId);
}

export function removeTagFromTodo(todoId: number, tagId: number): void {
  const stmt = db.prepare('DELETE FROM todo_tags WHERE todo_id = ? AND tag_id = ?');
  stmt.run(todoId, tagId);
}

export function getTagsForTodo(todoId: number): Tag[] {
  const stmt = db.prepare(`
    SELECT t.* FROM tags t
    JOIN todo_tags tt ON t.id = tt.tag_id
    WHERE tt.todo_id = ?
    ORDER BY t.name ASC
  `);
  return stmt.all(todoId) as Tag[];
}

export function getTodosByTagId(tagId: number, userId: number): Todo[] {
  const stmt = db.prepare(`
    SELECT t.* FROM todos t
    JOIN todo_tags tt ON t.id = tt.todo_id
    WHERE tt.tag_id = ? AND t.user_id = ?
    ORDER BY t.completed ASC, t.due_date ASC
  `);
  return stmt.all(tagId, userId) as Todo[];
}

export function getAllTodosWithTags(userId: number): (Todo & { subtasks: Subtask[]; tags: Tag[] })[] {
  const todos = getTodosByUserId(userId);
  return todos.map(todo => ({
    ...todo,
    subtasks: getSubtasksByTodoId(todo.id),
    tags: getTagsForTodo(todo.id),
  }));
}

// User operations (simplified for demo)
export function getOrCreateUser(username: string = 'demo-user'): { id: number; username: string } {
  let stmt = db.prepare('SELECT id, username FROM users WHERE username = ?');
  let user = stmt.get(username) as { id: number; username: string } | undefined;
  
  if (!user) {
    stmt = db.prepare('INSERT INTO users (username) VALUES (?)');
    const result = stmt.run(username);
    user = { id: result.lastInsertRowid as number, username };
  }
  
  return user;
}

// Template functions
export function createTemplate(
  userId: number,
  name: string,
  category: string | null,
  dueDateOffset: number,
  priority: Priority,
  subtasksJson: string | null,
  tagIdsJson: string | null
): number {
  const stmt = db.prepare(`
    INSERT INTO templates (user_id, name, category, due_date_offset, priority, subtasks_json, tag_ids_json)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(userId, name, category, dueDateOffset, priority, subtasksJson, tagIdsJson);
  return result.lastInsertRowid as number;
}

export function getTemplatesByUserId(userId: number): Template[] {
  const stmt = db.prepare('SELECT * FROM templates WHERE user_id = ? ORDER BY created_at DESC');
  return stmt.all(userId) as Template[];
}

export function getTemplateById(id: number): Template | undefined {
  const stmt = db.prepare('SELECT * FROM templates WHERE id = ?');
  return stmt.get(id) as Template | undefined;
}

export function deleteTemplate(id: number): void {
  const stmt = db.prepare('DELETE FROM templates WHERE id = ?');
  stmt.run(id);
}

export function instantiateTemplate(templateId: number, userId: number, dueDate: string): number {
  const template = getTemplateById(templateId);
  if (!template) {
    throw new Error('Template not found');
  }

  // Create the todo from template
  const todoId = createTodo(
    userId,
    `Todo from ${template.name}`,
    dueDate,
    template.priority,
    null,
    null,
    null
  );

  // Add subtasks if present
  if (template.subtasks_json) {
    try {
      const subtasks = JSON.parse(template.subtasks_json) as Array<{ title: string }>;
      for (const subtask of subtasks) {
        createSubtask(todoId, subtask.title);
      }
    } catch (e) {
      console.error('Failed to parse subtasks JSON:', e);
    }
  }

  // Add tags if present
  if (template.tag_ids_json) {
    try {
      const tagIds = JSON.parse(template.tag_ids_json) as number[];
      for (const tagId of tagIds) {
        addTagToTodo(todoId, tagId);
      }
    } catch (e) {
      console.error('Failed to parse tag IDs JSON:', e);
    }
  }

  return todoId;
}

export default db;
