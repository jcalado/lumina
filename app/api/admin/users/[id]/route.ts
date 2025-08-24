import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, requireSuperAdmin } from '@/lib/admin-auth'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { z } from 'zod'

const updateAdminUserSchema = z.object({
  email: z.string().email('Invalid email address').optional(),
  name: z.string().min(1, 'Name is required').max(100, 'Name too long').optional(),
  password: z.string().min(8, 'Password must be at least 8 characters').optional(),
  role: z.enum(['ADMIN', 'SUPERADMIN']).optional(),
  enabled: z.boolean().optional(),
})

interface RouteParams {
  params: Promise<{
    id: string
  }>
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const session = await requireAdmin()
  if (session instanceof NextResponse) return session

  const { id } = await params

  try {
    const adminUser = await prisma.adminUser.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        enabled: true,
        lastLogin: true,
        createdAt: true,
        updatedAt: true,
        createdBy: true,
        creator: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    })

    if (!adminUser) {
      return NextResponse.json(
        { error: 'Admin user not found' },
        { status: 404 }
      )
    }

    return NextResponse.json(adminUser)
  } catch (error) {
    console.error('Error fetching admin user:', error)
    return NextResponse.json(
      { error: 'Failed to fetch admin user' },
      { status: 500 }
    )
  }
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  const session = await requireAdmin()
  if (session instanceof NextResponse) return session

  const { id } = await params

  try {
    const body = await request.json()
    const validatedData = updateAdminUserSchema.parse(body)

    // Get the existing user to check permissions
    const existingUser = await prisma.adminUser.findUnique({
      where: { id },
    })

    if (!existingUser) {
      return NextResponse.json(
        { error: 'Admin user not found' },
        { status: 404 }
      )
    }

    // Check permissions for modifying superadmins
    if (existingUser.role === 'SUPERADMIN' && session.user.role !== 'superadmin') {
      return NextResponse.json(
        { error: 'Only superadmins can modify superadmin users' },
        { status: 403 }
      )
    }

    // Check permissions for creating superadmins
    if (validatedData.role === 'SUPERADMIN' && session.user.role !== 'superadmin') {
      return NextResponse.json(
        { error: 'Only superadmins can promote users to superadmin' },
        { status: 403 }
      )
    }

    // Prevent users from disabling themselves
    if (id === session.user.id && validatedData.enabled === false) {
      return NextResponse.json(
        { error: 'You cannot disable your own account' },
        { status: 400 }
      )
    }

    // Prepare update data
    const updateData: any = {}
    
    if (validatedData.email) {
      // Check if email is already taken by another user
      const emailExists = await prisma.adminUser.findFirst({
        where: {
          email: validatedData.email,
          id: { not: id },
        },
      })
      
      if (emailExists) {
        return NextResponse.json(
          { error: 'An admin user with this email already exists' },
          { status: 400 }
        )
      }
      
      updateData.email = validatedData.email
    }

    if (validatedData.name !== undefined) {
      updateData.name = validatedData.name
    }

    if (validatedData.password) {
      updateData.password = await bcrypt.hash(validatedData.password, 12)
    }

    if (validatedData.role !== undefined) {
      updateData.role = validatedData.role
    }

    if (validatedData.enabled !== undefined) {
      updateData.enabled = validatedData.enabled
    }

    // Update the user
    const updatedUser = await prisma.adminUser.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        enabled: true,
        lastLogin: true,
        createdAt: true,
        updatedAt: true,
        creator: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    })

    return NextResponse.json(updatedUser)
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      )
    }

    console.error('Error updating admin user:', error)
    return NextResponse.json(
      { error: 'Failed to update admin user' },
      { status: 500 }
    )
  }
}

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  const session = await requireAdmin()
  if (session instanceof NextResponse) return session

  const { id } = await params

  try {
    // Get the existing user to check permissions
    const existingUser = await prisma.adminUser.findUnique({
      where: { id },
    })

    if (!existingUser) {
      return NextResponse.json(
        { error: 'Admin user not found' },
        { status: 404 }
      )
    }

    // Check permissions for deleting superadmins
    if (existingUser.role === 'SUPERADMIN' && session.user.role !== 'superadmin') {
      return NextResponse.json(
        { error: 'Only superadmins can delete superadmin users' },
        { status: 403 }
      )
    }

    // Prevent users from deleting themselves
    if (id === session.user.id) {
      return NextResponse.json(
        { error: 'You cannot delete your own account' },
        { status: 400 }
      )
    }

    // Check if this is the last superadmin
    if (existingUser.role === 'SUPERADMIN') {
      const superadminCount = await prisma.adminUser.count({
        where: {
          role: 'SUPERADMIN',
          enabled: true,
        },
      })

      if (superadminCount <= 1) {
        return NextResponse.json(
          { error: 'Cannot delete the last superadmin user' },
          { status: 400 }
        )
      }
    }

    // Delete the user
    await prisma.adminUser.delete({
      where: { id },
    })

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error deleting admin user:', error)
    return NextResponse.json(
      { error: 'Failed to delete admin user' },
      { status: 500 }
    )
  }
}
