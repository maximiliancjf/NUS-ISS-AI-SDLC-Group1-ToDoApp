# PRP-06: Tag System

## Feature Overview

Implement a flexible tagging system with color-coded labels that enables users to categorize and organize todos using a many-to-many relationship. Support tag creation, management (CRUD operations), assignment to multiple todos, and filtering by tags. Tags enhance organization and enable cross-category views of related tasks.

## User Stories

### User Persona: Lisa - Marketing Manager

**Story 1: Create Tags**
> As Lisa, I want to create custom tags like "Work", "Personal", "Urgent" with distinct colors so that I can visually categorize my todos.

**Story 2: Assign Multiple Tags**
> As Lisa, I want to assign multiple tags to a single todo so that I can categorize it across different dimensions (e.g., "Work" + "Urgent").

**Story 3: Filter by Tag**
> As Lisa, I want to filter my todo list by a specific tag so that I can focus on all "Work" tasks or all "Urgent" items.

**Story 4: Manage Tags**
> As Lisa, I want to edit tag names and colors or delete unused tags so that my tagging system stays organized and relevant.

**Story 5: See Tag Usage Count**
> As Lisa, I want to see how many todos use each tag so that I can identify my most common categories.

## User Flow

### Create Tag Flow
1. User clicks "Manage Tags" button in header/sidebar
2. Modal or sidebar opens showing existing tags
3. User clicks "New Tag" button
4. Form appears with fields:
   - Tag name (required, 1-30 chars)
   - Color picker (defaults to random color)
5. User enters name and selects color
6. User clicks "Create"
7. Tag appears immediately in tag list
8. Modal shows success message

### Assign Tag to Todo Flow
1. User creates new todo or edits existing one
2. Form shows "Tags" section with multiselect
3. User clicks to open tag dropdown
4. Dropdown shows all available tags with colors
5. User clicks one or more tags to select
6. Selected tags show as colored badges
7. User saves todo
8. Tags persist and display on todo item

### Filter by Tag Flow
1. User sees tag filter dropdown/buttons in main view
2. User clicks tag name or selects from dropdown
3. Todo list filters to show only items with that tag
4. Active filter shown prominently (e.g., "Showing: #Work")
5. User can clear filter to show all todos again

### Manage Tags Flow
1. User opens tag management interface
2. List shows all tags with:
   - Name
   - Color badge
   - Usage count (e.g., "Used by 5 todos")
   - Edit and Delete buttons
3. User clicks edit → Inline editing or modal
4. User modifies name or color → Saves
5. All todos with that tag update instantly
6. User deletes unused tag → Confirmation → Removed

## Technical Requirements

### Database Schema

```typescript
CREATE TABLE tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  color TEXT NOT NULL,  -- Hex color code (e.g., '#3B82F6')
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(user_id, name)  -- Prevent duplicate tag names per user
)

CREATE TABLE todo_tags (
  todo_id INTEGER NOT NULL,
  tag_id INTEGER NOT NULL,
  PRIMARY KEY (todo_id, tag_id),
  FOREIGN KEY (todo_id) REFERENCES todos(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
)

-- Indexes for efficient queries
CREATE INDEX idx_todo_tags_todo_id ON todo_tags(todo_id);
CREATE INDEX idx_todo_tags_tag_id ON todo_tags(tag_id);
```

**Key Points:**
- Many-to-many relationship via `todo_tags` junction table
- Unique constraint on (user_id, name) prevents duplicate tag names
- CASCADE DELETE removes tag relationships when todo or tag deleted
- Color stored as hex string for flexibility

### TypeScript Types

```typescript
// From lib/db.ts
export interface Tag {
  id: number;
  user_id: number;
  name: string;
  color: string;  // Hex color (e.g., '#3B82F6')
  created_at: string;
}

export interface TagWithCount extends Tag {
  usage_count: number;  // Number of todos using this tag
}

export interface TodoWithTags extends Todo {
  tags: Tag[];
}

// Predefined color palette for tag creation
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

// Helper to get random color for new tags
export function getRandomTagColor(): string {
  return TAG_COLORS[Math.floor(Math.random() * TAG_COLORS.length)];
}
```

