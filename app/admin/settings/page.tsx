"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Separator } from "@/components/ui/separator"
import { Save, Globe, Palette, FileText, Gauge, Plus, Trash2 } from "lucide-react"
import { toast } from "@/hooks/use-toast"
import { LiveAccentPreview } from "@/components/LiveAccentPreview"
import { cn } from "@/lib/utils"
import { useTranslations } from "next-intl"

interface FooterLink {
  name: string
  url: string
}

interface SiteSettings {
  siteName: string
  footerCopyright: string
  footerLinks: FooterLink[]
  accentColor: string
  photosPerPage: string
  batchProcessingSize: string
}

interface SystemInfo {
  maxBatchProcessingSize: number
}

export default function AdminSettingsPage() {
  const t = useTranslations("adminSettings")
  const [activeSection, setActiveSection] = useState("general")
  const [settings, setSettings] = useState<SiteSettings>({
    siteName: "Lumina Gallery",
    footerCopyright: `© ${new Date().getFullYear()} Lumina Gallery. All rights reserved.`,
    footerLinks: [],
    accentColor: "#3b82f6",
    photosPerPage: "32",
    batchProcessingSize: "4"
  })
  const [systemInfo, setSystemInfo] = useState<SystemInfo>({
    maxBatchProcessingSize: 4
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const sidebarItems = [
    { id: "general", label: t("general"), icon: Globe },
    { id: "appearance", label: t("appearance"), icon: Palette },
    { id: "footer", label: t("footer"), icon: FileText },
    { id: "performance", label: t("performance"), icon: Gauge },
  ]

  useEffect(() => {
    fetchSettings()
  }, [])

  const fetchSettings = async () => {
    try {
      const response = await fetch("/api/admin/settings")
      if (response.ok) {
        const data = await response.json()
        const fetchedSettings = data.settings
        const fetchedSystemInfo = data.systemInfo

        let footerLinks: FooterLink[] = []
        try {
          if (fetchedSettings.footerLinks) {
            footerLinks = JSON.parse(fetchedSettings.footerLinks)
          }
        } catch (error) {
          console.error('Error parsing footer links:', error)
        }

        setSettings({
          siteName: fetchedSettings.siteName || "Lumina Gallery",
          footerCopyright: fetchedSettings.footerCopyright || `© ${new Date().getFullYear()} Lumina Gallery. All rights reserved.`,
          footerLinks: footerLinks,
          accentColor: fetchedSettings.accentColor || "#3b82f6",
          photosPerPage: fetchedSettings.photosPerPage || "32",
          batchProcessingSize: fetchedSettings.batchProcessingSize || "4"
        })

        setSystemInfo({
          maxBatchProcessingSize: fetchedSystemInfo?.maxBatchProcessingSize || 4
        })
      } else {
        toast({ title: t("toastError"), description: t("toastFetchFailed"), variant: "destructive" })
      }
    } catch {
      toast({ title: t("toastError"), description: t("toastFetchFailed"), variant: "destructive" })
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)

    try {
      const response = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(settings)
      })

      if (response.ok) {
        toast({ title: t("toastSuccess"), description: t("toastSettingsSaved") })
        window.location.reload()
      } else {
        const data = await response.json()
        throw new Error(data.error || "Failed to save settings")
      }
    } catch (error) {
      toast({
        title: t("toastError"),
        description: error instanceof Error ? error.message : t("toastSaveFailed"),
        variant: "destructive"
      })
    } finally {
      setSaving(false)
    }
  }

  const handleInputChange = (field: keyof SiteSettings, value: string | FooterLink[]) => {
    setSettings(prev => ({ ...prev, [field]: value }))
  }

  const addFooterLink = () => {
    setSettings(prev => ({
      ...prev,
      footerLinks: [...prev.footerLinks, { name: "", url: "" }]
    }))
  }

  const removeFooterLink = (index: number) => {
    setSettings(prev => ({
      ...prev,
      footerLinks: prev.footerLinks.filter((_, i) => i !== index)
    }))
  }

  const updateFooterLink = (index: number, field: keyof FooterLink, value: string) => {
    setSettings(prev => ({
      ...prev,
      footerLinks: prev.footerLinks.map((link, i) =>
        i === index ? { ...link, [field]: value } : link
      )
    }))
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <Card className="animate-pulse">
          <CardHeader>
            <div className="h-6 bg-muted rounded w-1/3" />
            <div className="h-4 bg-muted rounded w-1/2" />
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="h-4 bg-muted rounded w-1/4" />
              <div className="h-10 bg-muted rounded" />
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <LiveAccentPreview accentColor={settings.accentColor} />

      <div>
        <h1 className="text-2xl font-semibold">{t("title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("description")}</p>
      </div>

      <div className="flex flex-col md:flex-row gap-6">
        {/* Settings sidebar nav */}
        <nav className="md:w-56 flex-shrink-0">
          <div className="flex md:flex-col gap-1">
            {sidebarItems.map((item) => {
              const Icon = item.icon
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveSection(item.id)}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors text-left w-full",
                    activeSection === item.id
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                  )}
                >
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  {item.label}
                </button>
              )
            })}
          </div>
        </nav>

        {/* Content area */}
        <div className="flex-1 min-w-0 max-w-2xl">
          {activeSection === "general" && (
            <GeneralSection
              settings={settings}
              onInputChange={handleInputChange}
            />
          )}
          {activeSection === "appearance" && (
            <AppearanceSection
              settings={settings}
              onInputChange={handleInputChange}
            />
          )}
          {activeSection === "footer" && (
            <FooterSection
              settings={settings}
              onInputChange={handleInputChange}
              onAddLink={addFooterLink}
              onRemoveLink={removeFooterLink}
              onUpdateLink={updateFooterLink}
            />
          )}
          {activeSection === "performance" && (
            <PerformanceSection
              settings={settings}
              systemInfo={systemInfo}
              onInputChange={handleInputChange}
            />
          )}

          <Separator className="my-6" />

          <div className="flex justify-end">
            <Button onClick={handleSave} disabled={saving}>
              <Save className="h-4 w-4" />
              {saving ? t("saving") : t("saveSettings")}
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}

