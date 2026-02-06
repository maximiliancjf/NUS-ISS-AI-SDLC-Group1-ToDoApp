import { NextResponse } from 'next/server';
import { addTagToTodo, removeTagFromTodo, getTodoById } from '@/lib/db';

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { tag_id } = await request.json();

    if (!tag_id) {
      return NextResponse.json({ error: 'Tag ID is required' }, { status: 400 });
    }

    const todo = getTodoById(parseInt(id));
    if (!todo) {
      return NextResponse.json({ error: 'Todo not found' }, { status: 404 });
    }

    addTagToTodo(parseInt(id), tag_id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error adding tag to todo:', error);
    return NextResponse.json({ error: 'Failed to add tag' }, { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const url = new URL(request.url);
    const tagId = url.searchParams.get('tagId');
    
    if (!tagId) {
      return NextResponse.json({ error: 'Tag ID is required' }, { status: 400 });
    }

    removeTagFromTodo(parseInt(id), parseInt(tagId));
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error removing tag from todo:', error);
    return NextResponse.json({ error: 'Failed to remove tag' }, { status: 500 });
  }
}
