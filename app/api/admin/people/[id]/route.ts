import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

interface Params {
  id: string;
}

// GET: Get person details with faces
export async function GET(
  request: NextRequest,
  context: { params: Promise<Params> }
) {
  try {
    const { id: personId } = await context.params;

    const person = await prisma.person.findUnique({
      where: { id: personId },
      include: {
        faces: {
          include: {
            photo: {
              include: {
                thumbnails: true,
                album: {
                  select: {
                    id: true,
                    name: true,
                    path: true,
                  },
                },
              },
            },
          },
          orderBy: {
            confidence: 'desc',
          },
        },
        _count: {
          select: {
            faces: true,
          },
        },
      },
    });

    if (!person) {
      return NextResponse.json({ error: 'Person not found' }, { status: 404 });
    }

    // Map faces to parse boundingBox and ensure correct structure
    const faces = person.faces.map(face => ({
      ...face,
      boundingBox: JSON.parse(face.boundingBox),
      photo: {
        ...face.photo,
        albumId: face.photo.album.id, // Include albumId directly in photo
        albumSlug: face.photo.album.path, // Include albumSlug directly in photo
      },
    }));

    return NextResponse.json({
      person: {
        id: person.id,
        name: person.name,
        confirmed: person.confirmed,
        faceCount: person._count.faces,
        createdAt: person.createdAt,
        updatedAt: person.updatedAt,
        faces: faces, // Directly return the faces array
      },
    });
  } catch (error) {
    console.error('Error fetching person:', error);
    return NextResponse.json(
      { error: 'Failed to fetch person' },
      { status: 500 }
    );
  }
}

// PATCH: Update person (name, confirmed status)
export async function PATCH(
  request: NextRequest,
  context: { params: Promise<Params> }
) {
  try {
    const { id: personId } = await context.params;
    const body = await request.json();
    const { name, confirmed } = body;

    const person = await prisma.person.update({
      where: { id: personId },
      data: {
        ...(name !== undefined && { name }),
        ...(confirmed !== undefined && { confirmed }),
      },
    });

    return NextResponse.json({
      id: person.id,
      name: person.name,
      confirmed: person.confirmed,
    });
  } catch (error) {
    console.error('Error updating person:', error);
    return NextResponse.json(
      { error: 'Failed to update person' },
      { status: 500 }
    );
  }
}

// DELETE: Delete person and reassign faces
export async function DELETE(
  request: NextRequest,
  context: { params: Promise<Params> }
) {
  try {
    const { id: personId } = await context.params;

    // Fetch person and count faces via Prisma to avoid quoting issues
    const person = await prisma.person.findUnique({
      where: { id: personId },
      select: { id: true, name: true },
    });

    if (!person) {
      return NextResponse.json(
        { error: 'Person not found' },
        { status: 404 }
      );
    }

    const faceCount = await prisma.face.count({ where: { personId } });

    // Remove person association from faces (don't delete faces)
    await prisma.face.updateMany({ where: { personId }, data: { personId: null } });

    // Delete the person
    await prisma.person.delete({ where: { id: personId } });

    return NextResponse.json({ 
      success: true,
      message: `Deleted person "${person.name}" and unassigned ${faceCount} faces`,
      unassignedFaces: faceCount,
    });
  } catch (error) {
    console.error('Error deleting person:', error);
    return NextResponse.json(
      { error: 'Failed to delete person' },
      { status: 500 }
    );
  }
}
