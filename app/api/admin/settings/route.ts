import { NextRequest, NextResponse } from "next/server"
import { requireAdmin } from "@/lib/admin-auth"
import { prisma } from "@/lib/prisma"
import { z } from "zod"

const updateSettingsSchema = z.object({
  siteName: z.string().min(1).max(100),
  footerCopyright: z.string().max(500).optional(),
  footerLinks: z.array(z.object({
    name: z.string().min(1).max(100),
    url: z.string().min(1).max(500)
  })).optional(),
  accentColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  photosPerPage: z.string().regex(/^\d+$/).optional(),
  batchProcessingSize: z.string().regex(/^[1-9]\d*$/).optional()
})

// GET /api/admin/settings - Get all settings
export async function GET() {
  try {
    const settings = await prisma.siteSettings.findMany()
    
    // Convert to key-value object
    const settingsObj = settings.reduce((acc: Record<string, string>, setting: any) => {
      acc[setting.key] = setting.value
      return acc
    }, {} as Record<string, string>)

    // Provide defaults if not set
    const defaultSettings = {
      siteName: "Lumina Gallery",
      footerCopyright: `© ${new Date().getFullYear()} Lumina Gallery. All rights reserved.`,
      footerLinks: JSON.stringify([
        { name: "Privacy Policy", url: "/privacy" },
        { name: "Terms of Service", url: "/terms" },
        { name: "Contact", url: "/contact" }
      ]),
      accentColor: "#3b82f6",
      photosPerPage: "32",
      batchProcessingSize: "4",
      ...settingsObj
    }

    return NextResponse.json({ settings: defaultSettings })
  } catch (error) {
    console.error("Error fetching settings:", error)
    return NextResponse.json(
      { error: "Failed to fetch settings" },
      { status: 500 }
    )
  }
}

// PUT /api/admin/settings - Update settings
export async function PUT(request: NextRequest) {
  const authResult = await requireAdmin()
  if (authResult instanceof NextResponse) {
    return authResult
  }

  try {
    const body = await request.json()
    const validatedData = updateSettingsSchema.parse(body)

    // Update or create site name setting
    await prisma.siteSettings.upsert({
      where: { key: "siteName" },
      update: { 
        value: validatedData.siteName,
        updatedAt: new Date()
      },
      create: { 
        key: "siteName", 
        value: validatedData.siteName 
      }
    })

    // Update footer copyright if provided
    if (validatedData.footerCopyright !== undefined) {
      await prisma.siteSettings.upsert({
        where: { key: "footerCopyright" },
        update: { 
          value: validatedData.footerCopyright,
          updatedAt: new Date()
        },
        create: { 
          key: "footerCopyright", 
          value: validatedData.footerCopyright 
        }
      })
    }

    // Update footer links if provided
    if (validatedData.footerLinks !== undefined) {
      await prisma.siteSettings.upsert({
        where: { key: "footerLinks" },
        update: { 
          value: JSON.stringify(validatedData.footerLinks),
          updatedAt: new Date()
        },
        create: { 
          key: "footerLinks", 
          value: JSON.stringify(validatedData.footerLinks)
        }
      })
    }

    // Update accent color if provided
    if (validatedData.accentColor !== undefined) {
      await prisma.siteSettings.upsert({
        where: { key: "accentColor" },
        update: { 
          value: validatedData.accentColor,
          updatedAt: new Date()
        },
        create: { 
          key: "accentColor", 
          value: validatedData.accentColor
        }
      })
    }

    // Update photos per page if provided
    if (validatedData.photosPerPage !== undefined) {
      await prisma.siteSettings.upsert({
        where: { key: "photosPerPage" },
        update: { 
          value: validatedData.photosPerPage,
          updatedAt: new Date()
        },
        create: { 
          key: "photosPerPage", 
          value: validatedData.photosPerPage
        }
      })
    }

    // Update batch processing size if provided
    if (validatedData.batchProcessingSize !== undefined) {
      await prisma.siteSettings.upsert({
        where: { key: "batchProcessingSize" },
        update: { 
          value: validatedData.batchProcessingSize,
          updatedAt: new Date()
        },
        create: { 
          key: "batchProcessingSize", 
          value: validatedData.batchProcessingSize
        }
      })
    }

    // Return updated settings
    const settings = await prisma.siteSettings.findMany()
    const settingsObj = settings.reduce((acc: Record<string, string>, setting: any) => {
      acc[setting.key] = setting.value
      return acc
    }, {} as Record<string, string>)

    return NextResponse.json({ 
      success: true, 
      settings: settingsObj 
    })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid data", details: error.errors },
        { status: 400 }
      )
    }

    console.error("Error updating settings:", error)
    return NextResponse.json(
      { error: "Failed to update settings" },
      { status: 500 }
    )
  }
}
