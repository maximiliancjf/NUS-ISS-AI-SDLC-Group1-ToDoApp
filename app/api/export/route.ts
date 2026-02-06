import { NextResponse } from 'next/server';
import { getOrCreateUser, getAllTodosWithTags, getTagsByUserId } from '@/lib/db';

export async function GET() {
  try {
    const user = getOrCreateUser();
    const todos = getAllTodosWithTags(user.id);
    const tags = getTagsByUserId(user.id);

    const exportData = {
      version: '1.0',
      exportDate: new Date().toISOString(),
      user: { username: user.username },
      todos,
      tags,
    };

    return NextResponse.json(exportData, {
      headers: {
        'Content-Disposition': `attachment; filename="todos-backup-${new Date().toISOString().split('T')[0]}.json"`,
      },
    });
  } catch (error) {
    console.error('Error exporting data:', error);
    return NextResponse.json({ error: 'Failed to export data' }, { status: 500 });
  }
}
