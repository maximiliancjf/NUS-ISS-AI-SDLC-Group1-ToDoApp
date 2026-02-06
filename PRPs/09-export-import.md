# PRP-09: Export & Import

## Feature Overview

Implement robust data portability allowing users to backup all todos (with subtasks, tags, and relationships) to JSON files and restore them later. The system handles ID remapping during import to avoid conflicts, validates data integrity, and preserves all relationships between todos, subtasks, and tags.

## User Stories

### User Persona: Marcus - Data-Conscious Professional

**Story 1: Backup All Data**
> As Marcus, I want to export all my todos to a JSON file so that I have a backup in case I switch devices or need to restore my data.

**Story 2: Migrate to New Account**
> As Marcus, I want to import todos from my old account so that I don't lose my task history when switching accounts.

**Story 3: Share Template Collection**
> As Marcus, I want to export my templates and share them with colleagues so they can use my todo patterns.

**Story 4: Recover from Mistake**
> As Marcus, I want to restore a backup from yesterday so that I can recover todos I accidentally deleted.

**Story 5: Validate Before Import**
> As Marcus, I want to see a preview of what will be imported so that I can verify the data before committing the changes.

## User Flow

### Export Flow
1. User clicks "Export Data" button in settings/menu
2. System generates JSON file with all user data:
   - All todos (including completed)
   - All subtasks
   - All tags
   - All templates
3. Browser prompts download: `todos-backup-2026-02-05.json`
4. User saves file to local disk
5. Success message: "Exported 47 todos, 12 tags, 5 templates"

### Import Flow
1. User clicks "Import Data" button
2. File picker opens
3. User selects `todos-backup-2026-02-05.json`
4. System validates JSON structure
5. Preview modal shows:
   - "23 todos will be imported"
   - "8 new tags will be created"
   - "5 templates will be added"
6. User clicks "Confirm Import"
7. System:
   - Creates new IDs (no conflicts)
   - Remaps all foreign key references
   - Preserves tag-todo relationships
8. Success message: "Imported 23 todos successfully"

### Import with Conflicts
1. User imports file containing tag "Work"
2. User already has tag "Work" in database
3. System intelligently merges:
   - Reuses existing "Work" tag
   - Updates todo-tag relationships to use existing tag ID
   - Avoids duplicate tags
4. Preview shows "2 tags already exist (will be merged)"

### Import Validation Failure
1. User selects corrupted JSON file
2. System detects invalid structure
3. Error modal shows specific issues:
   - "Missing required field: todos[2].title"
   - "Invalid date format: todos[5].due_date"
4. Import canceled, no data changed
5. User can fix JSON and retry

## Technical Requirements

### Export API Endpoint

**Endpoint:** `GET /api/todos/export`

```typescript
// app/api/todos/export/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { todoDB, subtaskDB, tagDB, templateDB, db } from '@/lib/db';
import { getSingaporeNow } from '@/lib/timezone';
import { format } from 'date-fns-tz';

export async function GET(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    // Export all todos with relationships
    const todos = todoDB.getAllByUser(session.userId);
    const tags = tagDB.getAllByUser(session.userId);
    const templates = templateDB.getAllByUser(session.userId);

    // Get all subtasks for these todos
    const subtasksMap: Record<number, any[]> = {};
    const tagsMap: Record<number, number[]> = {};

    todos.forEach(todo => {
      subtasksMap[todo.id] = subtaskDB.getByTodo(todo.id);
      
      // Get tag IDs for this todo
      const todoTags = db.prepare(`
        SELECT tag_id FROM todo_tags WHERE todo_id = ?
      `).all(todo.id) as { tag_id: number }[];
      
      tagsMap[todo.id] = todoTags.map(t => t.tag_id);
    });

    // Build export structure
    const exportData = {
      version: '1.0',
      exported_at: getSingaporeNow().toISOString(),
      user_id: session.userId,  // For reference only
      data: {
        todos: todos.map(todo => ({
          ...todo,
          subtasks: subtasksMap[todo.id] || [],
          tag_ids: tagsMap[todo.id] || [],
        })),
        tags,
        templates,
      },
      metadata: {
        total_todos: todos.length,
        total_tags: tags.length,
        total_templates: templates.length,
        total_subtasks: Object.values(subtasksMap).flat().length,
      },
    };

    // Generate filename with date
    const dateStr = format(getSingaporeNow(), 'yyyy-MM-dd', { timeZone: 'Asia/Singapore' });
    const filename = `todos-backup-${dateStr}.json`;

    return new NextResponse(JSON.stringify(exportData, null, 2), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (error) {
    console.error('Export error:', error);
    return NextResponse.json(
      { error: 'Failed to export data' },
      { status: 500 }
    );
  }
}
```

