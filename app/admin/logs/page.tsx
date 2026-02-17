"use client"

import { useState, useEffect } from "react"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { RefreshCw, Download, Trash2, Eye, Calendar, Clock, AlertCircle, CheckCircle, Info, AlertTriangle, Image } from "lucide-react"
import { toast } from "@/hooks/use-toast"

interface LogEntry {
  id: string
  timestamp: string
  level: 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS'
  message: string
  details?: string
  jobId?: string
}

interface BlurhashJobLog {
  id: string
  status: string
  createdAt: string
  startedAt: string | null
  completedAt: string | null
  logs: string | null
  errors: string | null
  progress: number
  photosProcessed: number
  totalPhotos: number
}

interface ThumbnailJobLog {
  id: string
  status: string
  createdAt: string
  startedAt: string | null
  completedAt: string | null
  logs: string | null
  errors: string | null
  progress: number
  processedPhotos: number
  totalPhotos: number
  thumbnailsCreated: number
}

export default function LogsPage() {
  const [blurhashLogs, setBlurhashLogs] = useState<LogEntry[]>([])
  const [thumbnailLogs, setThumbnailLogs] = useState<LogEntry[]>([])
  const [blurhashJobs, setBlurhashJobs] = useState<BlurhashJobLog[]>([])
  const [thumbnailJobs, setThumbnailJobs] = useState<ThumbnailJobLog[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)

  useEffect(() => {
    fetchLogs()
  }, [])

  const fetchLogs = async () => {
    try {
      setRefreshing(true)
      
      // Fetch blurhash job logs
      const blurhashResponse = await fetch("/api/admin/blurhash")
      if (blurhashResponse.ok) {
        const blurhashData = await blurhashResponse.json()
        setBlurhashJobs(blurhashData.jobs || [])
        
        // Parse logs from jobs
        const parsedBlurhashLogs: LogEntry[] = []
        
        blurhashData.jobs?.forEach((job: BlurhashJobLog) => {
          // Add job creation log
          parsedBlurhashLogs.push({
            id: `${job.id}-created`,
            timestamp: job.createdAt,
            level: 'INFO',
            message: `Blurhash job created`,
            details: `Job ID: ${job.id}`,
            jobId: job.id
          })
          
          // Add job start log
          if (job.startedAt) {
            parsedBlurhashLogs.push({
              id: `${job.id}-started`,
              timestamp: job.startedAt,
              level: 'INFO',
              message: `Blurhash job started`,
              details: `Processing ${job.totalPhotos} photos`,
              jobId: job.id
            })
          }
          
          // Add progress logs from job logs
          if (job.logs) {
            try {
              const logLines = job.logs.split('\n').filter(line => line.trim())
              logLines.forEach((line, index) => {
                const timestamp = job.startedAt || job.createdAt
                const logTime = new Date(timestamp)
                logTime.setSeconds(logTime.getSeconds() + index)
                
                let level: 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS' = 'INFO'
                if (line.toLowerCase().includes('error') || line.toLowerCase().includes('failed')) {
                  level = 'ERROR'
                } else if (line.toLowerCase().includes('warning') || line.toLowerCase().includes('warn')) {
                  level = 'WARN'
                } else if (line.toLowerCase().includes('completed') || line.toLowerCase().includes('success')) {
                  level = 'SUCCESS'
                }
                
                parsedBlurhashLogs.push({
                  id: `${job.id}-log-${index}`,
                  timestamp: logTime.toISOString(),
                  level,
                  message: line,
                  jobId: job.id
                })
              })
            } catch (error) {
              console.error('Error parsing job logs:', error)
            }
          }
          
          // Add error logs
          if (job.errors) {
            try {
              const errorLines = job.errors.split('\n').filter(line => line.trim())
              errorLines.forEach((line, index) => {
                const timestamp = job.startedAt || job.createdAt
                const errorTime = new Date(timestamp)
                errorTime.setSeconds(errorTime.getSeconds() + index + 1000) // Offset errors
                
                parsedBlurhashLogs.push({
                  id: `${job.id}-error-${index}`,
                  timestamp: errorTime.toISOString(),
                  level: 'ERROR',
                  message: line,
                  jobId: job.id
                })
              })
            } catch (error) {
              console.error('Error parsing job errors:', error)
            }
          }
          
          // Add completion log
          if (job.completedAt) {
            parsedBlurhashLogs.push({
              id: `${job.id}-completed`,
              timestamp: job.completedAt,
              level: job.status === 'COMPLETED' ? 'SUCCESS' : 'ERROR',
              message: `Blurhash job ${job.status.toLowerCase()}`,
              details: `Processed ${job.photosProcessed} of ${job.totalPhotos} photos`,
              jobId: job.id
            })
          }
        })
        
        // Sort logs by timestamp (newest first)
        parsedBlurhashLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        setBlurhashLogs(parsedBlurhashLogs)
      }

      // Fetch thumbnail job logs
      const thumbnailResponse = await fetch("/api/admin/thumbnails")
      if (thumbnailResponse.ok) {
        const thumbnailData = await thumbnailResponse.json()
        setThumbnailJobs(thumbnailData.jobs || [])
        
        // Parse logs from thumbnail jobs
        const parsedThumbnailLogs: LogEntry[] = []
        
        thumbnailData.jobs?.forEach((job: ThumbnailJobLog) => {
          // Add job creation log
          parsedThumbnailLogs.push({
            id: `${job.id}-created`,
            timestamp: job.createdAt,
            level: 'INFO',
            message: `Thumbnail job created`,
            details: `Job ID: ${job.id}`,
            jobId: job.id
          })
          
          // Add job start log
          if (job.startedAt) {
            parsedThumbnailLogs.push({
              id: `${job.id}-started`,
              timestamp: job.startedAt,
              level: 'INFO',
              message: `Thumbnail job started`,
              details: `Processing ${job.totalPhotos} photos`,
              jobId: job.id
            })
          }
          
          // Add progress logs from job logs
          if (job.logs) {
            try {
              const logLines = job.logs.split('\n').filter(line => line.trim())
              logLines.forEach((line, index) => {
                const timestamp = job.startedAt || job.createdAt
                const logTime = new Date(timestamp)
                logTime.setSeconds(logTime.getSeconds() + index)
                
                let level: 'INFO' | 'WARN' | 'ERROR' | 'SUCCESS' = 'INFO'
                if (line.toLowerCase().includes('error') || line.toLowerCase().includes('failed')) {
                  level = 'ERROR'
                } else if (line.toLowerCase().includes('warning') || line.toLowerCase().includes('warn')) {
                  level = 'WARN'
                } else if (line.toLowerCase().includes('completed') || line.toLowerCase().includes('success')) {
                  level = 'SUCCESS'
                }
                
                parsedThumbnailLogs.push({
                  id: `${job.id}-log-${index}`,
                  timestamp: logTime.toISOString(),
                  level,
                  message: line,
                  jobId: job.id
                })
              })
            } catch (error) {
              console.error('Error parsing thumbnail job logs:', error)
            }
          }
          
          // Add error logs
          if (job.errors) {
            try {
              const errorLines = JSON.parse(job.errors).filter((line: string) => line.trim())
              errorLines.forEach((line: string, index: number) => {
                const timestamp = job.startedAt || job.createdAt
                const errorTime = new Date(timestamp)
                errorTime.setSeconds(errorTime.getSeconds() + index + 1000) // Offset errors
                
                parsedThumbnailLogs.push({
                  id: `${job.id}-error-${index}`,
                  timestamp: errorTime.toISOString(),
                  level: 'ERROR',
                  message: line,
                  jobId: job.id
                })
              })
            } catch (error) {
              console.error('Error parsing thumbnail job errors:', error)
            }
          }
          
          // Add completion log
          if (job.completedAt) {
            parsedThumbnailLogs.push({
              id: `${job.id}-completed`,
              timestamp: job.completedAt,
              level: job.status === 'COMPLETED' ? 'SUCCESS' : 'ERROR',
              message: `Thumbnail job ${job.status.toLowerCase()}`,
              details: `Processed ${job.processedPhotos} of ${job.totalPhotos} photos, created ${job.thumbnailsCreated} thumbnails`,
              jobId: job.id
            })
          }
        })
        
        // Sort logs by timestamp (newest first)
        parsedThumbnailLogs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        setThumbnailLogs(parsedThumbnailLogs)
      }

    } catch (error) {
      console.error('Error fetching logs:', error)
      toast({
        title: "Error",
        description: "Failed to fetch logs",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const clearBlurhashLogs = async () => {
    try {
      const response = await fetch("/api/admin/blurhash", {
        method: "DELETE"
      })

      if (response.ok) {
        setBlurhashLogs([])
        setBlurhashJobs([])
        toast({
          title: "Success",
          description: "Blurhash logs cleared"
        })
      } else {
        throw new Error("Failed to clear logs")
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to clear logs",
        variant: "destructive"
      })
    }
  }

  const clearThumbnailLogs = async () => {
    try {
      const response = await fetch("/api/admin/thumbnails", {
        method: "DELETE"
      })

      if (response.ok) {
        setThumbnailLogs([])
        setThumbnailJobs([])
        toast({
          title: "Success",
          description: "Thumbnail logs cleared"
        })
      } else {
        throw new Error("Failed to clear thumbnail logs")
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to clear thumbnail logs",
        variant: "destructive"
      })
    }
  }

  const downloadLogs = (logs: LogEntry[], filename: string) => {
    const logText = logs.map(log => {
      const timestamp = new Date(log.timestamp).toLocaleString()
      const details = log.details ? ` | ${log.details}` : ''
      return `[${timestamp}] [${log.level}] ${log.message}${details}`
    }).join('\n')

    const blob = new Blob([logText], { type: 'text/plain' })
    const url = window.URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    window.URL.revokeObjectURL(url)
  }

  const formatTimestamp = (timestamp: string) => {
    return new Date(timestamp).toLocaleString()
  }

  const getLogIcon = (level: string) => {
    switch (level) {
      case 'ERROR':
        return <AlertCircle className="h-4 w-4 text-red-500" />
      case 'WARN':
        return <AlertTriangle className="h-4 w-4 text-yellow-500" />
      case 'SUCCESS':
        return <CheckCircle className="h-4 w-4 text-green-500" />
      default:
        return <Info className="h-4 w-4 text-blue-500" />
    }
  }

  const getBadgeVariant = (level: string) => {
    switch (level) {
      case 'ERROR':
        return 'destructive'
      case 'WARN':
        return 'secondary'
      case 'SUCCESS':
        return 'default'
      default:
        return 'outline'
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary mx-auto"></div>
          <p className="mt-2 text-muted-foreground">Loading logs...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Logs</h1>
          <p className="text-muted-foreground">View system logs and job execution details</p>
        </div>
        <Button onClick={fetchLogs} disabled={refreshing}>
          <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </div>

      {/* Blurhash Worker Logs */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Eye className="h-5 w-5" />
                Blurhash Worker Logs
              </CardTitle>
              <CardDescription>
                Logs from blurhash generation jobs and worker processes
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => downloadLogs(blurhashLogs, 'blurhash-logs.txt')}
                disabled={blurhashLogs.length === 0}
              >
                <Download className="h-4 w-4 mr-2" />
                Download
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={clearBlurhashLogs}
                disabled={blurhashLogs.length === 0}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Clear
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {blurhashLogs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Eye className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No blurhash logs available</p>
              <p className="text-sm">Logs will appear here when blurhash jobs are executed</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {blurhashLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                >
                  <div className="flex-shrink-0 mt-0.5">
                    {getLogIcon(log.level)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant={getBadgeVariant(log.level)} className="text-xs">
                        {log.level}
                      </Badge>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {formatTimestamp(log.timestamp)}
                      </div>
                      {log.jobId && (
                        <Badge variant="outline" className="text-xs">
                          Job: {log.jobId.slice(-8)}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm font-medium text-foreground break-words">
                      {log.message}
                    </p>
                    {log.details && (
                      <p className="text-xs text-muted-foreground mt-1 break-words">
                        {log.details}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Thumbnail Worker Logs */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Image className="h-5 w-5" />
                Thumbnail Worker Logs
              </CardTitle>
              <CardDescription>
                Logs from thumbnail generation jobs and worker processes
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => downloadLogs(thumbnailLogs, 'thumbnail-logs.txt')}
                disabled={thumbnailLogs.length === 0}
              >
                <Download className="h-4 w-4 mr-2" />
                Download
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={clearThumbnailLogs}
                disabled={thumbnailLogs.length === 0}
              >
                <Trash2 className="h-4 w-4 mr-2" />
                Clear
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {thumbnailLogs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Image className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>No thumbnail logs available</p>
              <p className="text-sm">Logs will appear here when thumbnail jobs are executed</p>
            </div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {thumbnailLogs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-muted/50 transition-colors"
                >
                  <div className="flex-shrink-0 mt-0.5">
                    {getLogIcon(log.level)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge variant={getBadgeVariant(log.level)} className="text-xs">
                        {log.level}
                      </Badge>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Clock className="h-3 w-3" />
                        {formatTimestamp(log.timestamp)}
                      </div>
                      {log.jobId && (
                        <Badge variant="outline" className="text-xs">
                          Job: {log.jobId.slice(-8)}
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm font-medium text-foreground break-words">
                      {log.message}
                    </p>
                    {log.details && (
                      <p className="text-xs text-muted-foreground mt-1 break-words">
                        {log.details}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Job Summary */}
      {blurhashJobs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Recent Blurhash Jobs
            </CardTitle>
            <CardDescription>
              Summary of recent blurhash generation jobs
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {blurhashJobs.slice(0, 5).map((job) => (
                <div
                  key={job.id}
                  className="flex items-center justify-between p-3 rounded-lg border bg-card"
                >
                  <div className="flex items-center gap-3">
                    <Badge 
                      variant={
                        job.status === 'COMPLETED' ? 'default' :
                        job.status === 'FAILED' ? 'destructive' :
                        job.status === 'RUNNING' ? 'secondary' : 'outline'
                      }
                    >
                      {job.status}
                    </Badge>
                    <div>
                      <p className="text-sm font-medium">
                        Job {job.id.slice(-8)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatTimestamp(job.createdAt)}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">
                      {job.photosProcessed} / {job.totalPhotos}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {Math.round(job.progress)}% complete
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Thumbnail Jobs Summary */}
      {thumbnailJobs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Image className="h-5 w-5" />
              Recent Thumbnail Jobs
            </CardTitle>
            <CardDescription>
              Summary of recent thumbnail generation jobs
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {thumbnailJobs.slice(0, 5).map((job) => (
                <div
                  key={job.id}
                  className="flex items-center justify-between p-3 rounded-lg border bg-card"
                >
                  <div className="flex items-center gap-3">
                    <Badge 
                      variant={
                        job.status === 'COMPLETED' ? 'default' :
                        job.status === 'FAILED' ? 'destructive' :
                        job.status === 'RUNNING' ? 'secondary' : 'outline'
                      }
                    >
                      {job.status}
                    </Badge>
                    <div>
                      <p className="text-sm font-medium">
                        Job {job.id.slice(-8)}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatTimestamp(job.createdAt)}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium">
                      {job.processedPhotos} / {job.totalPhotos}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {Math.round(job.progress)}% complete
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {job.thumbnailsCreated} thumbnails created
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

    </div>
  )
}
