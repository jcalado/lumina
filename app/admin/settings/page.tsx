"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Save, Settings, Plus, Trash2, Palette } from "lucide-react"
import { toast } from "@/hooks/use-toast"
import { LiveAccentPreview } from "@/components/LiveAccentPreview"

interface FooterLink {
  name: string
  url: string
}

interface SiteSettings {
  siteName: string
  footerCopyright: string
  footerLinks: FooterLink[]
  accentColor: string
}

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<SiteSettings>({
    siteName: "Lumina Gallery",
    footerCopyright: `© ${new Date().getFullYear()} Lumina Gallery. All rights reserved.`,
    footerLinks: [],
    accentColor: "#3b82f6"
  })
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchSettings()
  }, [])

  const fetchSettings = async () => {
    try {
      const response = await fetch("/api/admin/settings")
      if (response.ok) {
        const data = await response.json()
        const fetchedSettings = data.settings
        
        // Parse footer links if they exist
        let footerLinks = []
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
          accentColor: fetchedSettings.accentColor || "#3b82f6"
        })
      } else {
        toast({
          title: "Error",
          description: "Failed to fetch settings",
          variant: "destructive"
        })
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to fetch settings",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    
    try {
      const response = await fetch("/api/admin/settings", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(settings)
      })

      if (response.ok) {
        toast({
          title: "Success",
          description: "Settings saved successfully"
        })
        
        // Trigger a page refresh to update the site name in the header
        window.location.reload()
      } else {
        const data = await response.json()
        throw new Error(data.error || "Failed to save settings")
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to save settings",
        variant: "destructive"
      })
    } finally {
      setSaving(false)
    }
  }

  const handleInputChange = (field: keyof SiteSettings, value: string | FooterLink[]) => {
    setSettings(prev => ({
      ...prev,
      [field]: value
    }))
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
        <h1 className="text-3xl font-bold">Settings</h1>
        <Card className="animate-pulse">
          <CardHeader>
            <div className="h-6 bg-gray-200 rounded w-1/3"></div>
            <div className="h-4 bg-gray-200 rounded w-1/2"></div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="h-4 bg-gray-200 rounded w-1/4"></div>
              <div className="h-10 bg-gray-200 rounded"></div>
              <div className="h-10 bg-gray-200 rounded w-24"></div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Live preview component for real-time accent color changes */}
      <LiveAccentPreview accentColor={settings.accentColor} />
      
      <div className="flex items-center space-x-2">
        <Settings className="h-8 w-8" />
        <h1 className="text-3xl font-bold">Settings</h1>
      </div>

      <div className="grid gap-6 max-w-2xl">
        <Card>
          <CardHeader>
            <CardTitle>Site Configuration</CardTitle>
            <CardDescription>
              Configure basic site settings that appear throughout the application
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="siteName">Site Name</Label>
              <Input
                id="siteName"
                value={settings.siteName}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => 
                  handleInputChange("siteName", e.target.value)
                }
                placeholder="Enter site name"
                maxLength={100}
              />
              <p className="text-sm text-muted-foreground">
                This name appears in the top navigation bar and browser title
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="accentColor">Accent Color</Label>
              <div className="flex items-center space-x-3">
                <input
                  id="accentColor"
                  type="color"
                  value={settings.accentColor}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => 
                    handleInputChange("accentColor", e.target.value)
                  }
                  className="w-12 h-10 rounded border border-input bg-background cursor-pointer"
                />
                <Input
                  value={settings.accentColor}
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => 
                    handleInputChange("accentColor", e.target.value)
                  }
                  placeholder="#3b82f6"
                  pattern="^#[0-9A-Fa-f]{6}$"
                  maxLength={7}
                  className="font-mono"
                />
                <div className="flex space-x-2">
                  {/* Preset colors */}
                  {[
                    "#3b82f6", // Blue
                    "#ef4444", // Red
                    "#10b981", // Green
                    "#f59e0b", // Yellow
                    "#8b5cf6", // Purple
                    "#ec4899", // Pink
                    "#06b6d4", // Cyan
                    "#84cc16"  // Lime
                  ].map((color) => (
                    <button
                      key={color}
                      type="button"
                      className="w-8 h-8 rounded border-2 border-white shadow-sm hover:scale-110 transition-transform"
                      style={{ backgroundColor: color }}
                      onClick={() => handleInputChange("accentColor", color)}
                      title={color}
                    />
                  ))}
                </div>
              </div>
              <p className="text-sm text-muted-foreground">
                The primary accent color used throughout the application for buttons, links, and highlights
              </p>
            </div>
            
            <div className="flex justify-end">
              <Button 
                onClick={handleSave}
                disabled={saving}
                className="flex items-center space-x-2"
              >
                <Save className="h-4 w-4" />
                <span>{saving ? "Saving..." : "Save Settings"}</span>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Footer Configuration</CardTitle>
            <CardDescription>
              Configure the footer that appears at the bottom of every page
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="space-y-2">
              <Label htmlFor="footerCopyright">Copyright Text</Label>
              <Textarea
                id="footerCopyright"
                value={settings.footerCopyright}
                onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => 
                  handleInputChange("footerCopyright", e.target.value)
                }
                placeholder="© 2024 Your Company. All rights reserved."
                maxLength={500}
                rows={3}
              />
              <p className="text-sm text-muted-foreground">
                The copyright text that appears in the footer
              </p>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>Footer Links</Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={addFooterLink}
                  className="flex items-center space-x-2"
                >
                  <Plus className="h-4 w-4" />
                  <span>Add Link</span>
                </Button>
              </div>

              {settings.footerLinks.map((link, index) => (
                <div key={index} className="flex items-center space-x-2 p-4 border rounded-lg">
                  <div className="flex-1 space-y-2">
                    <Input
                      placeholder="Link name (e.g., Privacy Policy)"
                      value={link.name}
                      onChange={(e) => updateFooterLink(index, "name", e.target.value)}
                      maxLength={100}
                    />
                    <Input
                      placeholder="Link URL (e.g., /privacy or https://example.com)"
                      value={link.url}
                      onChange={(e) => updateFooterLink(index, "url", e.target.value)}
                      maxLength={500}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => removeFooterLink(index)}
                    className="text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))}

              {settings.footerLinks.length === 0 && (
                <p className="text-sm text-muted-foreground text-center py-4 border-2 border-dashed rounded-lg">
                  No footer links configured. Click "Add Link" to create your first footer link.
                </p>
              )}
            </div>
            
            <div className="flex justify-end">
              <Button 
                onClick={handleSave}
                disabled={saving}
                className="flex items-center space-x-2"
              >
                <Save className="h-4 w-4" />
                <span>{saving ? "Saving..." : "Save Settings"}</span>
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Preview</CardTitle>
            <CardDescription>
              See how your changes will appear to visitors
            </CardDescription>
          </CardHeader>
          <CardContent>
            {/* Header Preview */}
            <div className="border rounded-lg p-4 bg-gray-50 mb-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold" style={{ color: settings.accentColor }}>
                  {settings.siteName}
                </h2>
                <nav className="flex items-center space-x-4 text-sm text-muted-foreground">
                  <span>Albums</span>
                  <span>Favorites</span>
                </nav>
              </div>
              <div className="mt-4 flex space-x-2">
                <button 
                  className="px-4 py-2 rounded text-white text-sm font-medium"
                  style={{ backgroundColor: settings.accentColor }}
                >
                  Sample Button
                </button>
                <button 
                  className="px-4 py-2 rounded border text-sm font-medium"
                  style={{ 
                    borderColor: settings.accentColor, 
                    color: settings.accentColor 
                  }}
                >
                  Outline Button
                </button>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mb-6">
              Header and button preview with accent color
            </p>

            {/* Footer Preview */}
            <div className="border-t bg-gray-50 rounded-lg p-4">
              <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                <div className="text-sm text-muted-foreground">
                  {settings.footerCopyright}
                </div>
                {settings.footerLinks.length > 0 && (
                  <div className="flex flex-wrap gap-6">
                    {settings.footerLinks.map((link, index) => (
                      <span key={index} className="text-sm text-muted-foreground">
                        {link.name || "Link Name"}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              Footer preview
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
