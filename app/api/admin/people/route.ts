import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

function safeParseBoundingBox(value: any) {
  try {
    if (value == null) return null;
    if (typeof value === 'string') return JSON.parse(value);
    return value;
  } catch (err) {
    console.warn('Failed to parse boundingBox:', err);
    return null;
  }
}

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
      // Return paginated unassigned faces
      const unassignedPage = parseInt(searchParams.get('page') || '1');
      const unassignedLimit = parseInt(searchParams.get('limit') || '50');
      const unassignedOffset = (unassignedPage - 1) * unassignedLimit;
      const ignoredParam = searchParams.get('ignored');

      const faceWhere: any = { personId: null };
      if (ignoredParam !== null) {
        faceWhere.ignored = ignoredParam === 'true';
      }

      const [unassignedFaces, totalCount] = await Promise.all([
        prisma.face.findMany({
          where: faceWhere,
          include: {
            photo: {
              include: {
                thumbnails: { where: { size: 'SMALL' } },
              },
            },
          },
          orderBy: { confidence: 'desc' },
          skip: unassignedOffset,
          take: unassignedLimit,
        }),
        prisma.face.count({ where: faceWhere }),
      ]);

      const formattedFaces = unassignedFaces.map(face => ({
        id: face.id,
        boundingBox: safeParseBoundingBox(face.boundingBox),
        confidence: face.confidence,
        photo: {
          id: face.photo.id,
          filename: face.photo.filename,
          thumbnails: face.photo.thumbnails,
        },
      }));

      return NextResponse.json({
        unassignedFaces: formattedFaces,
        pagination: {
          page: unassignedPage,
          limit: unassignedLimit,
          total: totalCount,
          totalPages: Math.ceil(totalCount / unassignedLimit),
          hasMore: unassignedOffset + unassignedFaces.length < totalCount,
        },
      });
    }

    const whereClause: any = {};
    
    if (search) {
      // Note: some Prisma client versions in this repo/runtime don't accept the `mode` option
      // on string filters. Avoid passing `mode` to prevent server 500 (validation error).
      // This makes the search DB-default case-sensitivity. If you want case-insensitive
      // search, regenerate Prisma client / enable `mode: 'insensitive'` after confirming
      // the runtime Prisma supports it.
      whereClause.name = {
        contains: search,
      };
    }
    
    if (confirmed !== null) {
      whereClause.confirmed = confirmed === 'true';
    }

    const sort = searchParams.get('sort') || '';

    // Build orderBy depending on sort param
    const orderByClause: any[] = [];
    if (sort === 'alpha') {
      orderByClause.push({ name: 'asc' });
    } else {
      orderByClause.push({ confirmed: 'desc' });
      orderByClause.push({ updatedAt: 'desc' });
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
        orderBy: orderByClause,
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
        boundingBox: safeParseBoundingBox(person.faces[0].boundingBox),
        confidence: person.faces[0].confidence,
        photo: person.faces[0].photo ? {
          id: person.faces[0].photo.id,
          filename: person.faces[0].photo.filename,
          thumbnails: person.faces[0].photo.thumbnails,
        } : null,
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
