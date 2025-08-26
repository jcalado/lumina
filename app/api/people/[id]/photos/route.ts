import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

interface Params {
  id: string;
}

// GET: Get photos containing a specific person
export async function GET(
  request: NextRequest,
  context: { params: Promise<Params> }
) {
  try {
    const { id: personId } = await context.params;

    // Check if people page is enabled
    const peoplePageSetting = await prisma.siteSettings.findUnique({
      where: { key: 'peoplePageEnabled' },
    });

    if (!peoplePageSetting || peoplePageSetting.value !== 'true') {
      return NextResponse.json(
        { error: 'People page is disabled' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '32');
    const sortBy = searchParams.get('sortBy') || 'desc'; // 'asc' or 'desc'
    
    const offset = (page - 1) * limit;

    // For now, return empty results since we need to fix the Prisma models
    const person: any = null;
    const photos: any[] = [];
    const totalCount = 0;

    try {
      // This will work once we fix the Prisma client
      // // Get person details
      // const person = await prisma.person.findUnique({
      //   where: { 
      //     id: personId,
      //     confirmed: true, // Only show confirmed people publicly
      //     name: { not: null }, // Only show named people
      //   },
      //   include: {
      //     _count: {
      //       select: {
      //         faces: true,
      //       },
      //     },
      //   },
      // });

      // if (!person) {
      //   return NextResponse.json({ error: 'Person not found' }, { status: 404 });
      // }

      // // Get photos with this person's faces
      // const [photosWithFaces, totalPhotoCount] = await Promise.all([
      //   prisma.photo.findMany({
      //     where: {
      //       faces: {
      //         some: {
      //           personId: personId,
      //         },
      //       },
      //       album: {
      //         status: 'PUBLIC',
      //         enabled: true,
      //       },
      //     },
      //     include: {
      //       thumbnails: true,
      //       album: {
      //         select: {
      //           id: true,
      //           name: true,
      //           path: true,
      //         },
      //       },
      //       faces: {
      //         where: {
      //           personId: personId,
      //         },
      //       },
      //     },
      //     orderBy: {
      //       takenAt: sortBy === 'desc' ? 'desc' : 'asc',
      //     },
      //     skip: offset,
      //     take: limit,
      //   }),
      //   prisma.photo.count({
      //     where: {
      //       faces: {
      //         some: {
      //           personId: personId,
      //         },
      //       },
      //       album: {
      //         status: 'PUBLIC',
      //         enabled: true,
      //       },
      //     },
      //   }),
      // ]);
    } catch (error) {
      console.log('Person photos query not available yet');
    }

    if (!person) {
      return NextResponse.json({ error: 'Person not found' }, { status: 404 });
    }

    return NextResponse.json({
      person: {
        id: person.id,
        name: person.name,
        totalFaces: person._count.faces,
      },
      photos: photos.map((photo: any) => ({
        ...photo,
        faces: photo.faces.map((face: any) => ({
          id: face.id,
          boundingBox: JSON.parse(face.boundingBox),
          confidence: face.confidence,
        })),
      })),
      pagination: {
        page,
        limit,
        total: totalCount,
        totalPages: Math.ceil(totalCount / limit),
        hasMore: offset + photos.length < totalCount,
      },
    });
  } catch (error) {
    console.error('Error fetching person photos:', error);
    return NextResponse.json(
      { error: 'Failed to fetch person photos' },
      { status: 500 }
    );
  }
}