### Import API Endpoint

**Endpoint:** `POST /api/todos/import`

```typescript
// app/api/todos/import/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { todoDB, subtaskDB, tagDB, templateDB, db } from '@/lib/db';
import { Todo, Subtask, Tag, Template } from '@/lib/db';

interface ExportData {
  version: string;
  exported_at: string;
  data: {
    todos: (Todo & { subtasks: Subtask[]; tag_ids: number[] })[];
    tags: Tag[];
    templates: Template[];
  };
}

export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const body = await request.json() as ExportData;

    // Validation
    const validationErrors = validateExportData(body);
    if (validationErrors.length > 0) {
      return NextResponse.json(
        { error: 'Invalid import data', details: validationErrors },
        { status: 400 }
      );
    }

    // ID remapping structures
    const tagIdMap = new Map<number, number>();  // old ID → new ID
    const todoIdMap = new Map<number, number>();

    // Import tags first (handle duplicates by name)
    const existingTags = tagDB.getAllByUser(session.userId);
    const existingTagNames = new Map(existingTags.map(t => [t.name.toLowerCase(), t.id]));

    body.data.tags.forEach(tag => {
      const lowerName = tag.name.toLowerCase();
      if (existingTagNames.has(lowerName)) {
        // Reuse existing tag
        tagIdMap.set(tag.id, existingTagNames.get(lowerName)!);
      } else {
        // Create new tag
        const newTagId = tagDB.create({
          name: tag.name,
          color: tag.color,
          user_id: session.userId,
        });
        tagIdMap.set(tag.id, newTagId);
        existingTagNames.set(lowerName, newTagId);
      }
    });

    // Import todos
    body.data.todos.forEach(todo => {
      // Create new todo (omit old ID, let DB assign new one)
      const newTodoId = todoDB.create({
        title: todo.title,
        user_id: session.userId,
        priority: todo.priority,
        due_date: todo.due_date,
        completed: todo.completed,
        completed_at: todo.completed_at,
        recurrence_pattern: todo.recurrence_pattern,
        reminder_minutes: todo.reminder_minutes,
        last_notification_sent: null,  // Reset notifications
      });

      todoIdMap.set(todo.id, newTodoId);

      // Import subtasks with remapped todo_id
      todo.subtasks.forEach(subtask => {
        subtaskDB.create({
          todo_id: newTodoId,
          title: subtask.title,
          position: subtask.position,
          completed: subtask.completed,
        });
      });

      // Recreate tag relationships with remapped IDs
      todo.tag_ids.forEach(oldTagId => {
        const newTagId = tagIdMap.get(oldTagId);
        if (newTagId) {
          db.prepare(`
            INSERT OR IGNORE INTO todo_tags (todo_id, tag_id)
            VALUES (?, ?)
          `).run(newTodoId, newTagId);
        }
      });
    });

    // Import templates (independent of todos)
    body.data.templates.forEach(template => {
      templateDB.create({
        user_id: session.userId,
        name: template.name,
        category: template.category,
        description: template.description,
        priority: template.priority,
        due_offset_days: template.due_offset_days,
        reminder_minutes: template.reminder_minutes,
        subtasks_json: template.subtasks_json,
      });
    });

    return NextResponse.json({
      success: true,
      message: 'Import completed successfully',
      imported: {
        todos: body.data.todos.length,
        tags: body.data.tags.length,
        templates: body.data.templates.length,
        subtasks: body.data.todos.flatMap(t => t.subtasks).length,
      },
    });
  } catch (error) {
    console.error('Import error:', error);
    return NextResponse.json(
      { error: 'Failed to import data' },
      { status: 500 }
    );
  }
}

/**
 * Validate export data structure
 */
function validateExportData(data: any): string[] {
  const errors: string[] = [];

  if (!data || typeof data !== 'object') {
    errors.push('Invalid data structure: expected object');
    return errors;
  }

  if (!data.version) {
    errors.push('Missing version field');
  }

  if (!data.data || typeof data.data !== 'object') {
    errors.push('Missing data field');
    return errors;
  }

  // Validate todos array
  if (!Array.isArray(data.data.todos)) {
    errors.push('data.todos must be an array');
  } else {
    data.data.todos.forEach((todo: any, index: number) => {
      if (!todo.title || typeof todo.title !== 'string') {
        errors.push(`todos[${index}]: missing or invalid title`);
      }
      if (!todo.priority || !['high', 'medium', 'low'].includes(todo.priority)) {
        errors.push(`todos[${index}]: invalid priority`);
      }
      if (!Array.isArray(todo.subtasks)) {
        errors.push(`todos[${index}]: subtasks must be an array`);
      }
      if (!Array.isArray(todo.tag_ids)) {
        errors.push(`todos[${index}]: tag_ids must be an array`);
      }
    });
  }

  // Validate tags array
  if (!Array.isArray(data.data.tags)) {
    errors.push('data.tags must be an array');
  } else {
    data.data.tags.forEach((tag: any, index: number) => {
      if (!tag.name || typeof tag.name !== 'string') {
        errors.push(`tags[${index}]: missing or invalid name`);
      }
      if (!tag.color || typeof tag.color !== 'string') {
        errors.push(`tags[${index}]: missing or invalid color`);
      }
    });
  }

  // Validate templates array
  if (!Array.isArray(data.data.templates)) {
    errors.push('data.templates must be an array');
  }

  return errors;
}
```

