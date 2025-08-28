import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * API endpoint to manage sync jobs
 */
export async function DELETE(request: NextRequest) {
  try {
    // Get count of jobs before deletion for logging
    const jobsBefore = await prisma.syncJob.count({
      where: {
        status: {
          in: ['COMPLETED', 'FAILED', 'CANCELLED']
        }
      }
    });

    if (jobsBefore === 0) {
      return NextResponse.json({
        message: 'No completed sync jobs to delete',
        deletedCount: 0
      });
    }

    // Delete all completed sync jobs (keep running ones)
    const deleteResult = await prisma.syncJob.deleteMany({
      where: {
        status: {
          in: ['COMPLETED', 'FAILED', 'CANCELLED']
        }
      }
    });

    console.log(`Deleted ${deleteResult.count} sync jobs from database`);

    return NextResponse.json({
      message: `Successfully deleted ${deleteResult.count} completed sync jobs`,
      deletedCount: deleteResult.count
    });
  } catch (error) {
    console.error('Error deleting sync jobs:', error);
    return NextResponse.json(
      { error: 'Failed to delete sync jobs' },
      { status: 500 }
    );
  }
}
