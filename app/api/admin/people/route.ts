import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET: List all people with face counts or unassigned faces
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '100');
    const search = searchParams.get('search') || '';
    const confirmed = searchParams.get('confirmed');
    const unassigned = searchParams.get('unassigned') === 'true';
    
    const offset = (page - 1) * limit;

    if (unassigned) {
      // Return unassigned faces
      const unassignedFaces = await prisma.face.findMany({
        where: {
          personId: null,
        },
        include: {
          photo: {
            include: {
              thumbnails: {
                where: {
                  size: 'SMALL',
                },
              },
            },
          },
        },
        orderBy: {
          confidence: 'desc',
        },
        take: 50, // Limit to 50 unassigned faces
      });

      const formattedFaces = unassignedFaces.map(face => ({
        id: face.id,
        boundingBox: JSON.parse(face.boundingBox),
        confidence: face.confidence,
        photo: {
          id: face.photo.id,
          filename: face.photo.filename,
          thumbnails: face.photo.thumbnails,
        },
      }));

      return NextResponse.json({
        unassignedFaces: formattedFaces,
      });
    }

    const whereClause: any = {};
    
    if (search) {
      whereClause.name = {
        contains: search,
        mode: 'insensitive',
      };
    }
    
    if (confirmed !== null) {
      whereClause.confirmed = confirmed === 'true';
    }

    const [people, totalCount] = await Promise.all([
      prisma.person.findMany({
        where: whereClause,
        include: {
          _count: {
            select: {
              faces: true,
            },
          },
          faces: {
            include: {
              photo: {
                include: {
                  thumbnails: {
                    where: {
                      size: 'SMALL',
                    },
                  },
                },
              },
            },
            orderBy: {
              confidence: 'desc',
            },
            take: 1, // Get the best face for preview
          },
        },
        orderBy: [
          { confirmed: 'desc' },
          { updatedAt: 'desc' },
        ],
        skip: offset,
        take: limit,
      }),
      prisma.person.count({ where: whereClause }),
    ]);

    const formattedPeople = people.map(person => ({
      id: person.id,
      name: person.name,
      confirmed: person.confirmed,
      faceCount: person._count.faces,
      previewFace: person.faces[0] ? {
        id: person.faces[0].id,
        boundingBox: JSON.parse(person.faces[0].boundingBox),
        confidence: person.faces[0].confidence,
        photo: {
          id: person.faces[0].photo.id,
          filename: person.faces[0].photo.filename,
          thumbnails: person.faces[0].photo.thumbnails,
        },
      } : null,
      createdAt: person.createdAt,
      updatedAt: person.updatedAt,
    }));

    return NextResponse.json({
      people: formattedPeople,
      pagination: {
        page,
        limit,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit),
        hasMore: offset + people.length < totalCount,
      },
    });
  } catch (error) {
    console.error('Error fetching people:', error);
    return NextResponse.json(
      { error: 'Failed to fetch people' },
      { status: 500 }
    );
  }
}

// POST: Create a new person (for grouping faces)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { name, faceIds } = body;

    if (!faceIds || !Array.isArray(faceIds) || faceIds.length === 0) {
      return NextResponse.json(
        { error: 'Face IDs are required' },
        { status: 400 }
      );
    }

    // Create the person
    const person = await prisma.person.create({
      data: {
        name: name || null,
        confirmed: false,
      },
    });

    // Assign faces to this person
    await prisma.face.updateMany({
      where: {
        id: { in: faceIds },
        personId: null, // Only assign unassigned faces
      },
      data: {
        personId: person.id,
      },
    });

    // Get the updated person with face count
    const updatedPerson = await prisma.person.findUnique({
      where: { id: person.id },
      include: {
        _count: {
          select: {
            faces: true,
          },
        },
      },
    });

    return NextResponse.json({
      id: updatedPerson!.id,
      name: updatedPerson!.name,
      confirmed: updatedPerson!.confirmed,
      faceCount: updatedPerson!._count.faces,
    });
  } catch (error) {
    console.error('Error creating person:', error);
    return NextResponse.json(
      { error: 'Failed to create person' },
      { status: 500 }
    );
  }
}
