import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

// GET: List people (public view)
export async function GET(request: NextRequest) {
  try {
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
    const limit = parseInt(searchParams.get('limit') || '20');
    const search = searchParams.get('search') || '';
    
    const offset = (page - 1) * limit;

    // For now, return empty results since we need to fix the Prisma models
    const people: any[] = [];
    const totalCount = 0;

    try {
      // This will work once we fix the Prisma client
      // const whereClause: any = {
      //   confirmed: true, // Only show confirmed people publicly
      //   name: { not: null }, // Only show named people
      // };
      
      // if (search) {
      //   whereClause.name = {
      //     contains: search,
      //     mode: 'insensitive',
      //   };
      // }

      // const [people, totalCount] = await Promise.all([
      //   prisma.person.findMany({
      //     where: whereClause,
      //     include: {
      //       _count: {
      //         select: {
      //           faces: true,
      //         },
      //       },
      //       faces: {
      //         include: {
      //           photo: {
      //             include: {
      //               thumbnails: {
      //                 where: {
      //                   size: 'SMALL',
      //                 },
      //               },
      //               album: {
      //                 select: {
      //                   status: true,
      //                   enabled: true,
      //                 },
      //               },
      //             },
      //           },
      //         },
      //         where: {
      //           photo: {
      //             album: {
      //               status: 'PUBLIC',
      //               enabled: true,
      //             },
      //           },
      //         },
      //         orderBy: {
      //           confidence: 'desc',
      //         },
      //         take: 1, // Get the best face for preview
      //       },
      //     },
      //     orderBy: [
      //       { updatedAt: 'desc' },
      //     ],
      //     skip: offset,
      //     take: limit,
      //   }),
      //   prisma.person.count({ where: whereClause }),
      // ]);
    } catch (error) {
      console.log('Person query not available yet');
    }

    const formattedPeople = people.map((person: any) => ({
      id: person.id,
      name: person.name,
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
