"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Save, Play, Pause, RotateCcw, Activity, Clock, CheckCircle, XCircle } from "lucide-react"
import { toast } from "@/hooks/use-toast"

interface BlurhashJob {
  id: string
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED'
  progress: number
  totalPhotos: number
  processedPhotos: number
  startedAt: string | null
  completedAt: string | null
  errors: string | null
  createdAt: string
}

interface JobStats {
  totalPhotos: number
  photosWithBlurhash: number
  photosWithoutBlurhash: number
  lastCompletedJob?: BlurhashJob
}

export default function AdminJobsPage() {
  const [blurhashJob, setBlurhashJob] = useState<BlurhashJob | null>(null)
  const [jobStats, setJobStats] = useState<JobStats | null>(null)
  const [blurhashJobLoading, setBlurhashJobLoading] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchBlurhashJobs()
    fetchJobStats()
    
    // Poll for job updates every 3 seconds if there's a running job
    const interval = setInterval(() => {
      if (blurhashJob?.status === 'RUNNING') {
        fetchBlurhashJobs()
      }
    }, 3000)

    return () => clearInterval(interval)
  }, [blurhashJob?.status])

  const fetchBlurhashJobs = async () => {
    try {
      const response = await fetch("/api/admin/blurhash")
      if (response.ok) {
        const data = await response.json()
        if (data.jobs && data.jobs.length > 0) {
          setBlurhashJob(data.jobs[0]) // Get the latest job
        }
      }
    } catch (error) {
      console.error('Error fetching blurhash jobs:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchJobStats = async () => {
    try {
      const response = await fetch("/api/admin/jobs/stats")
      if (response.ok) {
        const data = await response.json()
        setJobStats(data)
      }
    } catch (error) {
      console.error('Error fetching job stats:', error)
    }
  }

  const handleStartBlurhashJob = async () => {
    setBlurhashJobLoading(true)
    try {
      const response = await fetch("/api/admin/blurhash", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ action: "start" })
      })

      if (response.ok) {
        toast({
          title: "Success",
          description: "Blurhash processing started"
        })
        
        // Refresh job data immediately
        setTimeout(() => {
          fetchBlurhashJobs()
          fetchJobStats()
        }, 1000)
      } else {
        const data = await response.json()
        throw new Error(data.error || "Failed to start blurhash job")
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to start blurhash job",
        variant: "destructive"
      })
    } finally {
      setBlurhashJobLoading(false)
    }
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'RUNNING':
        return <Activity className="h-4 w-4 text-blue-600 animate-pulse" />
      case 'COMPLETED':
        return <CheckCircle className="h-4 w-4 text-green-600" />
      case 'FAILED':
        return <XCircle className="h-4 w-4 text-red-600" />
      case 'PENDING':
        return <Clock className="h-4 w-4 text-yellow-600" />
      default:
        return <Clock className="h-4 w-4 text-gray-600" />
    }
  }

  const getStatusBadge = (status: string) => {
    const variants = {
      'RUNNING': 'bg-blue-100 text-blue-800',
      'COMPLETED': 'bg-green-100 text-green-800',
      'FAILED': 'bg-red-100 text-red-800',
      'PENDING': 'bg-yellow-100 text-yellow-800'
    }
    
    return (
      <Badge className={`${variants[status as keyof typeof variants]} hover:${variants[status as keyof typeof variants]}`}>
        {getStatusIcon(status)}
        <span className="ml-1">{status}</span>
      </Badge>
    )
  }

  const formatDate = (dateString: string | null) => {
    if (!dateString) return 'N/A'
    return new Date(dateString).toLocaleString()
  }

  const formatDuration = (startedAt: string | null, completedAt: string | null) => {
    if (!startedAt) return 'N/A'
    
    const start = new Date(startedAt)
    const end = completedAt ? new Date(completedAt) : new Date()
    const durationMs = end.getTime() - start.getTime()
    
    const seconds = Math.floor(durationMs / 1000)
    const minutes = Math.floor(seconds / 60)
    const hours = Math.floor(minutes / 60)
    
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`
    } else {
      return `${seconds}s`
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="mt-2 text-muted-foreground">Loading jobs...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center space-x-2">
        <Activity className="h-8 w-8" />
        <h1 className="text-3xl font-bold">Background Jobs</h1>
      </div>

      <div className="grid gap-6">
        {/* Blurhash Processing Job */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Save className="h-5 w-5" />
                <span>Blurhash Processing</span>
              </div>
              {blurhashJob && getStatusBadge(blurhashJob.status)}
            </CardTitle>
            <CardDescription>
              Generate blur placeholders for smooth image loading experience
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Job Statistics Overview */}
            {jobStats && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-muted/50 rounded-lg">
                <div className="text-center">
                  <div className="text-2xl font-bold text-primary">{jobStats.totalPhotos}</div>
                  <div className="text-sm text-muted-foreground">Total Photos</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">{jobStats.photosWithBlurhash}</div>
                  <div className="text-sm text-muted-foreground">Processed</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-orange-600">{jobStats.photosWithoutBlurhash}</div>
                  <div className="text-sm text-muted-foreground">Remaining</div>
                </div>
              </div>
            )}

            {/* Current Job Status */}
            {blurhashJob ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium">Current Job Status</h4>
                  <span className="text-sm text-muted-foreground">
                    Started: {formatDate(blurhashJob.startedAt)}
                  </span>
                </div>
                
                {blurhashJob.status === 'RUNNING' && (
                  <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span>Progress:</span>
                      <span className="font-medium">{blurhashJob.progress}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-3">
                      <div 
                        className="bg-blue-600 h-3 rounded-full transition-all duration-300" 
                        style={{ width: `${blurhashJob.progress}%` }}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">This Run:</span>
                        <div className="font-medium">{blurhashJob.processedPhotos} / {blurhashJob.totalPhotos}</div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Remaining:</span>
                        <div className="font-medium">{blurhashJob.totalPhotos - blurhashJob.processedPhotos}</div>
                      </div>
                    </div>
                    <div className="text-sm">
                      <span className="text-muted-foreground">Duration:</span>
                      <span className="ml-2 font-medium">
                        {formatDuration(blurhashJob.startedAt, null)}
                      </span>
                    </div>
                  </div>
                )}
                
                {blurhashJob.status === 'COMPLETED' && (
                  <div className="space-y-2 p-4 border rounded-lg bg-green-50">
                    <div className="flex items-center text-green-700">
                      <CheckCircle className="h-4 w-4 mr-2" />
                      <span className="font-medium">Job Completed Successfully</span>
                    </div>
                    <div className="grid grid-cols-2 gap-4 text-sm text-green-700">
                      <div>
                        <span>Processed:</span>
                        <span className="ml-2 font-medium">{blurhashJob.processedPhotos} photos</span>
                      </div>
                      <div>
                        <span>Duration:</span>
                        <span className="ml-2 font-medium">
                          {formatDuration(blurhashJob.startedAt, blurhashJob.completedAt)}
                        </span>
                      </div>
                    </div>
                    <div className="text-sm text-green-700">
                      <span>Completed:</span>
                      <span className="ml-2">{formatDate(blurhashJob.completedAt)}</span>
                    </div>
                  </div>
                )}
                
                {blurhashJob.status === 'FAILED' && (
                  <div className="space-y-2 p-4 border rounded-lg bg-red-50">
                    <div className="flex items-center text-red-700">
                      <XCircle className="h-4 w-4 mr-2" />
                      <span className="font-medium">Job Failed</span>
                    </div>
                    <div className="text-sm text-red-700">
                      <span>Failed at:</span>
                      <span className="ml-2">{formatDate(blurhashJob.completedAt)}</span>
                    </div>
                    {blurhashJob.errors && (
                      <div className="text-sm text-red-700">
                        <span>Errors:</span>
                        <div className="mt-1 p-2 bg-red-100 rounded text-xs font-mono">
                          {JSON.parse(blurhashJob.errors).slice(0, 3).map((error: string, index: number) => (
                            <div key={index}>{error}</div>
                          ))}
                          {JSON.parse(blurhashJob.errors).length > 3 && (
                            <div>... and {JSON.parse(blurhashJob.errors).length - 3} more errors</div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {blurhashJob.status === 'PENDING' && (
                  <div className="p-4 border rounded-lg bg-yellow-50">
                    <div className="flex items-center text-yellow-700">
                      <Clock className="h-4 w-4 mr-2" />
                      <span className="font-medium">Job Pending</span>
                    </div>
                    <div className="text-sm text-yellow-700 mt-1">
                      Waiting to start processing...
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <Activity className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No blurhash jobs found</p>
                <p className="text-sm">Start a new job to generate blur placeholders</p>
              </div>
            )}

            {/* Last Completed Job Summary */}
            {jobStats?.lastCompletedJob && jobStats.lastCompletedJob.id !== blurhashJob?.id && (
              <div className="border-t pt-4">
                <h4 className="font-medium mb-3">Last Completed Job</h4>
                <div className="grid grid-cols-2 gap-4 text-sm p-3 bg-gray-50 rounded-lg">
                  <div>
                    <span className="text-muted-foreground">Processed:</span>
                    <div className="font-medium">{jobStats.lastCompletedJob.processedPhotos} photos</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Duration:</span>
                    <div className="font-medium">
                      {formatDuration(jobStats.lastCompletedJob.startedAt, jobStats.lastCompletedJob.completedAt)}
                    </div>
                  </div>
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Completed:</span>
                    <span className="ml-2">{formatDate(jobStats.lastCompletedJob.completedAt)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex gap-3 pt-4 border-t">
              <Button
                onClick={handleStartBlurhashJob}
                disabled={blurhashJobLoading || blurhashJob?.status === 'RUNNING'}
                className="flex items-center space-x-2"
              >
                <Play className="h-4 w-4" />
                <span>
                  {blurhashJob?.status === 'RUNNING' 
                    ? 'Processing...' 
                    : jobStats?.photosWithoutBlurhash === 0
                    ? 'Reprocess All Photos'
                    : `Process ${jobStats?.photosWithoutBlurhash || 0} Remaining Photos`
                  }
                </span>
              </Button>
              
              <Button
                variant="outline"
                onClick={() => {
                  fetchBlurhashJobs()
                  fetchJobStats()
                }}
                className="flex items-center space-x-2"
              >
                <RotateCcw className="h-4 w-4" />
                <span>Refresh</span>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Future Jobs Placeholder */}
        <Card className="opacity-60">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Clock className="h-5 w-5" />
              <span>Thumbnail Generation</span>
              <Badge variant="outline">Coming Soon</Badge>
            </CardTitle>
            <CardDescription>
              Background thumbnail processing and optimization
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Future enhancement for processing and optimizing photo thumbnails in the background.
            </p>
          </CardContent>
        </Card>

        <Card className="opacity-60">
          <CardHeader>
            <CardTitle className="flex items-center space-x-2">
              <Clock className="h-5 w-5" />
              <span>Album Synchronization</span>
              <Badge variant="outline">Coming Soon</Badge>
            </CardTitle>
            <CardDescription>
              Sync local photo directories with cloud storage
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Future enhancement for synchronizing local photo collections with cloud storage providers.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