### Import Preview Endpoint

**Endpoint:** `POST /api/todos/import/preview`

```typescript
// app/api/todos/import/preview/route.ts
export async function POST(request: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  try {
    const body = await request.json() as ExportData;

    // Validate
    const validationErrors = validateExportData(body);
    if (validationErrors.length > 0) {
      return NextResponse.json({
        valid: false,
        errors: validationErrors,
      });
    }

    // Analyze import (no DB changes)
    const existingTags = tagDB.getAllByUser(session.userId);
    const existingTagNames = new Set(existingTags.map(t => t.name.toLowerCase()));

    const tagsToCreate = body.data.tags.filter(
      tag => !existingTagNames.has(tag.name.toLowerCase())
    );
    const tagsToMerge = body.data.tags.filter(
      tag => existingTagNames.has(tag.name.toLowerCase())
    );

    return NextResponse.json({
      valid: true,
      preview: {
        todos_to_import: body.data.todos.length,
        tags_to_create: tagsToCreate.length,
        tags_to_merge: tagsToMerge.length,
        templates_to_import: body.data.templates.length,
        subtasks_to_import: body.data.todos.flatMap(t => t.subtasks).length,
      },
      mergeDetails: {
        mergingTags: tagsToMerge.map(t => t.name),
      },
    });
  } catch (error) {
    return NextResponse.json({
      valid: false,
      errors: ['Failed to parse JSON'],
    });
  }
}
```

## UI Components

### Export Button Component

```typescript
'use client';

import { useState } from 'react';

export function ExportButton() {
  const [isExporting, setIsExporting] = useState(false);

  async function handleExport() {
    setIsExporting(true);
    try {
      const res = await fetch('/api/todos/export');
      if (!res.ok) throw new Error('Export failed');

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = res.headers.get('Content-Disposition')?.split('filename=')[1]?.replace(/"/g, '') || 'todos-backup.json';
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);

      alert('✅ Export successful! Check your downloads folder.');
    } catch (error) {
      alert('❌ Export failed. Please try again.');
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <button
      onClick={handleExport}
      disabled={isExporting}
      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
    >
      {isExporting ? 'Exporting...' : '📥 Export Data'}
    </button>
  );
}
```

### Import Modal Component

