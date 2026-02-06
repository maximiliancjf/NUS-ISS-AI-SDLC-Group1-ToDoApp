import { NextRequest, NextResponse } from 'next/server';
import { deleteTemplate, instantiateTemplate } from '@/lib/db';

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const templateId = parseInt(id);
    if (isNaN(templateId)) {
      return NextResponse.json({ error: 'Invalid template ID' }, { status: 400 });
    }

    deleteTemplate(templateId);
    return NextResponse.json({ message: 'Template deleted successfully' });
  } catch (error) {
    console.error('Error deleting template:', error);
    return NextResponse.json({ error: 'Failed to delete template' }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const templateId = parseInt(id);
    if (isNaN(templateId)) {
      return NextResponse.json({ error: 'Invalid template ID' }, { status: 400 });
    }

    const body = await request.json();
    const { dueDate } = body;

    if (!dueDate) {
      return NextResponse.json({ error: 'Due date is required' }, { status: 400 });
    }

    const userId = 1; // Default user
    const todoId = instantiateTemplate(templateId, userId, dueDate);

    return NextResponse.json({ id: todoId, message: 'Todo created from template' });
  } catch (error) {
    console.error('Error instantiating template:', error);
    return NextResponse.json({ error: 'Failed to create todo from template' }, { status: 500 });
  }
}
