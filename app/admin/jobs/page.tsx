"use client"

import { useState, useEffect } from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog"
import { Save, Play, Pause, RotateCcw, Activity, Clock, CheckCircle, XCircle, Image, Trash2 } from "lucide-react"
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

interface ThumbnailJob {
  id: string
  status: 'PENDING' | 'RUNNING' | 'COMPLETED' | 'FAILED'
  progress: number
  totalPhotos: number
  processedPhotos: number
  thumbnailsCreated: number
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

interface ThumbnailStats {
  totalPhotos: number
  photosWithThumbnails: number
  photosWithoutThumbnails: number
  totalPhotoThumbnails: number
  photoCompletionPercentage: number
  totalVideos: number
  videosWithThumbnails: number
  videosWithoutThumbnails: number
  totalVideoThumbnails: number
  videoCompletionPercentage: number
  totalMediaItems: number
  totalMediaWithThumbnails: number
  totalMediaWithoutThumbnails: number
  totalThumbnails: number
  overallCompletionPercentage: number
  lastCompletedJob?: ThumbnailJob
}

export default function AdminJobsPage() {
  const [blurhashJob, setBlurhashJob] = useState<BlurhashJob | null>(null)
  const [thumbnailJob, setThumbnailJob] = useState<ThumbnailJob | null>(null)
  const [videoThumbnailJob, setVideoThumbnailJob] = useState<ThumbnailJob | null>(null)
  const [jobStats, setJobStats] = useState<JobStats | null>(null)
  const [thumbnailStats, setThumbnailStats] = useState<ThumbnailStats | null>(null)
  const [blurhashJobLoading, setBlurhashJobLoading] = useState(false)
  const [thumbnailJobLoading, setThumbnailJobLoading] = useState(false)
  const [videoThumbnailJobLoading, setVideoThumbnailJobLoading] = useState(false)
  const [useParallelProcessing, setUseParallelProcessing] = useState(true)
  const [useThumbnailParallelProcessing, setUseThumbnailParallelProcessing] = useState(true)
  const [loading, setLoading] = useState(true)
  const [thumbQueue, setThumbQueue] = useState<{waiting:number;active:number;completed:number;failed:number;delayed:number;paused:number}|null>(null)
  const isActiveThumb = (thumbQueue?.active || 0) > 0
  const isPausedThumb = (thumbQueue?.paused || 0) === 1
  const isThumbBusy = ((thumbQueue?.waiting || 0) + (thumbQueue?.active || 0)) > 0
  const [blurQueue, setBlurQueue] = useState<{waiting:number;active:number;completed:number;failed:number;delayed:number;paused:number}|null>(null)
  const isBlurActive = (blurQueue?.active || 0) > 0
  const isBlurPaused = (blurQueue?.paused || 0) === 1
  const isBlurBusy = ((blurQueue?.waiting || 0) + (blurQueue?.active || 0)) > 0
  useEffect(() => {
    fetchBlurhashJobs()
    fetchThumbnailJobs()
    fetchVideoThumbnailJobs()
    fetchJobStats()
    fetchThumbnailStats()
    fetchThumbQueue()

    // Poll for job updates every 3 seconds if there's a running job
    const interval = setInterval(() => {
      if (blurhashJob?.status === 'RUNNING' || thumbnailJob?.status === 'RUNNING' || videoThumbnailJob?.status === 'RUNNING') {
        fetchBlurhashJobs()
        fetchThumbnailJobs()
        fetchVideoThumbnailJobs()
        fetchThumbQueue()
      }
    }, 3000)

    return () => clearInterval(interval)
  }, [blurhashJob?.status, thumbnailJob?.status, videoThumbnailJob?.status])

  const fetchBlurhashJobs = async () => {
    try {
      const response = await fetch("/api/admin/blurhash")
      if (response.ok) {
        const data = await response.json()
        if (data.queue) setBlurQueue(data.queue)
      }
    } catch (error) {
      console.error('Error fetching blurhash jobs:', error)
    } finally {
      setLoading(false)
    }
  }

  const fetchThumbQueue = async () => {
    try {
      const res = await fetch('/api/admin/jobs/thumbnail-queue')
      if (res.ok) setThumbQueue(await res.json())
    } catch (e) {
      // ignore
    }
  }

  const fetchThumbnailJobs = async () => {
    try {
      const response = await fetch("/api/admin/thumbnails")
      if (response.ok) {
        const data = await response.json()
        if (data.jobs && data.jobs.length > 0) {
          setThumbnailJob(data.jobs[0]) // Get the latest job
        }
      }
    } catch (error) {
      console.error('Error fetching thumbnail jobs:', error)
    }
  }

  const fetchVideoThumbnailJobs = async () => {
    try {
      const response = await fetch("/api/admin/video-thumbnails")
      if (response.ok) {
        const data = await response.json()
        if (data.latestJob) {
          setVideoThumbnailJob(data.latestJob) // Get the latest job
        }
      }
    } catch (error) {
      console.error('Error fetching video thumbnail jobs:', error)
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

  const fetchThumbnailStats = async () => {
    try {
      const response = await fetch("/api/thumbnails/status")
      if (response.ok) {
        const data = await response.json()
        if (data.stats) {
          setThumbnailStats(data.stats)
        }
      }
    } catch (error) {
      console.error('Error fetching thumbnail stats:', error)
    }
  }

  // Always poll thumb queue to keep UI in sync (including paused state)
  useEffect(() => {
    fetchThumbQueue()
    const q = setInterval(fetchThumbQueue, 3000)
    return () => clearInterval(q)
  }, [])

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
          description: `Blurhash processing enqueued`
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

  const handleStopBlurhashJob = async () => {
    setBlurhashJobLoading(true)
    try {
      const response = await fetch("/api/admin/blurhash", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ action: "stop" })
      })

      if (response.ok) {
        toast({
          title: "Success",
          description: "Blurhash queue paused"
        })
        
        // Refresh job data immediately
        setTimeout(() => {
          fetchBlurhashJobs()
          fetchJobStats()
        }, 1000)
      } else {
        const data = await response.json()
        throw new Error(data.error || "Failed to stop blurhash job")
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to stop blurhash job",
        variant: "destructive"
      })
    } finally {
      setBlurhashJobLoading(false)
    }
  }

  const handleDeleteAllBlurhashes = async () => {
    setBlurhashJobLoading(true)
    try {
      const response = await fetch("/api/admin/blurhash", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ action: "delete-all" })
      })

      if (response.ok) {
        toast({
          title: "Success",
          description: "All blurhashes have been deleted"
        })
        
        // Refresh job data immediately
        setTimeout(() => {
          fetchBlurhashJobs()
          fetchJobStats()
        }, 1000)
      } else {
        const data = await response.json()
        throw new Error(data.error || "Failed to delete blurhashes")
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to delete blurhashes",
        variant: "destructive"
      })
    } finally {
      setBlurhashJobLoading(false)
    }
  }

  const handleStartThumbnailJob = async () => {
    setThumbnailJobLoading(true)
    try {
      const response = await fetch("/api/admin/thumbnails/enqueue-missing", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({})
      })

      if (response.ok) {
        const data = await response.json()
        toast({
          title: "Success",
          description: `Thumbnail processing started (${data.processingMode || 'serial'} mode)`
        })
        
        // Refresh job data immediately
        setTimeout(() => {
          fetchThumbnailJobs()
          fetchThumbnailStats()
        }, 1000)
      } else {
        const data = await response.json()
        throw new Error(data.error || "Failed to start thumbnail job")
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to start thumbnail job",
        variant: "destructive"
      })
    } finally {
      setThumbnailJobLoading(false)
    }
  }

  const handleStopThumbnailJob = async () => {
    setThumbnailJobLoading(true)
    try {
      const response = await fetch("/api/admin/thumbnails/pause", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({})
      })

      if (response.ok) {
        toast({
          title: "Success",
          description: "Thumbnail processing stop requested"
        })
        
        // Refresh job data immediately
        setTimeout(() => {
          fetchThumbnailJobs()
          fetchThumbnailStats()
        }, 1000)
      } else {
        const data = await response.json()
        throw new Error(data.error || "Failed to stop thumbnail job")
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to stop thumbnail job",
        variant: "destructive"
      })
    } finally {
      setThumbnailJobLoading(false)
    }
  }

  const handleResumeThumbnailJob = async () => {
    setThumbnailJobLoading(true)
    try {
      const response = await fetch("/api/admin/thumbnails/resume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      })
      if (response.ok) {
        toast({ title: "Resumed", description: "Thumbnail queue resumed" })
        fetchThumbQueue()
      } else {
        const data = await response.json()
        throw new Error(data.error || "Failed to resume queue")
      }
    } catch (error) {
      toast({ title: "Error", description: error instanceof Error ? error.message : "Failed to resume queue", variant: "destructive" })
    } finally {
      setThumbnailJobLoading(false)
    }
  }

  const handleReprocessThumbnails = async () => {
    setThumbnailJobLoading(true)
    try {
      const response = await fetch("/api/admin/thumbnails/enqueue-reprocess", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({})
      })

      if (response.ok) {
        toast({
          title: "Success",
          description: "All thumbnails are being reprocessed. This may take a while."
        })
        
        // Refresh job data immediately
        setTimeout(() => {
          fetchThumbnailJobs()
          fetchThumbnailStats()
        }, 1000)
      } else {
        const data = await response.json()
        throw new Error(data.error || "Failed to start thumbnail reprocessing")
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to start thumbnail reprocessing",
        variant: "destructive"
      })
    } finally {
      setThumbnailJobLoading(false)
    }
  }

  const handleCleanupJobs = async () => {
    try {
      setThumbnailJobLoading(true)

      const response = await fetch("/api/admin/thumbnails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ action: "cleanup" })
      })

      if (response.ok) {
        const data = await response.json()
        toast({
          title: "Success",
          description: data.message || "Job cleanup completed"
        })
        
        // Refresh job data immediately
        setTimeout(() => {
          fetchThumbnailJobs()
          fetchThumbnailStats()
        }, 1000)
      } else {
        const data = await response.json()
        throw new Error(data.error || "Failed to cleanup jobs")
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to cleanup jobs",
        variant: "destructive"
      })
    } finally {
      setThumbnailJobLoading(false)
    }
  }

  // Video thumbnail handlers
  const handleStartVideoThumbnailJob = async () => {
    setVideoThumbnailJobLoading(true)
    try {
      const response = await fetch("/api/admin/video-thumbnails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ action: "start" })
      })

      if (response.ok) {
        toast({
          title: "Success",
          description: "Video thumbnail processing started"
        })
        
        // Refresh job data immediately
        setTimeout(() => {
          fetchVideoThumbnailJobs()
          fetchThumbnailStats()
        }, 1000)
      } else {
        const data = await response.json()
        throw new Error(data.error || "Failed to start video thumbnail job")
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to start video thumbnail job",
        variant: "destructive"
      })
    } finally {
      setVideoThumbnailJobLoading(false)
    }
  }

  const handleStopVideoThumbnailJob = async () => {
    setVideoThumbnailJobLoading(true)
    try {
      const response = await fetch("/api/admin/video-thumbnails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ action: "stop" })
      })

      if (response.ok) {
        toast({
          title: "Success",
          description: "Video thumbnail processing stop requested"
        })
        
        // Refresh job data immediately
        setTimeout(() => {
          fetchVideoThumbnailJobs()
          fetchThumbnailStats()
        }, 1000)
      } else {
        const data = await response.json()
        throw new Error(data.error || "Failed to stop video thumbnail job")
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to stop video thumbnail job",
        variant: "destructive"
      })
    } finally {
      setVideoThumbnailJobLoading(false)
    }
  }

  const handleReprocessVideoThumbnails = async () => {
    setVideoThumbnailJobLoading(true)
    try {
      const response = await fetch("/api/admin/video-thumbnails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ action: "reprocess" })
      })

      if (response.ok) {
        toast({
          title: "Success",
          description: "All video thumbnails are being reprocessed. This may take a while."
        })
        
        // Refresh job data immediately
        setTimeout(() => {
          fetchVideoThumbnailJobs()
          fetchThumbnailStats()
        }, 1000)
      } else {
        const data = await response.json()
        throw new Error(data.error || "Failed to start video thumbnail reprocessing")
      }
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to start video thumbnail reprocessing",
        variant: "destructive"
      })
    } finally {
      setVideoThumbnailJobLoading(false)
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
              {/* Status badge derived from queue */}
              <span className={`text-xs px-2 py-1 rounded ${isBlurActive ? 'bg-blue-100 text-blue-800' : isBlurPaused ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-800'}`}>
                {isBlurActive ? 'RUNNING' : isBlurPaused ? 'PAUSED' : 'IDLE'}
              </span>
            </CardTitle>
            <CardDescription>
              Generate blur placeholders for smooth image loading experience
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Blurhash Queue Dashboard */}
            {blurQueue && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {/* Status */}
                <div className="rounded-lg border bg-card p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`p-2 rounded-full ${isBlurActive ? 'bg-blue-100 text-blue-600' : isBlurPaused ? 'bg-yellow-100 text-yellow-600' : 'bg-gray-100 text-gray-600'}`}>
                        {isBlurActive ? <Activity className="h-4 w-4" /> : isBlurPaused ? <Pause className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
                      </span>
                      <span className="text-xs uppercase tracking-wide text-muted-foreground">Status</span>
                    </div>
                  </div>
                  <div className={`mt-2 text-2xl font-bold ${isBlurActive ? 'text-blue-600' : isBlurPaused ? 'text-yellow-600' : 'text-gray-600'}`}>{isBlurActive ? 'Running' : isBlurPaused ? 'Paused' : 'Stopped'}</div>
                </div>

                {/* Jobs queued */}
                <div className="rounded-lg border bg-card p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="p-2 rounded-full bg-orange-100 text-orange-600">
                        <Clock className="h-4 w-4" />
                      </span>
                      <span className="text-xs uppercase tracking-wide text-muted-foreground">Jobs Queued</span>
                    </div>
                  </div>
                  <div className="mt-2 text-2xl font-bold">{blurQueue.waiting}</div>
                </div>

                {/* Jobs processing */}
                <div className="rounded-lg border bg-card p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="p-2 rounded-full bg-blue-100 text-blue-600">
                        <Activity className="h-4 w-4" />
                      </span>
                      <span className="text-xs uppercase tracking-wide text-muted-foreground">Jobs Processing</span>
                    </div>
                  </div>
                  <div className="mt-2 text-2xl font-bold">{blurQueue.active}</div>
                </div>

                {/* Jobs finished */}
                <div className="rounded-lg border bg-card p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="p-2 rounded-full bg-green-100 text-green-600">
                        <CheckCircle className="h-4 w-4" />
                      </span>
                      <span className="text-xs uppercase tracking-wide text-muted-foreground">Jobs Finished</span>
                    </div>
                  </div>
                  <div className="mt-2 text-2xl font-bold">{blurQueue.completed}</div>
                </div>
              </div>
            )}

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

            {/* Processing Options */}
            <div className="pt-3 border-t">
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="parallel-processing"
                  checked={useParallelProcessing}
                  onChange={(e) => setUseParallelProcessing(e.target.checked)}
                  className="rounded border-gray-300"
                />
                <label htmlFor="parallel-processing" className="text-sm font-medium">
                  Use parallel processing (recommended for better performance)
                </label>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Parallel processing utilizes multiple CPU cores for faster blurhash generation
              </p>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-3 pt-4 border-t">
              <Button
                onClick={handleStartBlurhashJob}
                disabled={blurhashJobLoading || isBlurActive || isBlurPaused}
                className="flex items-center space-x-2"
              >
                <Play className="h-4 w-4" />
                <span>
                  {isBlurActive ? 'Processing...' : jobStats?.photosWithoutBlurhash === 0 ? 'Reprocess All Photos' : `Process ${jobStats?.photosWithoutBlurhash || 0} Remaining Photos`}
                </span>
              </Button>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    disabled={blurhashJobLoading || isBlurActive}
                    className="flex items-center space-x-2 bg-red-600 hover:bg-red-700 text-white"
                  >
                    <Trash2 className="h-4 w-4" />
                    <span>Delete All Blurhashes</span>
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete All Blurhashes</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to delete all blurhashes? This will:
                      <br />
                      • Remove blurhash data from all {jobStats?.totalPhotos || 0} photos
                      <br />
                      • Clear blurhash cache for faster loading
                      <br />
                      <br />
                      This operation cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={handleDeleteAllBlurhashes}
                      className="bg-red-600 hover:bg-red-700"
                    >
                      Delete All Blurhashes
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              {isBlurActive && (
                <Button
                  onClick={handleStopBlurhashJob}
                  disabled={blurhashJobLoading}
                  className="flex items-center space-x-2 bg-red-600 hover:bg-red-700 text-white"
                >
                  <Pause className="h-4 w-4" />
                  <span>Stop Processing</span>
                </Button>
              )}
              
              <Button
                onClick={() => {
                  fetchBlurhashJobs()
                  fetchJobStats()
                }}
                className="flex items-center space-x-2 border border-input bg-background hover:bg-accent hover:text-accent-foreground"
              >
                <RotateCcw className="h-4 w-4" />
                <span>Refresh</span>
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Thumbnail Processing Job */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <Image className="h-5 w-5" />
                <span>Thumbnail Processing</span>
              </div>
              {thumbnailJob && getStatusBadge(thumbnailJob.status)}
            </CardTitle>
            <CardDescription>
              Background thumbnail processing and optimization for photos and videos for fast media loading
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Job Statistics Overview */}
            {thumbnailStats && (
              <div className="grid grid-cols-1 md:grid-cols-6 gap-4 p-4 bg-muted/50 rounded-lg">
                <div className="text-center">
                  <div className="text-2xl font-bold text-primary">{thumbnailStats.totalPhotos}</div>
                  <div className="text-sm text-muted-foreground">Total Photos</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">{thumbnailStats.photosWithThumbnails}</div>
                  <div className="text-sm text-muted-foreground">Photos w/ Thumbs</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-blue-600">{thumbnailStats.totalVideos}</div>
                  <div className="text-sm text-muted-foreground">Total Videos</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-green-600">{thumbnailStats.videosWithThumbnails}</div>
                  <div className="text-sm text-muted-foreground">Videos w/ Thumbs</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-orange-600">{thumbnailStats.totalMediaWithoutThumbnails}</div>
                  <div className="text-sm text-muted-foreground">Total Remaining</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-purple-600">{thumbnailStats.totalThumbnails}</div>
                  <div className="text-sm text-muted-foreground">Total Thumbnails</div>
                </div>
              </div>
            )}

            {/* Current Job Status */}
            {thumbnailJob ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium">Current Job Status</h4>
                  <span className="text-sm text-muted-foreground">
                    Started: {formatDate(thumbnailJob.startedAt)}
                  </span>
                </div>
                
                {thumbnailJob.status === 'RUNNING' && (
                  <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span>Progress:</span>
                      <span className="font-medium">{thumbnailJob.progress}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-3">
                      <div 
                        className="bg-blue-600 h-3 rounded-full transition-all duration-300" 
                        style={{ width: `${thumbnailJob.progress}%` }}
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Processed:</span>
                        <div className="font-medium">{thumbnailJob.processedPhotos} / {thumbnailJob.totalPhotos}</div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Created:</span>
                        <div className="font-medium">{thumbnailJob.thumbnailsCreated} thumbnails</div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Remaining:</span>
                        <div className="font-medium">{thumbnailJob.totalPhotos - thumbnailJob.processedPhotos}</div>
                      </div>
                    </div>
                    <div className="text-sm">
                      <span className="text-muted-foreground">Duration:</span>
                      <span className="ml-2 font-medium">
                        {formatDuration(thumbnailJob.startedAt, null)}
                      </span>
                    </div>
                  </div>
                )}
                
                {thumbnailJob.status === 'COMPLETED' && (
                  <div className="space-y-2 p-4 border rounded-lg bg-green-50">
                    <div className="flex items-center text-green-700">
                      <CheckCircle className="h-4 w-4 mr-2" />
                      <span className="font-medium">Job Completed Successfully</span>
                    </div>
                    <div className="grid grid-cols-3 gap-4 text-sm text-green-700">
                      <div>
                        <span>Processed:</span>
                        <span className="ml-2 font-medium">{thumbnailJob.processedPhotos} photos</span>
                      </div>
                      <div>
                        <span>Created:</span>
                        <span className="ml-2 font-medium">{thumbnailJob.thumbnailsCreated} thumbnails</span>
                      </div>
                      <div>
                        <span>Duration:</span>
                        <span className="ml-2 font-medium">
                          {formatDuration(thumbnailJob.startedAt, thumbnailJob.completedAt)}
                        </span>
                      </div>
                    </div>
                    <div className="text-sm text-green-700">
                      <span>Completed:</span>
                      <span className="ml-2">{formatDate(thumbnailJob.completedAt)}</span>
                    </div>
                  </div>
                )}
                
                {thumbnailJob.status === 'FAILED' && (
                  <div className="space-y-2 p-4 border rounded-lg bg-red-50">
                    <div className="flex items-center text-red-700">
                      <XCircle className="h-4 w-4 mr-2" />
                      <span className="font-medium">Job Failed</span>
                    </div>
                    <div className="text-sm text-red-700">
                      <span>Failed at:</span>
                      <span className="ml-2">{formatDate(thumbnailJob.completedAt)}</span>
                    </div>
                    {thumbnailJob.errors && (
                      <div className="text-sm text-red-700">
                        <span>Errors:</span>
                        <div className="mt-1 p-2 bg-red-100 rounded text-xs font-mono">
                          {JSON.parse(thumbnailJob.errors).slice(0, 3).map((error: string, index: number) => (
                            <div key={index}>{error}</div>
                          ))}
                          {JSON.parse(thumbnailJob.errors).length > 3 && (
                            <div>... and {JSON.parse(thumbnailJob.errors).length - 3} more errors</div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {thumbnailJob.status === 'PENDING' && (
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
                <Image className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No thumbnail jobs found</p>
                <p className="text-sm">Start a new job to generate thumbnails</p>
              </div>
            )}

            {/* Video Job Status */}
            {videoThumbnailJob && (
              <div className="space-y-4 border-t pt-4">
                <div className="flex items-center justify-between">
                  <h4 className="font-medium">Current Video Job Status</h4>
                  <span className="text-sm text-muted-foreground">
                    Started: {formatDate(videoThumbnailJob.startedAt)}
                  </span>
                </div>
                
                {videoThumbnailJob.status === 'RUNNING' && (
                  <div className="space-y-3">
                    <div className="flex justify-between text-sm">
                      <span>Progress:</span>
                      <span className="font-medium">{videoThumbnailJob.progress}%</span>
                    </div>
                    <div className="w-full bg-gray-200 rounded-full h-3">
                      <div 
                        className="bg-blue-600 h-3 rounded-full transition-all duration-300" 
                        style={{ width: `${videoThumbnailJob.progress}%` }}
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-4 text-sm">
                      <div>
                        <span className="text-muted-foreground">Processed:</span>
                        <div className="font-medium">{videoThumbnailJob.processedPhotos} / {videoThumbnailJob.totalPhotos}</div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Created:</span>
                        <div className="font-medium">{videoThumbnailJob.thumbnailsCreated} thumbnails</div>
                      </div>
                      <div>
                        <span className="text-muted-foreground">Remaining:</span>
                        <div className="font-medium">{videoThumbnailJob.totalPhotos - videoThumbnailJob.processedPhotos}</div>
                      </div>
                    </div>
                    <div className="text-sm">
                      <span className="text-muted-foreground">Duration:</span>
                      <span className="ml-2 font-medium">
                        {formatDuration(videoThumbnailJob.startedAt, null)}
                      </span>
                    </div>
                  </div>
                )}
                
                {videoThumbnailJob.status === 'COMPLETED' && (
                  <div className="space-y-2 p-4 border rounded-lg bg-green-50">
                    <div className="flex items-center text-green-700">
                      <CheckCircle className="h-4 w-4 mr-2" />
                      <span className="font-medium">Video Job Completed Successfully</span>
                    </div>
                    <div className="grid grid-cols-3 gap-4 text-sm text-green-700">
                      <div>
                        <span>Processed:</span>
                        <span className="ml-2 font-medium">{videoThumbnailJob.processedPhotos} videos</span>
                      </div>
                      <div>
                        <span>Created:</span>
                        <span className="ml-2 font-medium">{videoThumbnailJob.thumbnailsCreated} thumbnails</span>
                      </div>
                      <div>
                        <span>Duration:</span>
                        <span className="ml-2 font-medium">
                          {formatDuration(videoThumbnailJob.startedAt, videoThumbnailJob.completedAt)}
                        </span>
                      </div>
                    </div>
                    <div className="text-sm text-green-700">
                      <span>Completed:</span>
                      <span className="ml-2">{formatDate(videoThumbnailJob.completedAt)}</span>
                    </div>
                  </div>
                )}
                
                {videoThumbnailJob.status === 'FAILED' && (
                  <div className="space-y-2 p-4 border rounded-lg bg-red-50">
                    <div className="flex items-center text-red-700">
                      <XCircle className="h-4 w-4 mr-2" />
                      <span className="font-medium">Video Job Failed</span>
                    </div>
                    <div className="text-sm text-red-700">
                      <span>Failed at:</span>
                      <span className="ml-2">{formatDate(videoThumbnailJob.completedAt)}</span>
                    </div>
                    {videoThumbnailJob.errors && (
                      <div className="text-sm text-red-700">
                        <span>Errors:</span>
                        <div className="mt-1 p-2 bg-red-100 rounded text-xs font-mono">
                          {JSON.parse(videoThumbnailJob.errors).slice(0, 3).map((error: string, index: number) => (
                            <div key={index}>{error}</div>
                          ))}
                          {JSON.parse(videoThumbnailJob.errors).length > 3 && (
                            <div>... and {JSON.parse(videoThumbnailJob.errors).length - 3} more errors</div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {videoThumbnailJob.status === 'PENDING' && (
                  <div className="p-4 border rounded-lg bg-yellow-50">
                    <div className="flex items-center text-yellow-700">
                      <Clock className="h-4 w-4 mr-2" />
                      <span className="font-medium">Video Job Pending</span>
                    </div>
                    <div className="text-sm text-yellow-700 mt-1">
                      Waiting to start video processing...
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Last Completed Job Summary */}
            {thumbnailStats?.lastCompletedJob && thumbnailStats.lastCompletedJob.id !== thumbnailJob?.id && (
              <div className="border-t pt-4">
                <h4 className="font-medium mb-3">Last Completed Job</h4>
                <div className="grid grid-cols-2 gap-4 text-sm p-3 bg-gray-50 rounded-lg">
                  <div>
                    <span className="text-muted-foreground">Processed:</span>
                    <div className="font-medium">{thumbnailStats.lastCompletedJob.processedPhotos} photos</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Created:</span>
                    <div className="font-medium">{thumbnailStats.lastCompletedJob.thumbnailsCreated} thumbnails</div>
                  </div>
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Duration:</span>
                    <span className="ml-2">
                      {formatDuration(thumbnailStats.lastCompletedJob.startedAt, thumbnailStats.lastCompletedJob.completedAt)}
                    </span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-muted-foreground">Completed:</span>
                    <span className="ml-2">{formatDate(thumbnailStats.lastCompletedJob.completedAt)}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Action Buttons */}
            <div className="space-y-4 pt-4 border-t">
              {/* Processing Options */}
              <div className="border rounded-lg p-4">
                <h5 className="font-medium mb-3 text-sm text-muted-foreground">Processing Options</h5>
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <input
                      type="checkbox"
                      id="thumbnail-parallel-processing"
                      checked={useThumbnailParallelProcessing}
                      onChange={(e) => setUseThumbnailParallelProcessing(e.target.checked)}
                      className="rounded border-gray-300"
                    />
                    <label htmlFor="thumbnail-parallel-processing" className="text-sm font-medium">
                      Use parallel processing for thumbnails (recommended)
                    </label>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Parallel processing utilizes {Math.max(1, navigator.hardwareConcurrency - 1)} CPU cores for faster thumbnail generation
                  </p>
                </div>
              </div>
              
              {/* Photo Thumbnails Section */}
              <div className="border rounded-lg p-4">
                <h5 className="font-medium mb-3 text-sm text-muted-foreground">Photo Thumbnails</h5>
                {thumbQueue && (
                  <div className="mb-4 grid grid-cols-2 md:grid-cols-6 gap-2 text-center">
                    <div className="p-2 rounded border bg-white">
                      <div className="text-xs text-muted-foreground">Waiting</div>
                      <div className="text-lg font-semibold">{thumbQueue.waiting}</div>
                    </div>
                    <div className="p-2 rounded border bg-white">
                      <div className="text-xs text-muted-foreground">Active</div>
                      <div className="text-lg font-semibold">{thumbQueue.active}</div>
                    </div>
                    <div className="p-2 rounded border bg-white">
                      <div className="text-xs text-muted-foreground">Completed</div>
                      <div className="text-lg font-semibold">{thumbQueue.completed}</div>
                    </div>
                    <div className="p-2 rounded border bg-white">
                      <div className="text-xs text-muted-foreground">Failed</div>
                      <div className="text-lg font-semibold">{thumbQueue.failed}</div>
                    </div>
                    <div className="p-2 rounded border bg-white">
                      <div className="text-xs text-muted-foreground">Delayed</div>
                      <div className="text-lg font-semibold">{thumbQueue.delayed}</div>
                    </div>
                    <div className="p-2 rounded border bg-white">
                      <div className="text-xs text-muted-foreground">Paused</div>
                      <div className="text-lg font-semibold">{thumbQueue.paused}</div>
                    </div>
                  </div>
                )}
                <div className="flex gap-3 flex-wrap">
                  <Button
                    onClick={handleStartThumbnailJob}
                    disabled={thumbnailJobLoading || videoThumbnailJobLoading || isActiveThumb || videoThumbnailJob?.status === 'RUNNING' || isPausedThumb}
                    className="flex items-center space-x-2"
                  >
                    <Play className="h-4 w-4" />
                    <span>
                      {isActiveThumb 
                        ? 'Processing Photos...' 
                        : thumbnailStats?.photosWithoutThumbnails === 0
                        ? 'Reprocess All Photos'
                        : `Process ${thumbnailStats?.photosWithoutThumbnails || 0} Photos`
                      }
                    </span>
                  </Button>

                  {isActiveThumb && (
                    <Button
                      onClick={handleStopThumbnailJob}
                      disabled={thumbnailJobLoading}
                      className="flex items-center space-x-2 bg-red-600 hover:bg-red-700 text-white"
                    >
                      <Pause className="h-4 w-4" />
                      <span>Stop Photos</span>
                    </Button>
                  )}

                  {isPausedThumb && (
                    <Button
                      onClick={handleResumeThumbnailJob}
                      disabled={thumbnailJobLoading}
                      className="flex items-center space-x-2 bg-green-600 hover:bg-green-700 text-white"
                    >
                      <Play className="h-4 w-4" />
                      <span>Resume Photos</span>
                    </Button>
                  )}

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        disabled={thumbnailJobLoading || videoThumbnailJobLoading || thumbnailJob?.status === 'RUNNING' || videoThumbnailJob?.status === 'RUNNING'}
                        className="flex items-center space-x-2 bg-orange-600 hover:bg-orange-700 text-white"
                      >
                        <Trash2 className="h-4 w-4" />
                        <span>Reprocess All Photos</span>
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Reprocess All Photo Thumbnails</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to reprocess all photo thumbnails? This will:
                          <br />
                          • Delete all existing photo thumbnails from storage
                          <br />
                          • Generate new thumbnails for all {thumbnailStats?.totalPhotos || 0} photos
                          <br />
                          <br />
                          This operation may take a long time and cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={handleReprocessThumbnails}
                          className="bg-orange-600 hover:bg-orange-700"
                        >
                          Reprocess Photo Thumbnails
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>

              {/* Video Thumbnails Section */}
              <div className="border rounded-lg p-4">
                <h5 className="font-medium mb-3 text-sm text-muted-foreground">Video Thumbnails</h5>
                <div className="flex gap-3 flex-wrap">
                  <Button
                    onClick={handleStartVideoThumbnailJob}
                    disabled={thumbnailJobLoading || videoThumbnailJobLoading || thumbnailJob?.status === 'RUNNING' || videoThumbnailJob?.status === 'RUNNING'}
                    className="flex items-center space-x-2"
                  >
                    <Play className="h-4 w-4" />
                    <span>
                      {videoThumbnailJob?.status === 'RUNNING' 
                        ? 'Processing Videos...' 
                        : thumbnailStats?.videosWithoutThumbnails === 0
                        ? 'Reprocess All Videos'
                        : `Process ${thumbnailStats?.videosWithoutThumbnails || 0} Videos`
                      }
                    </span>
                  </Button>

                  {videoThumbnailJob?.status === 'RUNNING' && (
                    <Button
                      onClick={handleStopVideoThumbnailJob}
                      disabled={videoThumbnailJobLoading}
                      className="flex items-center space-x-2 bg-red-600 hover:bg-red-700 text-white"
                    >
                      <Pause className="h-4 w-4" />
                      <span>Stop Videos</span>
                    </Button>
                  )}

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        disabled={thumbnailJobLoading || videoThumbnailJobLoading || thumbnailJob?.status === 'RUNNING' || videoThumbnailJob?.status === 'RUNNING'}
                        className="flex items-center space-x-2 bg-orange-600 hover:bg-orange-700 text-white"
                      >
                        <Trash2 className="h-4 w-4" />
                        <span>Reprocess All Videos</span>
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Reprocess All Video Thumbnails</AlertDialogTitle>
                        <AlertDialogDescription>
                          Are you sure you want to reprocess all video thumbnails? This will:
                          <br />
                          • Delete all existing video thumbnails from storage
                          <br />
                          • Generate new thumbnails for all {thumbnailStats?.totalVideos || 0} videos
                          <br />
                          <br />
                          This operation may take a long time and cannot be undone.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={handleReprocessVideoThumbnails}
                          className="bg-orange-600 hover:bg-orange-700"
                        >
                          Reprocess Video Thumbnails
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>

              {/* Global Actions */}
              <div className="border rounded-lg p-4">
                <h5 className="font-medium mb-3 text-sm text-muted-foreground">System Actions</h5>
                <div className="flex gap-3 flex-wrap">
                  <Button
                    onClick={handleCleanupJobs}
                    disabled={thumbnailJobLoading || videoThumbnailJobLoading}
                    className="flex items-center space-x-2 bg-gray-600 hover:bg-gray-700 text-white"
                  >
                    <Trash2 className="h-4 w-4" />
                    <span>Cleanup Stuck Jobs</span>
                  </Button>
                  
                  <Button
                    onClick={() => {
                      fetchThumbnailJobs()
                      fetchVideoThumbnailJobs()
                      fetchThumbnailStats()
                    }}
                    className="flex items-center space-x-2 border border-input bg-background hover:bg-accent hover:text-accent-foreground"
                  >
                    <RotateCcw className="h-4 w-4" />
                    <span>Refresh</span>
                  </Button>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

      </div>
    </div>
  )
}
