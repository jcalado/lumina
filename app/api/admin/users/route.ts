import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, requireSuperAdmin } from '@/lib/admin-auth'
import { prisma } from '@/lib/prisma'
import bcrypt from 'bcryptjs'
import { z } from 'zod'

const createAdminUserSchema = z.object({
  email: z.string().email('Invalid email address'),
  name: z.string().min(1, 'Name is required').max(100, 'Name too long'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: z.enum(['ADMIN', 'SUPERADMIN', 'MEMBER']),
  enabled: z.boolean().default(true),
})

const updateAdminUserSchema = z.object({
  email: z.string().email('Invalid email address').optional(),
  name: z.string().min(1, 'Name is required').max(100, 'Name too long').optional(),
  password: z.string().min(8, 'Password must be at least 8 characters').optional(),
  role: z.enum(['ADMIN', 'SUPERADMIN', 'MEMBER']).optional(),
  enabled: z.boolean().optional(),
})

export async function GET(request: NextRequest) {
  const session = await requireAdmin()
  if (session instanceof NextResponse) return session

  try {
    const adminUsers = await prisma.adminUser.findMany({
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
      orderBy: [
        { role: 'asc' }, // SUPERADMIN first, then ADMIN
        { createdAt: 'desc' },
      ],
    })

    return NextResponse.json(adminUsers)
  } catch (error) {
    console.error('Error fetching admin users:', error)
    return NextResponse.json(
      { error: 'Failed to fetch admin users' },
      { status: 500 }
    )
  }
}

export async function POST(request: NextRequest) {
  const session = await requireAdmin()
  if (session instanceof NextResponse) return session

  try {
    const body = await request.json()
    const validatedData = createAdminUserSchema.parse(body)

    // Check if user creating a SUPERADMIN is also a SUPERADMIN
    if (validatedData.role === 'SUPERADMIN' && session.user.role !== 'superadmin') {
      return NextResponse.json(
        { error: 'Only superadmins can create superadmin users' },
        { status: 403 }
      )
    }

    // Check if email already exists
    const existingUser = await prisma.adminUser.findUnique({
      where: { email: validatedData.email },
    })

    if (existingUser) {
      return NextResponse.json(
        { error: 'An admin user with this email already exists' },
        { status: 400 }
      )
    }

    // Hash password
    const hashedPassword = await bcrypt.hash(validatedData.password, 12)

    // Create admin user
    const adminUser = await prisma.adminUser.create({
      data: {
        email: validatedData.email,
        name: validatedData.name,
        password: hashedPassword,
        role: validatedData.role,
        enabled: validatedData.enabled,
        createdBy: session.user.id,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        enabled: true,
        createdAt: true,
        creator: {
          select: {
            name: true,
            email: true,
          },
        },
      },
    })

    return NextResponse.json(adminUser, { status: 201 })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Validation error', details: error.errors },
        { status: 400 }
      )
    }

    console.error('Error creating admin user:', error)
    return NextResponse.json(
      { error: 'Failed to create admin user' },
      { status: 500 }
    )
  }
}