```typescript
'use client';

import { useState } from 'react';

interface ImportPreview {
  valid: boolean;
  errors?: string[];
  preview?: {
    todos_to_import: number;
    tags_to_create: number;
    tags_to_merge: number;
    templates_to_import: number;
    subtasks_to_import: number;
  };
  mergeDetails?: {
    mergingTags: string[];
  };
}

export function ImportModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setPreview(null);

    // Read and preview
    try {
      const text = await selectedFile.text();
      const data = JSON.parse(text);

      const res = await fetch('/api/todos/import/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      const previewData = await res.json();
      setPreview(previewData);
    } catch (error) {
      setPreview({
        valid: false,
        errors: ['Failed to parse JSON file'],
      });
    }
  }

  async function handleImport() {
    if (!file || !preview?.valid) return;

    setIsImporting(true);
    try {
      const text = await file.text();
      const data = JSON.parse(text);

      const res = await fetch('/api/todos/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });

      if (!res.ok) throw new Error('Import failed');

      const result = await res.json();
      alert(`✅ Import successful! Imported ${result.imported.todos} todos.`);
      onSuccess();
      onClose();
    } catch (error) {
      alert('❌ Import failed. Please check the file and try again.');
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full">
        <h2 className="text-2xl font-bold mb-4">Import Data</h2>

        {/* File Picker */}
        <div className="mb-4">
          <label className="block mb-2 text-sm font-medium">
            Select backup file
          </label>
          <input
            type="file"
            accept=".json"
            onChange={handleFileSelect}
            className="block w-full text-sm border rounded-lg p-2"
          />
        </div>

        {/* Preview or Errors */}
        {preview && (
          <div className="mb-4 p-4 border rounded-lg">
            {preview.valid ? (
              <>
                <h3 className="font-semibold mb-2">Import Preview</h3>
                <ul className="text-sm space-y-1">
                  <li>✅ {preview.preview!.todos_to_import} todos</li>
                  <li>✅ {preview.preview!.subtasks_to_import} subtasks</li>
                  <li>✅ {preview.preview!.tags_to_create} new tags</li>
                  {preview.preview!.tags_to_merge > 0 && (
                    <li>🔄 {preview.preview!.tags_to_merge} tags merged (already exist)</li>
                  )}
                  <li>✅ {preview.preview!.templates_to_import} templates</li>
                </ul>

                {preview.mergeDetails && preview.mergeDetails.mergingTags.length > 0 && (
                  <div className="mt-2 p-2 bg-yellow-50 border border-yellow-200 rounded">
                    <p className="text-xs text-yellow-800">
                      <strong>Merging tags:</strong> {preview.mergeDetails.mergingTags.join(', ')}
                    </p>
                  </div>
                )}
              </>
            ) : (
              <>
                <h3 className="font-semibold mb-2 text-red-600">Validation Errors</h3>
                <ul className="text-sm space-y-1 text-red-600">
                  {preview.errors?.map((err, i) => (
                    <li key={i}>❌ {err}</li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 border rounded-lg hover:bg-gray-50"
          >
            Cancel
          </button>
          <button
            onClick={handleImport}
            disabled={!preview?.valid || isImporting}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {isImporting ? 'Importing...' : 'Confirm Import'}
          </button>
        </div>
      </div>
    </div>
  );
}
```

## Edge Cases

### 1. Very Large Export (10,000+ todos)
- **Problem:** JSON file becomes huge (50MB+), browser hangs
- **Solution:** Implement pagination or suggest exporting date ranges
- **Test:** Export 10,000 todos, verify reasonable file size

### 2. Circular References in JSON
- **Problem:** Malformed export contains circular object references
- **Solution:** JSON.stringify automatically handles (converts to [Circular] or throws error)
- **Test:** Attempt to import file with circular reference

### 3. Import Duplicate IDs
- **Problem:** Importing same backup twice creates duplicates
- **Solution:** Always generate new IDs, never reuse imported IDs
- **Test:** Import same file twice, verify no ID conflicts

### 4. Tag Name Conflicts with Different Colors
- **Problem:** Import "Work" tag (blue) but user has "Work" tag (red)
- **Solution:** Merge by name, keep existing tag's color (user's preference preserved)
- **Test:** Import backup with conflicting tag colors

### 5. Invalid Date Formats in Import
- **Problem:** Imported due dates are "2026-25-13" (invalid)
- **Solution:** Validation rejects invalid dates, show specific error
- **Test:** Import file with malformed dates