### API Endpoints

#### 1. Create Tag - `POST /api/tags`

**Request Body:**
```typescript
{
  name: string;    // Required, 1-30 chars, unique per user
  color: string;   // Hex color, defaults to random if not provided
}
```

**Response (201 Created):**
```typescript
{
  tag: Tag;
}
```

**Implementation:**
```typescript
// app/api/tags/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { tagDB, getRandomTagColor } from '@/lib/db';

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const body = await request.json();
  let { name, color } = body;

  // Validate name
  if (!name || name.trim().length === 0 || name.length > 30) {
    return NextResponse.json(
      { error: 'Tag name must be 1-30 characters' },
      { status: 400 }
    );
  }

  name = name.trim();

  // Check for duplicate
  const existing = tagDB.findByUserAndName(session.userId, name);
  if (existing) {
    return NextResponse.json(
      { error: 'Tag name already exists' },
      { status: 409 }
    );
  }

  // Default color if not provided
  if (!color) {
    color = getRandomTagColor();
  }

  // Validate color format
  if (!/^#[0-9A-F]{6}$/i.test(color)) {
    return NextResponse.json(
      { error: 'Invalid color format. Use hex (e.g., #3B82F6)' },
      { status: 400 }
    );
  }

  const tag = tagDB.create({
    user_id: session.userId,
    name,
    color,
  });

  return NextResponse.json({ tag }, { status: 201 });
}
```

#### 2. Get All Tags - `GET /api/tags`

**Query Parameters:**
```typescript
{
  with_count?: boolean;  // Include usage counts
}
```

**Response:**
```typescript
{
  tags: Tag[] | TagWithCount[];
}
```

**Implementation:**
```typescript
export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const withCount = searchParams.get('with_count') === 'true';

  const tags = withCount
    ? tagDB.findByUserWithCount(session.userId)
    : tagDB.findByUser(session.userId);

  return NextResponse.json({ tags });
}
```

#### 3. Update Tag - `PUT /api/tags/[id]`

**URL Parameter:** `id` (tag ID)

**Request Body:**
```typescript
{
  name?: string;
  color?: string;
}
```

**Response:**
```typescript
{
  tag: Tag;
}
```

#### 4. Delete Tag - `DELETE /api/tags/[id]`

**URL Parameter:** `id` (tag ID)

**Response:**
```typescript
{
  success: true;
}
```

**Note:** Cascade deletes all `todo_tags` relationships automatically.

#### 5. Assign Tags to Todo - `POST /api/todos/[id]/tags`

**URL Parameter:** `id` (todo ID)

**Request Body:**
```typescript
{
  tag_ids: number[];  // Array of tag IDs to assign
}
```

**Response:**
```typescript
{
  todo: TodoWithTags;
}
```

**Implementation:**
```typescript
// app/api/todos/[id]/tags/route.ts
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { tag_ids } = await request.json();
  const todo = todoDB.findById(Number(id));

  if (!todo || todo.user_id !== session.userId) {
    return NextResponse.json({ error: 'Todo not found' }, { status: 404 });
  }

  // Clear existing tags
  db.prepare('DELETE FROM todo_tags WHERE todo_id = ?').run(todo.id);

  // Add new tags
  const stmt = db.prepare('INSERT INTO todo_tags (todo_id, tag_id) VALUES (?, ?)');
  tag_ids.forEach((tagId: number) => {
    stmt.run(todo.id, tagId);
  });

  // Return todo with tags
  const tags = tagDB.findByTodo(todo.id);
  return NextResponse.json({ todo: { ...todo, tags } });
}
```

### Database Layer Updates

