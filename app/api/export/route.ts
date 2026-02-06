import { NextResponse } from 'next/server';
import { getAllTodosWithTags, getTagsByUserId } from '@/lib/db';
import { getSession } from '@/lib/auth';

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    
    const todos = getAllTodosWithTags(session.userId);
    const tags = getTagsByUserId(session.userId);

    const exportData = {
      version: '1.0',
      exportDate: new Date().toISOString(),
      user: { username: session.username },
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