function GeneralSection({
  settings,
  onInputChange,
}: {
  settings: SiteSettings
  onInputChange: (field: keyof SiteSettings, value: string | FooterLink[]) => void
}) {
  const t = useTranslations("adminSettings")
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">{t("general")}</h2>
        <p className="text-sm text-muted-foreground">{t("generalDescription")}</p>
      </div>

      <Card>
        <CardContent className="p-6 space-y-4">
          <div className="space-y-2">
            <Label htmlFor="siteName">{t("siteName")}</Label>
            <Input
              id="siteName"
              value={settings.siteName}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                onInputChange("siteName", e.target.value)
              }
              placeholder={t("siteNamePlaceholder")}
              maxLength={100}
            />
            <p className="text-xs text-muted-foreground">
              {t("siteNameHelp")}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function AppearanceSection({
  settings,
  onInputChange,
}: {
  settings: SiteSettings
  onInputChange: (field: keyof SiteSettings, value: string | FooterLink[]) => void
}) {
  const t = useTranslations("adminSettings")
  const presetColors = [
    "#3b82f6", "#ef4444", "#10b981", "#f59e0b",
    "#8b5cf6", "#ec4899", "#06b6d4", "#84cc16",
  ]

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">{t("appearance")}</h2>
        <p className="text-sm text-muted-foreground">{t("appearanceDescription")}</p>
      </div>

      <Card>
        <CardContent className="p-6 space-y-6">
          <div className="space-y-3">
            <Label htmlFor="accentColor">{t("accentColor")}</Label>
            <div className="flex items-center gap-3">
              <input
                id="accentColor"
                type="color"
                value={settings.accentColor}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  onInputChange("accentColor", e.target.value)
                }
                className="w-12 h-10 rounded border border-input bg-background cursor-pointer"
              />
              <Input
                value={settings.accentColor}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                  onInputChange("accentColor", e.target.value)
                }
                placeholder="#3b82f6"
                pattern="^#[0-9A-Fa-f]{6}$"
                maxLength={7}
                className="font-mono w-28"
              />
            </div>
            <div className="flex gap-2">
              {presetColors.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={cn(
                    "w-8 h-8 rounded-md border-2 shadow-sm hover:scale-110 transition-transform",
                    settings.accentColor === color
                      ? "border-foreground ring-2 ring-ring ring-offset-2 ring-offset-background"
                      : "border-transparent"
                  )}
                  style={{ backgroundColor: color }}
                  onClick={() => onInputChange("accentColor", color)}
                  title={color}
                />
              ))}
            </div>
            <p className="text-xs text-muted-foreground">
              {t("accentColorHelp")}
            </p>
          </div>

          <Separator />

          {/* Live Preview */}
          <div className="space-y-3">
            <Label>{t("preview")}</Label>
            <div className="rounded-lg border bg-muted/30 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-lg font-bold" style={{ color: settings.accentColor }}>
                  {settings.siteName}
                </span>
                <nav className="flex items-center gap-4 text-sm text-muted-foreground">
                  <span>Albums</span>
                  <span>Favorites</span>
                </nav>
              </div>
              <div className="flex gap-2">
                <button
                  className="px-4 py-1.5 rounded-md text-white text-sm font-medium"
                  style={{ backgroundColor: settings.accentColor }}
                >
                  {t("primaryButton")}
                </button>
                <button
                  className="px-4 py-1.5 rounded-md border text-sm font-medium"
                  style={{ borderColor: settings.accentColor, color: settings.accentColor }}
                >
                  {t("outlineButton")}
                </button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              {t("previewHelp")}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function FooterSection({
  settings,
  onInputChange,
  onAddLink,
  onRemoveLink,
  onUpdateLink,
}: {
  settings: SiteSettings
  onInputChange: (field: keyof SiteSettings, value: string | FooterLink[]) => void
  onAddLink: () => void
  onRemoveLink: (index: number) => void
  onUpdateLink: (index: number, field: keyof FooterLink, value: string) => void
}) {
  const t = useTranslations("adminSettings")
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">{t("footer")}</h2>
        <p className="text-sm text-muted-foreground">{t("footerDescription")}</p>
      </div>

      <Card>
        <CardContent className="p-6 space-y-6">
          <div className="space-y-2">
            <Label htmlFor="footerCopyright">{t("footerCopyright")}</Label>
            <Textarea
              id="footerCopyright"
              value={settings.footerCopyright}
              onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) =>
                onInputChange("footerCopyright", e.target.value)
              }
              placeholder={t("copyrightPlaceholder")}
              maxLength={500}
              rows={2}
            />
            <p className="text-xs text-muted-foreground">
              {t("copyrightHelp")}
            </p>
          </div>

          <Separator />

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label>{t("footerLinks")}</Label>
              <Button type="button" variant="outline" size="sm" onClick={onAddLink}>
                <Plus className="h-4 w-4" />
                {t("addLink")}
              </Button>
            </div>

            {settings.footerLinks.length > 0 ? (
              <div className="rounded-lg border overflow-hidden">
                <div className="grid grid-cols-[1fr_1fr_40px] gap-0 bg-muted/50 px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
                  <span>{t("columnName")}</span>
                  <span>{t("columnUrl")}</span>
                  <span />
                </div>
                {settings.footerLinks.map((link, index) => (
                  <div key={index} className="grid grid-cols-[1fr_1fr_40px] gap-0 items-center border-t">
                    <Input
                      placeholder={t("linkNamePlaceholder")}
                      value={link.name}
                      onChange={(e) => onUpdateLink(index, "name", e.target.value)}
                      maxLength={100}
                      className="border-0 rounded-none shadow-none focus-visible:ring-0 h-9 text-sm"
                    />
                    <Input
                      placeholder={t("linkUrlPlaceholder")}
                      value={link.url}
                      onChange={(e) => onUpdateLink(index, "url", e.target.value)}
                      maxLength={500}
                      className="border-0 border-l rounded-none shadow-none focus-visible:ring-0 h-9 text-sm"
                    />
                    <button
                      type="button"
                      onClick={() => onRemoveLink(index)}
                      className="flex items-center justify-center h-9 text-muted-foreground/50 hover:text-destructive transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4 border-2 border-dashed rounded-lg">
                {t("noFooterLinks")}
              </p>
            )}
          </div>

          <Separator />

          {/* Footer Preview */}
          <div className="space-y-3">
            <Label>{t("footerPreview")}</Label>
            <div className="rounded-lg border bg-muted/30 p-4">
              <div className="flex flex-col md:flex-row justify-between items-center gap-3">
                <span className="text-sm text-muted-foreground">{settings.footerCopyright}</span>
                {settings.footerLinks.length > 0 && (
                  <div className="flex flex-wrap gap-4">
                    {settings.footerLinks.map((link, index) => (
                      <span key={index} className="text-sm text-muted-foreground hover:text-foreground">
                        {link.name || t("linkNamePlaceholder")}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function PerformanceSection({
  settings,
  systemInfo,
  onInputChange,
}: {
  settings: SiteSettings
  systemInfo: SystemInfo
  onInputChange: (field: keyof SiteSettings, value: string | FooterLink[]) => void
}) {
  const t = useTranslations("adminSettings")
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">{t("performance")}</h2>
        <p className="text-sm text-muted-foreground">{t("performanceDescription")}</p>
      </div>

      <Card>
        <CardContent className="p-6 space-y-6">
          <div className="space-y-2">
            <Label htmlFor="photosPerPage">{t("photosPerPage")}</Label>
            <Input
              id="photosPerPage"
              type="number"
              min="1"
              max="100"
              value={settings.photosPerPage}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                onInputChange("photosPerPage", e.target.value)
              }
              placeholder="32"
              className="max-w-32"
            />
            <p className="text-xs text-muted-foreground">
              {t("photosPerPageHelp")}
            </p>
          </div>

          <Separator />

          <div className="space-y-2">
            <Label htmlFor="batchProcessingSize">{t("batchProcessingSize")}</Label>
            <Input
              id="batchProcessingSize"
              type="number"
              min="1"
              value={settings.batchProcessingSize}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                onInputChange("batchProcessingSize", e.target.value)
              }
              placeholder="4"
              className="max-w-32"
            />
            <p className="text-xs text-muted-foreground">
              {t("batchProcessingSizeHelp", { max: systemInfo.maxBatchProcessingSize })}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