```typescript
// In lib/db.ts
export const tagDB = {
  /**
   * Create a new tag
   */
  create(data: {
    user_id: number;
    name: string;
    color: string;
  }): Tag {
    const stmt = db.prepare(`
      INSERT INTO tags (user_id, name, color)
      VALUES (?, ?, ?)
    `);
    const info = stmt.run(data.user_id, data.name, data.color);
    return this.findById(Number(info.lastInsertRowid))!;
  },

  /**
   * Find tag by ID
   */
  findById(id: number): Tag | null {
    const stmt = db.prepare('SELECT * FROM tags WHERE id = ?');
    return stmt.get(id) as Tag | null;
  },

  /**
   * Find all tags for a user
   */
  findByUser(userId: number): Tag[] {
    const stmt = db.prepare(`
      SELECT * FROM tags 
      WHERE user_id = ? 
      ORDER BY name ASC
    `);
    return stmt.all(userId) as Tag[];
  },

  /**
   * Find all tags for a user with usage counts
   */
  findByUserWithCount(userId: number): TagWithCount[] {
    const stmt = db.prepare(`
      SELECT 
        tags.*,
        COUNT(todo_tags.todo_id) as usage_count
      FROM tags
      LEFT JOIN todo_tags ON tags.id = todo_tags.tag_id
      WHERE tags.user_id = ?
      GROUP BY tags.id
      ORDER BY tags.name ASC
    `);
    return stmt.all(userId) as TagWithCount[];
  },

  /**
   * Find tag by user and name (for duplicate check)
   */
  findByUserAndName(userId: number, name: string): Tag | null {
    const stmt = db.prepare(`
      SELECT * FROM tags 
      WHERE user_id = ? AND name = ?
    `);
    return stmt.get(userId, name) as Tag | null;
  },

  /**
   * Find all tags for a specific todo
   */
  findByTodo(todoId: number): Tag[] {
    const stmt = db.prepare(`
      SELECT tags.* FROM tags
      JOIN todo_tags ON tags.id = todo_tags.tag_id
      WHERE todo_tags.todo_id = ?
      ORDER BY tags.name ASC
    `);
    return stmt.all(todoId) as Tag[];
  },

  /**
   * Update tag
   */
  update(id: number, data: Partial<Tag>): Tag {
    const fields = Object.keys(data);
    const values = Object.values(data);
    
    const setClause = fields.map(f => `${f} = ?`).join(', ');
    const stmt = db.prepare(`UPDATE tags SET ${setClause} WHERE id = ?`);
    stmt.run(...values, id);
    
    return this.findById(id)!;
  },

  /**
   * Delete tag (cascades to todo_tags)
   */
  delete(id: number): void {
    const stmt = db.prepare('DELETE FROM tags WHERE id = ?');
    stmt.run(id);
  },
};

// Helper for todoDB to include tags
export const todoDB = {
  // ... existing methods

  /**
   * Find todo with tags
   */
  findByIdWithTags(id: number): TodoWithTags | null {
    const todo = this.findById(id);
    if (!todo) return null;

    const tags = tagDB.findByTodo(id);
    return { ...todo, tags };
  },

  /**
   * Find all todos for user with tags
   */
  findByUserWithTags(userId: number): TodoWithTags[] {
    const todos = this.findByUser(userId);
    return todos.map(todo => ({
      ...todo,
      tags: tagDB.findByTodo(todo.id),
    }));
  },
};
```

## UI Components

### Tag Management Modal