### 6. Import During Active Session
- **Problem:** User has unsaved changes, imports backup
- **Solution:** Warn user that import adds data (doesn't replace)
- **Test:** Import while editing todo, verify no data loss

### 7. Export Empty Database
- **Problem:** New user exports with 0 todos
- **Solution:** Allow export, generate valid JSON with empty arrays
- **Test:** Export with no todos, verify valid structure

### 8. Cross-User Import
- **Problem:** User A imports User B's backup
- **Solution:** user_id field ignored during import; all data assigned to importing user
- **Test:** Export from User A, import as User B, verify ownership

## Acceptance Criteria

### Export Functionality
- [ ] Export button generates JSON file
- [ ] Filename includes date (e.g., `todos-backup-2026-02-05.json`)
- [ ] JSON includes all todos, subtasks, tags, and templates
- [ ] JSON structure is valid and parseable
- [ ] Export includes metadata (total counts, version)

### Import Functionality
- [ ] Import button opens file picker
- [ ] Only `.json` files accepted
- [ ] Validation detects malformed JSON before import
- [ ] Preview shows counts before committing
- [ ] Import creates new IDs (no conflicts)
- [ ] Import preserves all relationships (todo-subtask, todo-tag)

### ID Remapping
- [ ] Old IDs never reused
- [ ] All foreign key references updated correctly
- [ ] Tag relationships remapped correctly
- [ ] Subtasks associated with correct todos

### Tag Merge Logic
- [ ] Duplicate tags merged by name (case-insensitive)
- [ ] Existing tag colors preserved during merge
- [ ] Preview shows which tags will be merged

### Error Handling
- [ ] Validation errors shown with specific details
- [ ] Import canceled if validation fails (no partial import)
- [ ] User-friendly error messages
- [ ] No database corruption on failed import

## Testing Requirements

### Unit Tests

**File:** `lib/import-export.test.ts`

```typescript
import { validateExportData } from '@/app/api/todos/import/route';

describe('validateExportData', () => {
  test('accepts valid export structure', () => {
    const validData = {
      version: '1.0',
      exported_at: '2026-02-05T10:00:00.000Z',
      data: {
        todos: [
          {
            id: 1,
            title: 'Test Todo',
            priority: 'high',
            subtasks: [],
            tag_ids: [],
          },
        ],
        tags: [],
        templates: [],
      },
    };

    const errors = validateExportData(validData);
    expect(errors).toHaveLength(0);
  });

  test('rejects missing version', () => {
    const invalidData = {
      data: { todos: [], tags: [], templates: [] },
    };

    const errors = validateExportData(invalidData);
    expect(errors).toContain('Missing version field');
  });

  test('rejects invalid todo structure', () => {
    const invalidData = {
      version: '1.0',
      data: {
        todos: [
          { id: 1, priority: 'invalid' },  // missing title
        ],
        tags: [],
        templates: [],
      },
    };

    const errors = validateExportData(invalidData);
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('todos[0]');
  });
});
```

### E2E Tests (Playwright)

**File:** `tests/10-export-import.spec.ts`

```typescript
import { test, expect } from '@playwright/test';
import fs from 'fs/promises';
import path from 'path';

test.describe('Export & Import', () => {
  test('should export all data', async ({ page }) => {
    // Setup: Create todos with tags and subtasks
    await createTodo(page, 'Test Todo 1', 'high', ['Work']);
    await addSubtask(page, 'Test Todo 1', 'Subtask 1');

    // Export
    const downloadPromise = page.waitForEvent('download');
    await page.click('button:has-text("Export Data")');
    const download = await downloadPromise;

    // Verify filename
    expect(download.suggestedFilename()).toMatch(/todos-backup-\d{4}-\d{2}-\d{2}\.json/);

    // Verify content
    const downloadPath = await download.path();
    const content = await fs.readFile(downloadPath!, 'utf-8');
    const data = JSON.parse(content);

    expect(data.version).toBe('1.0');
    expect(data.data.todos).toHaveLength(1);
    expect(data.data.todos[0].title).toBe('Test Todo 1');
    expect(data.data.todos[0].subtasks).toHaveLength(1);
  });

  test('should import valid backup', async ({ page }) => {
    // Prepare backup file
    const backupData = {
      version: '1.0',
      exported_at: new Date().toISOString(),
      data: {
        todos: [
          {
            id: 999,
            title: 'Imported Todo',
            priority: 'medium',
            completed: 0,
            subtasks: [],
            tag_ids: [],
          },
        ],
        tags: [],
        templates: [],
      },
    };

    // Save to temp file
    const tempFile = path.join(__dirname, 'temp-backup.json');
    await fs.writeFile(tempFile, JSON.stringify(backupData));

    // Import
    await page.click('button:has-text("Import Data")');
    await page.setInputFiles('input[type="file"]', tempFile);

    // Wait for preview
    await expect(page.locator('text=Import Preview')).toBeVisible();
    await expect(page.locator('text=1 todos')).toBeVisible();

    // Confirm
    await page.click('button:has-text("Confirm Import")');

    // Verify imported todo appears
    await expect(page.locator('text=Imported Todo')).toBeVisible();

    // Cleanup
    await fs.unlink(tempFile);
  });

  test('should show validation errors for invalid JSON', async ({ page }) => {
    const invalidData = { invalid: 'structure' };
    const tempFile = path.join(__dirname, 'invalid-backup.json');
    await fs.writeFile(tempFile, JSON.stringify(invalidData));

    await page.click('button:has-text("Import Data")');
    await page.setInputFiles('input[type="file"]', tempFile);

    // Verify error shown
    await expect(page.locator('text=Validation Errors')).toBeVisible();

    // Cleanup
    await fs.unlink(tempFile);
  });

  test('should merge duplicate tags', async ({ page }) => {
    // Create existing tag
    await createTag(page, 'Work', '#3B82F6');

    // Import backup with same tag name
    const backupData = {
      version: '1.0',
      exported_at: new Date().toISOString(),
      data: {
        todos: [{
          id: 1,
          title: 'Test',
          priority: 'high',
          completed: 0,
          subtasks: [],
          tag_ids: [1],
        }],
        tags: [{ id: 1, name: 'Work', color: '#EF4444' }],  // Different color
        templates: [],
      },
    };

    const tempFile = path.join(__dirname, 'merge-backup.json');
    await fs.writeFile(tempFile, JSON.stringify(backupData));

    await page.click('button:has-text("Import Data")');
    await page.setInputFiles('input[type="file"]', tempFile);

    // Verify merge message
    await expect(page.locator('text=1 tags merged')).toBeVisible();
    await expect(page.locator('text=Merging tags: Work')).toBeVisible();

    await page.click('button:has-text("Confirm Import")');

    // Verify only one "Work" tag exists (no duplicates)
    // This would require checking tag management UI
    
    // Cleanup
    await fs.unlink(tempFile);
  });
});
```

## Out of Scope

The following features are **NOT** included in this PRP:

- ❌ Incremental backups (only full exports)
- ❌ Cloud storage integration (Google Drive, Dropbox)
- ❌ Automatic scheduled backups
- ❌ Export to CSV or other formats
- ❌ Selective export (e.g., only high-priority todos)
- ❌ Import conflict resolution UI (manual merge)
- ❌ Version control for backups

## Success Metrics

### Usage Metrics
- [ ] 60%+ of users export data at least once
- [ ] Average export file size: 50KB (indicates healthy usage)
- [ ] Import success rate: 95%+

### Data Integrity Metrics
- [ ] 0 reports of corrupted imports
- [ ] 100% of relationships preserved (todo-subtask, todo-tag)
- [ ] No duplicate IDs created during import

### Performance Metrics
- [ ] Export completes in < 2 seconds for 500 todos
- [ ] Import completes in < 3 seconds for 500 todos
- [ ] Validation completes in < 500ms

### Error Handling Metrics
- [ ] All validation errors provide actionable feedback
- [ ] 0 partial imports (all-or-nothing)
- [ ] Failed imports leave database unchanged

---

**Last Updated:** February 5, 2026  
**Version:** 1.0  
**Dependencies:** PRP-01 (Todo CRUD), PRP-05 (Subtasks), PRP-06 (Tags), PRP-07 (Templates)  
**Dependents:** None (utility feature)
