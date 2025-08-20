import { prisma } from "@/lib/prisma"

export interface SiteSettings {
  siteName: string
  footerCopyright: string
  footerLinks: string // JSON string of links array
}

const defaultSettings: SiteSettings = {
  siteName: "Lumina Gallery",
  footerCopyright: `© ${new Date().getFullYear()} Lumina Gallery. All rights reserved.`,
  footerLinks: JSON.stringify([
    { name: "Privacy Policy", url: "/privacy" },
    { name: "Terms of Service", url: "/terms" },
    { name: "Contact", url: "/contact" }
  ])
}

// Cache for settings to avoid frequent DB calls
let settingsCache: SiteSettings | null = null
let cacheExpiry = 0
const CACHE_TTL = 5 * 60 * 1000 // 5 minutes

export async function getSiteSettings(): Promise<SiteSettings> {
  // Check cache first
  if (settingsCache && Date.now() < cacheExpiry) {
    return settingsCache
  }

  try {
    const settings = await prisma.siteSettings.findMany()
    
    const settingsObj = settings.reduce((acc: Record<string, string>, setting: any) => {
      acc[setting.key] = setting.value
      return acc
    }, {} as Record<string, string>)

    const result = {
      ...defaultSettings,
      ...settingsObj
    }

    // Update cache
    settingsCache = result
    cacheExpiry = Date.now() + CACHE_TTL

    return result
  } catch (error) {
    console.error("Error fetching site settings:", error)
    return defaultSettings
  }
}

export function clearSettingsCache() {
  settingsCache = null
  cacheExpiry = 0
}
