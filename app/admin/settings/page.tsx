"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Save, Settings } from "lucide-react"
import { toast } from "@/hooks/use-toast"

interface SiteSettings {
  siteName: string
}

export default function AdminSettingsPage() {
  const [settings, setSettings] = useState<SiteSettings>({
    siteName: "Lumina Gallery"
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
        setSettings(data.settings)
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

  const handleInputChange = (field: keyof SiteSettings, value: string) => {
    setSettings(prev => ({
      ...prev,
      [field]: value
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
            <div className="border rounded-lg p-4 bg-gray-50">
              <div className="flex items-center justify-between">
                <h2 className="text-xl font-bold text-primary">
                  {settings.siteName}
                </h2>
                <nav className="flex items-center space-x-4 text-sm text-muted-foreground">
                  <span>Albums</span>
                  <span>Favorites</span>
                </nav>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              This is how the header will appear on the public site
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