```typescript
'use client';

import { useState, useEffect } from 'react';
import { Tag, TagWithCount } from '@/lib/db';
import { TagBadge } from './TagBadge';
import { TagForm } from './TagForm';

export function TagManagementModal({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const [tags, setTags] = useState<TagWithCount[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);

  useEffect(() => {
    if (isOpen) {
      fetchTags();
    }
  }, [isOpen]);

  async function fetchTags() {
    const res = await fetch('/api/tags?with_count=true');
    const data = await res.json();
    setTags(data.tags);
  }

  async function handleCreate(name: string, color: string) {
    const res = await fetch('/api/tags', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, color }),
    });

    if (res.ok) {
      setIsCreating(false);
      fetchTags();
    } else {
      const error = await res.json();
      alert(error.error);
    }
  }

  async function handleUpdate(id: number, name: string, color: string) {
    await fetch(`/api/tags/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, color }),
    });

    setEditingId(null);
    fetchTags();
  }

  async function handleDelete(id: number) {
    if (!confirm('Delete this tag? It will be removed from all todos.')) return;

    await fetch(`/api/tags/${id}`, { method: 'DELETE' });
    fetchTags();
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black bg-opacity-50 flex items-center justify-center">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[80vh] overflow-hidden">
        <div className="p-6 border-b">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-bold">Manage Tags</h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-gray-700 text-2xl"
            >
              ×
            </button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto max-h-[60vh]">
          {/* Tag List */}
          <div className="space-y-3">
            {tags.map((tag) => (
              <div
                key={tag.id}
                className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50"
              >
                {editingId === tag.id ? (
                  <TagForm
                    initialName={tag.name}
                    initialColor={tag.color}
                    onSubmit={(name, color) => handleUpdate(tag.id, name, color)}
                    onCancel={() => setEditingId(null)}
                  />
                ) : (
                  <>
                    <div className="flex items-center gap-3">
                      <TagBadge name={tag.name} color={tag.color} />
                      <span className="text-sm text-gray-500">
                        Used by {tag.usage_count} todo{tag.usage_count !== 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={() => setEditingId(tag.id)}
                        className="px-3 py-1 text-sm text-blue-600 hover:bg-blue-50 rounded"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => handleDelete(tag.id)}
                        className="px-3 py-1 text-sm text-red-600 hover:bg-red-50 rounded"
                        disabled={tag.usage_count > 0}
                      >
                        Delete
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>

          {/* Create New Tag */}
          {isCreating ? (
            <div className="mt-4 p-4 bg-gray-50 rounded-lg">
              <TagForm
                onSubmit={handleCreate}
                onCancel={() => setIsCreating(false)}
              />
            </div>
          ) : (
            <button
              onClick={() => setIsCreating(true)}
              className="mt-4 w-full py-3 border-2 border-dashed border-gray-300 rounded-lg text-gray-600 hover:border-blue-500 hover:text-blue-600"
            >
              + Create New Tag
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
```

### Tag Form Component

```typescript
import { useState } from 'react';
import { TAG_COLORS, getRandomTagColor } from '@/lib/db';

interface TagFormProps {
  initialName?: string;
  initialColor?: string;
  onSubmit: (name: string, color: string) => void;
  onCancel: () => void;
}

export function TagForm({ initialName = '', initialColor, onSubmit, onCancel }: TagFormProps) {
  const [name, setName] = useState(initialName);
  const [color, setColor] = useState(initialColor || getRandomTagColor());

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (name.trim().length === 0) return;
    onSubmit(name.trim(), color);
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Tag name"
        maxLength={30}
        className="w-full px-3 py-2 border rounded-lg"
        autoFocus
        required
      />

      <div className="flex gap-2 flex-wrap">
        {TAG_COLORS.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setColor(c)}
            className={`w-8 h-8 rounded-full border-2 ${
              color === c ? 'border-gray-900 scale-110' : 'border-transparent'
            }`}
            style={{ backgroundColor: c }}
          />
        ))}
      </div>

      <div className="flex gap-2">
        <button
          type="submit"
          className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
        >
          {initialName ? 'Update' : 'Create'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
```

### Tag Badge Component

```typescript
interface TagBadgeProps {
  name: string;
  color: string;
  size?: 'sm' | 'md' | 'lg';
  removable?: boolean;
  onRemove?: () => void;
}

export function TagBadge({ name, color, size = 'md', removable = false, onRemove }: TagBadgeProps) {
  const sizeClasses = {
    sm: 'text-xs px-2 py-0.5',
    md: 'text-sm px-3 py-1',
    lg: 'text-base px-4 py-2',
  };

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-medium ${sizeClasses[size]}`}
      style={{
        backgroundColor: `${color}20`,  // 20% opacity
        color: color,
        border: `1px solid ${color}40`,
      }}
    >
      <span>{name}</span>
      {removable && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            onRemove?.();
          }}
          className="hover:bg-opacity-20 rounded-full p-0.5"
        >
          ×
        </button>
      )}
    </span>
  );
}
```

### Tag Selector Component (Multi-select)

```typescript
import { useState, useEffect } from 'react';
import { Tag } from '@/lib/db';
import { TagBadge } from './TagBadge';

interface TagSelectorProps {
  selectedTagIds: number[];
  onChange: (tagIds: number[]) => void;
}

export function TagSelector({ selectedTagIds, onChange }: TagSelectorProps) {
  const [tags, setTags] = useState<Tag[]>([]);
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    fetchTags();
  }, []);

  async function fetchTags() {
    const res = await fetch('/api/tags');
    const data = await res.json();
    setTags(data.tags);
  }

  function handleToggle(tagId: number) {
    if (selectedTagIds.includes(tagId)) {
      onChange(selectedTagIds.filter(id => id !== tagId));
    } else {
      onChange([...selectedTagIds, tagId]);
    }
  }

  const selectedTags = tags.filter(t => selectedTagIds.includes(t.id));

  return (
    <div className="relative">
      <label className="block text-sm font-medium text-gray-700 mb-2">
        Tags
      </label>

      {/* Selected Tags Display */}
      <div className="flex flex-wrap gap-2 mb-2">
        {selectedTags.map(tag => (
          <TagBadge
            key={tag.id}
            name={tag.name}
            color={tag.color}
            removable
            onRemove={() => handleToggle(tag.id)}
          />
        ))}
      </div>

      {/* Dropdown */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-2 border rounded-lg text-left bg-white hover:bg-gray-50"
      >
        {selectedTags.length > 0 ? 'Add more tags...' : 'Select tags...'}
      </button>

      {isOpen && (
        <div className="absolute z-10 mt-1 w-full bg-white border rounded-lg shadow-lg max-h-60 overflow-y-auto">
          {tags.map(tag => (
            <button
              key={tag.id}
              type="button"
              onClick={() => handleToggle(tag.id)}
              className="w-full px-4 py-2 text-left hover:bg-gray-50 flex items-center justify-between"
            >
              <TagBadge name={tag.name} color={tag.color} size="sm" />
              {selectedTagIds.includes(tag.id) && (
                <span className="text-blue-600">✓</span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

### Tag Filter Component

```typescript
interface TagFilterProps {
  selectedTagId: number | null;
  onFilterChange: (tagId: number | null) => void;
}

export function TagFilter({ selectedTagId, onFilterChange }: TagFilterProps) {
  const [tags, setTags] = useState<Tag[]>([]);

  useEffect(() => {
    async function fetchTags() {
      const res = await fetch('/api/tags');
      const data = await res.json();
      setTags(data.tags);
    }
    fetchTags();
  }, []);

  const selectedTag = tags.find(t => t.id === selectedTagId);

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-sm font-medium text-gray-700">Filter by tag:</span>
      
      {tags.map(tag => (
        <button
          key={tag.id}
          onClick={() => onFilterChange(tag.id === selectedTagId ? null : tag.id)}
          className={`transition-all ${
            tag.id === selectedTagId ? 'ring-2 ring-offset-2' : 'opacity-60 hover:opacity-100'
          }`}
          style={{ ringColor: tag.color }}
        >
          <TagBadge name={tag.name} color={tag.color} size="sm" />
        </button>
      ))}

      {selectedTagId && (
        <button
          onClick={() => onFilterChange(null)}
          className="text-sm text-gray-500 hover:text-gray-700 underline"
        >
          Clear filter
        </button>
      )}
    </div>
  );
}
```

## Edge Cases

### 1. Duplicate Tag Names
- **Problem:** User creates two tags with same name
- **Solution:** UNIQUE constraint on (user_id, name), return 409 Conflict
- **Test:** Attempt to create tag with existing name

### 2. Case Sensitivity
- **Problem:** "Work" vs "work" - should they be different?
- **Solution:** Treat as case-sensitive, but recommend lowercase in UI
- **Test:** Create "Work" and "work", verify both exist

### 3. Special Characters in Tag Names
- **Problem:** User enters emoji or special chars in tag name
- **Solution:** Allow all Unicode characters (no restriction)
- **Test:** Create tag with emoji, verify it works

### 4. Deleting Tag Used by Todos
- **Problem:** User deletes tag that's assigned to 50 todos
- **Solution:** CASCADE DELETE removes all `todo_tags` entries, warn user
- **Test:** Delete tag with high usage_count, verify todos unaffected (just tag removed)

### 5. Concurrent Tag Assignment
- **Problem:** User assigns tags, another user deletes tag simultaneously
- **Solution:** Foreign key constraint prevents orphaned relationships
- **Test:** Simulate concurrent delete and assign

### 6. Too Many Tags on One Todo
- **Problem:** User assigns 20+ tags to single todo, UI cluttered
- **Solution:** No hard limit, but UI shows "+" badge after 5 tags
- **Test:** Assign 10 tags, verify UI remains readable

### 7. Color Picker Accessibility
- **Problem:** Colorblind users can't distinguish similar colors
- **Solution:** Include color name/label in addition to visual
- **Test:** Verify tag name visible alongside color

### 8. Empty Tag Name
- **Problem:** User submits empty or whitespace-only name
- **Solution:** Validation rejects empty names (frontend + backend)
- **Test:** Attempt to create tag with empty name

## Acceptance Criteria

### Tag CRUD Operations
- [ ] User can create tags with name and color
- [ ] Name: 1-30 characters, unique per user
- [ ] Color: Hex code, defaults to random if not provided
- [ ] User can edit tag name and color
- [ ] User can delete tags (requires confirmation if used)
- [ ] All operations reflect immediately in UI

### Tag Assignment
- [ ] User can assign multiple tags to a todo
- [ ] User can remove tags from a todo
- [ ] Tags persist after page reload
- [ ] Tag badges display on todo items

### Tag Filtering
- [ ] User can filter todos by tag
- [ ] Filter shows only todos with selected tag
- [ ] Active filter visually highlighted
- [ ] Clear filter restores all todos

### Tag Management UI
- [ ] Tag list shows all tags with usage counts
- [ ] Usage count accurate (counts todos with tag)
- [ ] Edit mode inline or in modal
- [ ] Delete disabled for tags in use (or with confirmation)

### Visual Design
- [ ] Tags have consistent color scheme
- [ ] Badge contrast meets WCAG AA standards
- [ ] Tags visually distinct from priorities
- [ ] Color picker intuitive and accessible

## Testing Requirements

### Unit Tests

**File:** `lib/db.test.ts`

```typescript
describe('tagDB', () => {
  test('create() enforces unique name per user', () => {
    tagDB.create({ user_id: 1, name: 'Work', color: '#3B82F6' });

    expect(() => {
      tagDB.create({ user_id: 1, name: 'Work', color: '#EF4444' });
    }).toThrow();  // UNIQUE constraint violation
  });

  test('findByUserWithCount() returns usage counts', () => {
    const tag = tagDB.create({ user_id: 1, name: 'Work', color: '#3B82F6' });
    const todo = todoDB.create({ user_id: 1, title: 'Task', due_date: '2026-02-10', priority: 'medium' });

    // Assign tag to todo
    db.prepare('INSERT INTO todo_tags (todo_id, tag_id) VALUES (?, ?)').run(todo.id, tag.id);

    const tags = tagDB.findByUserWithCount(1);
    expect(tags.find(t => t.id === tag.id)?.usage_count).toBe(1);
  });

  test('delete() cascades to todo_tags', () => {
    const tag = tagDB.create({ user_id: 1, name: 'Work', color: '#3B82F6' });
    const todo = todoDB.create({ user_id: 1, title: 'Task', due_date: '2026-02-10', priority: 'medium' });

    db.prepare('INSERT INTO todo_tags (todo_id, tag_id) VALUES (?, ?)').run(todo.id, tag.id);

    tagDB.delete(tag.id);

    const relationships = db.prepare('SELECT * FROM todo_tags WHERE tag_id = ?').all(tag.id);
    expect(relationships).toHaveLength(0);
  });

  test('findByTodo() returns tags sorted by name', () => {
    const todo = todoDB.create({ user_id: 1, title: 'Task', due_date: '2026-02-10', priority: 'medium' });
    const tagZ = tagDB.create({ user_id: 1, name: 'Zebra', color: '#000000' });
    const tagA = tagDB.create({ user_id: 1, name: 'Apple', color: '#FFFFFF' });

    db.prepare('INSERT INTO todo_tags (todo_id, tag_id) VALUES (?, ?)').run(todo.id, tagZ.id);
    db.prepare('INSERT INTO todo_tags (todo_id, tag_id) VALUES (?, ?)').run(todo.id, tagA.id);

    const tags = tagDB.findByTodo(todo.id);
    expect(tags.map(t => t.name)).toEqual(['Apple', 'Zebra']);
  });
});
```

### E2E Tests (Playwright)

**File:** `tests/07-tag-system.spec.ts`

```typescript
import { test, expect } from '@playwright/test';

test.describe('Tag System', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('should create a new tag', async ({ page }) => {
    await page.click('button:has-text("Manage Tags")');
    await page.click('button:has-text("Create New Tag")');
    
    await page.fill('input[placeholder="Tag name"]', 'Work');
    await page.click('button[style*="background-color: rgb(59, 130, 246)"]');  // Blue
    await page.click('button:has-text("Create")');

    await expect(page.locator('text=Work')).toBeVisible();
  });

  test('should prevent duplicate tag names', async ({ page }) => {
    // Create first tag
    await page.click('button:has-text("Manage Tags")');
    await page.click('button:has-text("Create New Tag")');
    await page.fill('input[placeholder="Tag name"]', 'Work');
    await page.click('button:has-text("Create")');

    // Try to create duplicate
    await page.click('button:has-text("Create New Tag")');
    await page.fill('input[placeholder="Tag name"]', 'Work');
    await page.click('button:has-text("Create")');

    await expect(page.locator('text=Tag name already exists')).toBeVisible();
  });

  test('should assign tags to todo', async ({ page }) => {
    // Create tag first
    await page.click('button:has-text("Manage Tags")');
    await page.click('button:has-text("Create New Tag")');
    await page.fill('input[placeholder="Tag name"]', 'Urgent');
    await page.click('button:has-text("Create")');
    await page.click('button:has-text("×")');  // Close modal

    // Create todo with tag
    await page.fill('input[placeholder*="Add a new todo"]', 'Tagged task');
    await page.click('button:has-text("Show Advanced Options")');
    await page.click('button:has-text("Select tags...")');
    await page.click('text=Urgent');
    await page.click('button:has-text("Add")');

    // Verify tag badge on todo
    const todo = page.locator('.todo-item:has-text("Tagged task")');
    await expect(todo.locator('.tag-badge:has-text("Urgent")')).toBeVisible();
  });

  test('should filter todos by tag', async ({ page }) => {
    // Setup: Create tag and two todos (one with tag, one without)
    await page.click('button:has-text("Manage Tags")');
    await page.click('button:has-text("Create New Tag")');
    await page.fill('input[placeholder="Tag name"]', 'Work');
    await page.click('button:has-text("Create")');
    await page.click('button:has-text("×")');

    // Todo with tag
    await page.fill('input[placeholder*="Add a new todo"]', 'Work task');
    await page.click('button:has-text("Show Advanced Options")');
    await page.click('button:has-text("Select tags...")');
    await page.click('text=Work');
    await page.click('button:has-text("Add")');

    // Todo without tag
    await page.fill('input[placeholder*="Add a new todo"]', 'Personal task');
    await page.click('button:has-text("Add")');

    // Filter by Work tag
    await page.click('.tag-badge:has-text("Work")');

    // Verify filtering
    await expect(page.locator('text=Work task')).toBeVisible();
    await expect(page.locator('text=Personal task')).not.toBeVisible();
  });

  test('should show usage count for tags', async ({ page }) => {
    // Create tag
    await page.click('button:has-text("Manage Tags")');
    await page.click('button:has-text("Create New Tag")');
    await page.fill('input[placeholder="Tag name"]', 'Test');
    await page.click('button:has-text("Create")');

    // Verify initial count
    await expect(page.locator('text=Used by 0 todos')).toBeVisible();

    // Assign to todo
    await page.click('button:has-text("×")');
    await page.fill('input[placeholder*="Add a new todo"]', 'Task 1');
    await page.click('button:has-text("Show Advanced Options")');
    await page.click('button:has-text("Select tags...")');
    await page.click('text=Test');
    await page.click('button:has-text("Add")');

    // Check updated count
    await page.click('button:has-text("Manage Tags")');
    await expect(page.locator('text=Used by 1 todo')).toBeVisible();
  });

  test('should edit tag name and color', async ({ page }) => {
    // Create tag
    await page.click('button:has-text("Manage Tags")');
    await page.click('button:has-text("Create New Tag")');
    await page.fill('input[placeholder="Tag name"]', 'Old Name');
    await page.click('button:has-text("Create")');

    // Edit tag
    await page.click('button:has-text("Edit")');
    await page.fill('input[value="Old Name"]', 'New Name');
    await page.click('button:has-text("Update")');

    await expect(page.locator('text=New Name')).toBeVisible();
    await expect(page.locator('text=Old Name')).not.toBeVisible();
  });

  test('should delete unused tag', async ({ page }) => {
    // Create tag
    await page.click('button:has-text("Manage Tags")');
    await page.click('button:has-text("Create New Tag")');
    await page.fill('input[placeholder="Tag name"]', 'To Delete');
    await page.click('button:has-text("Create")');

    // Delete tag
    page.once('dialog', dialog => dialog.accept());
    await page.click('button:has-text("Delete")');

    await expect(page.locator('text=To Delete')).not.toBeVisible();
  });
});
```

## Out of Scope

The following features are **NOT** included in this PRP:

- ❌ Hierarchical tags (parent-child relationships)
- ❌ Tag merging (combine two tags into one)
- ❌ Tag sharing between users
- ❌ Automatic tag suggestions based on todo content
- ❌ Tag synonyms or aliases
- ❌ Import/export just tags (included in todo export/import)

## Success Metrics

### Performance Metrics
- [ ] Tag creation completes in < 150ms
- [ ] Filtering by tag updates in < 100ms
- [ ] Rendering 100+ tags without lag

### User Experience Metrics
- [ ] 60%+ of users create at least 3 tags
- [ ] Average 2-3 tags per todo
- [ ] Tag filtering used by 50%+ of active users

### Code Quality Metrics
- [ ] Test coverage: 90%+ for tag logic
- [ ] No orphaned todo_tags records
- [ ] UNIQUE constraint prevents duplicates

### Adoption Metrics
- [ ] Most common tags: Work, Personal, Urgent (expected top 3)
- [ ] Tag usage correlates with improved task organization
- [ ] <1% of tag-related bug reports

---

**Last Updated:** February 5, 2026  
**Version:** 1.0  
**Dependencies:** PRP-01 (Todo CRUD)  
**Dependents:** PRP-03 (Recurring - copies tags), PRP-07 (Templates - includes tags), PRP-08 (Search/Filtering - filter by tags)
