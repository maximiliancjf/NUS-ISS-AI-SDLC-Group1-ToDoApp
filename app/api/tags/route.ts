import { NextResponse } from 'next/server';
import { createTag, getTagsByUserId, getOrCreateUser } from '@/lib/db';

export async function GET() {
  try {
    const user = getOrCreateUser();
    const tags = getTagsByUserId(user.id);
    return NextResponse.json(tags);
  } catch (error) {
    console.error('Error fetching tags:', error);
    return NextResponse.json({ error: 'Failed to fetch tags' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const { name, color } = await request.json();

    if (!name) {
      return NextResponse.json({ error: 'Tag name is required' }, { status: 400 });
    }

    const user = getOrCreateUser();
    const tag = createTag(user.id, name, color);
    
    return NextResponse.json(tag, { status: 201 });
  } catch (error: any) {
    if (error.message?.includes('UNIQUE constraint')) {
      return NextResponse.json({ error: 'Tag name already exists' }, { status: 409 });
    }
    console.error('Error creating tag:', error);
    return NextResponse.json({ error: 'Failed to create tag' }, { status: 500 });
  }
}
