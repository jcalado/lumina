'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { RefreshCw, Download, Trash2, CheckCircle, AlertCircle, Clock, Search, FileText, Database, Cloud } from "lucide-react"
import { useToast } from "@/hooks/use-toast"

interface Album {
  id: string
  name: string
  path: string
  syncedToS3: boolean
  localFilesSafeDelete: boolean
  lastSyncAt: string | null
  photoCount: number
}

interface AlbumComparison {
  albumName: string
  albumPath: string
  localFiles: string[]
  s3Files: string[]
  databaseFiles: string[]
  localOnly: string[]
  s3Only: string[]
  databaseOnly: string[]
  missing: {
    localMissingFromS3: string[]
    localMissingFromDB: string[]
    s3MissingFromLocal: string[]
    s3MissingFromDB: string[]
    dbMissingFromLocal: string[]
    dbMissingFromS3: string[]
  }
  detailedComparison: Array<{
    filename: string
    localSize?: number
    dbSize?: number
    localModified?: string
    dbCreated?: string
    s3Key?: string
    localError?: string
  }>
  summary: {
    totalLocal: number
    totalS3: number
    totalDatabase: number
    inconsistencies: number
  }
  errors: string[]
}

interface SyncJob {
  id: string
  status: string
  progress: number
  albumProgress: any
  totalAlbums: number
  completedAlbums: number
  filesProcessed: number
  filesUploaded: number
  startedAt: string | null
  completedAt: string | null
  errors: string | null
  logs: Array<{timestamp: string, level: string, message: string, details?: any}>
}

export default function SyncPage() {
  const [albums, setAlbums] = useState<Album[]>([])
  const [currentSync, setCurrentSync] = useState<SyncJob | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSyncing, setIsSyncing] = useState(false)
  const [comparingAlbums, setComparingAlbums] = useState<Set<string>>(new Set())
  const [albumComparisons, setAlbumComparisons] = useState<Map<string, AlbumComparison>>(new Map())
  const [showComparisons, setShowComparisons] = useState(false)
  const { toast } = useToast()

  const fetchData = async () => {
    try {
      const [albumsRes, syncRes] = await Promise.all([
        fetch('/api/admin/albums'),
        fetch('/api/admin/sync/status')
      ])
      
      const albumsData = await albumsRes.json()
      const syncData = await syncRes.json()
      
      setAlbums(albumsData.albums || [])
      setCurrentSync(syncData.currentJob)
    } catch (error) {
      console.error('Error fetching data:', error)
      toast({
        title: "Error",
        description: "Failed to fetch sync data",
        variant: "destructive"
      })
    } finally {
      setIsLoading(false)
    }
  }

  const startSync = async () => {
    setIsSyncing(true)
    try {
      const response = await fetch('/api/sync', { method: 'POST' })
      if (response.ok) {
        toast({
          title: "Sync Started",
          description: "Photo sync has been initiated"
        })
        fetchData()
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to start sync",
        variant: "destructive"
      })
    } finally {
      setIsSyncing(false)
    }
  }

  const deleteLocalFiles = async (albumId: string) => {
    try {
      const response = await fetch(`/api/admin/albums/${albumId}/delete-local`, {
        method: 'POST'
      })
      
      if (response.ok) {
        toast({
          title: "Success",
          description: "Local files deleted successfully"
        })
        fetchData()
      } else {
        throw new Error('Failed to delete local files')
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to delete local files",
        variant: "destructive"
      })
    }
  }

  const compareAlbum = async (albumId: string) => {
    setComparingAlbums(prev => new Set([...prev, albumId]))
    
    try {
      const response = await fetch(`/api/admin/albums/${albumId}/compare`, {
        method: 'POST'
      })
      
      const data = await response.json()
      
      if (data.success) {
        setAlbumComparisons(prev => new Map([...prev, [albumId, data.comparison]]))
        setShowComparisons(true)
        
        // If album was marked as safe to delete, refresh the albums list
        if (data.albumUpdated) {
          await fetchData()
          toast({
            title: "Album Updated",
            description: `Comparison complete with no inconsistencies. Album marked as safe to delete.`
          })
        } else {
          toast({
            title: "Comparison Complete",
            description: `Found ${data.comparison.summary.inconsistencies} inconsistencies`
          })
        }
      } else {
        throw new Error(data.error || 'Comparison failed')
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to compare album",
        variant: "destructive"
      })
    } finally {
      setComparingAlbums(prev => {
        const newSet = new Set(prev)
        newSet.delete(albumId)
        return newSet
      })
    }
  }

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 2000) // Poll every 2 seconds
    return () => clearInterval(interval)
  }, [])

  if (isLoading) {
    return <div className="flex items-center justify-center h-64">Loading...</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Sync Management</h1>
          <p className="text-muted-foreground">Monitor photo sync progress and manage local files</p>
        </div>
        <Button 
          onClick={startSync} 
          disabled={isSyncing || currentSync?.status === 'RUNNING'}
        >
          <RefreshCw className={`h-4 w-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
          {isSyncing ? 'Starting...' : 'Sync Now'}
        </Button>
      </div>

      {/* Current Sync Status */}
      {currentSync && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              Current Sync Job
              <span className={`inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${
                currentSync.status === 'RUNNING' ? 'border-transparent bg-primary text-primary-foreground shadow hover:bg-primary/80' : 
                currentSync.status === 'COMPLETED' ? 'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80' : 
                'border-transparent bg-destructive text-destructive-foreground shadow hover:bg-destructive/80'
              }`}>
                {currentSync.status}
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Overall Progress</span>
                <span>{currentSync.progress}%</span>
              </div>
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
                  style={{ width: `${currentSync.progress}%` }}
                ></div>
              </div>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
              <div>
                <p className="text-muted-foreground">Albums</p>
                <p className="font-medium">{currentSync.completedAlbums}/{currentSync.totalAlbums}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Files Processed</p>
                <p className="font-medium">{currentSync.filesProcessed}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Files Uploaded</p>
                <p className="font-medium">{currentSync.filesUploaded}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Started</p>
                <p className="font-medium">
                  {currentSync.startedAt ? new Date(currentSync.startedAt).toLocaleTimeString() : 'N/A'}
                </p>
              </div>
            </div>

            {currentSync.errors && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-md">
                <p className="text-sm text-red-800">{currentSync.errors}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Sync Logs */}
      {currentSync && currentSync.logs && currentSync.logs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Sync Logs</CardTitle>
            <CardDescription>
              Detailed progress and issue tracking
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="max-h-96 overflow-y-auto space-y-2">
              {currentSync.logs.slice(-50).map((log, index) => (
                <div key={index} className={`p-2 rounded-md text-sm border-l-4 ${
                  log.level === 'error' ? 'bg-red-50 border-red-400 text-red-800' :
                  log.level === 'warn' ? 'bg-yellow-50 border-yellow-400 text-yellow-800' :
                  'bg-blue-50 border-blue-400 text-blue-800'
                }`}>
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="font-medium flex items-center gap-2">
                        {log.level === 'error' && <AlertCircle className="h-4 w-4" />}
                        {log.level === 'warn' && <AlertCircle className="h-4 w-4" />}
                        {log.level === 'info' && <CheckCircle className="h-4 w-4" />}
                        {log.message}
                      </div>
                      {log.details && (
                        <div className="mt-1 text-xs opacity-75">
                          {typeof log.details === 'string' ? log.details : JSON.stringify(log.details)}
                        </div>
                      )}
                    </div>
                    <div className="text-xs opacity-60 ml-2">
                      {new Date(log.timestamp).toLocaleTimeString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Album Issues Section */}
      {currentSync && currentSync.albumProgress && (
        <Card>
          <CardHeader>
            <CardTitle>Album Status Details</CardTitle>
            <CardDescription>
              Detailed status for each album with specific issues
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {Object.entries(currentSync.albumProgress).map(([albumPath, progress]: [string, any]) => (
                <div key={albumPath} className="border rounded-lg p-4">
                  <div className="flex items-start justify-between mb-2">
                    <h4 className="font-medium">{albumPath}</h4>
                    <span className={`px-2 py-1 rounded-md text-xs font-medium ${
                      progress.status === 'COMPLETED' ? 'bg-green-100 text-green-800' :
                      progress.status === 'ERROR' ? 'bg-red-100 text-red-800' :
                      'bg-blue-100 text-blue-800'
                    }`}>
                      {progress.status}
                    </span>
                  </div>
                  
                  {progress.photosTotal !== undefined && (
                    <div className="text-sm text-muted-foreground mb-2">
                      Photos: {progress.photosUploaded || 0}/{progress.photosTotal} uploaded
                    </div>
                  )}
                  
                  {progress.verificationNeeded && (
                    <div className="p-2 bg-yellow-50 border border-yellow-200 rounded-md text-sm text-yellow-800 mb-2">
                      <strong>Needs Verification:</strong> {progress.verificationNeeded}
                    </div>
                  )}
                  
                  {progress.issues && progress.issues.length > 0 && (
                    <div className="space-y-1">
                      <strong className="text-sm text-red-700">Issues:</strong>
                      {progress.issues.map((issue: string, idx: number) => (
                        <div key={idx} className="text-sm bg-red-50 border border-red-200 rounded p-2 text-red-700">
                          {issue}
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {progress.error && (
                    <div className="p-2 bg-red-50 border border-red-200 rounded-md text-sm text-red-800">
                      <strong>Error:</strong> {progress.error}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Help Section */}
      <Card>
        <CardHeader>
          <CardTitle>Understanding Album Status</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <h4 className="font-medium mb-2 flex items-center gap-2">
                <CheckCircle className="h-4 w-4 text-green-600" />
                Synced to S3
              </h4>
              <p className="text-sm text-muted-foreground">
                Album has been processed and files uploaded to S3 storage.
              </p>
            </div>
            
            <div>
              <h4 className="font-medium mb-2 flex items-center gap-2">
                <Download className="h-4 w-4 text-blue-600" />
                Safe to Delete Local
              </h4>
              <p className="text-sm text-muted-foreground">
                All files confirmed uploaded successfully. Local files can be safely deleted.
              </p>
            </div>
            
            <div>
              <h4 className="font-medium mb-2 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-yellow-600" />
                Needs Verification
              </h4>
              <p className="text-sm text-muted-foreground">
                Album synced but some uploads failed or had issues. Check logs and re-run sync.
              </p>
            </div>
            
            <div>
              <h4 className="font-medium mb-2 flex items-center gap-2">
                <Clock className="h-4 w-4 text-gray-600" />
                Pending Sync
              </h4>
              <p className="text-sm text-muted-foreground">
                Album not yet synced. Click "Sync Now" to upload files to S3.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Comparison Results */}
      {showComparisons && albumComparisons.size > 0 && (
        <div className="bg-white rounded-lg border shadow">
          <div className="p-4 border-b">
            <div className="flex justify-between items-center">
              <div>
                <h2 className="text-lg font-semibold">Album Comparison Results</h2>
                <p className="text-sm text-muted-foreground">
                  Comparing albums across local filesystem, S3 storage, and database
                </p>
              </div>
              <Button 
                className="border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground"
                onClick={() => setShowComparisons(false)}
              >
                Hide Results
              </Button>
            </div>
          </div>
          
          <div className="p-4 space-y-6">
            {Array.from(albumComparisons.entries()).map(([albumId, comparison]) => (
              <div key={albumId} className="border rounded-lg p-4">
                <h3 className="text-md font-semibold mb-3">{comparison.albumName}</h3>
                
                {/* Summary Stats */}
                <div className="grid grid-cols-4 gap-4 mb-4">
                  <div className="text-center p-3 border rounded">
                    <FileText className="h-6 w-6 mx-auto mb-2 text-blue-500" />
                    <div className="text-2xl font-bold">{comparison.localFiles.length}</div>
                    <div className="text-sm text-muted-foreground">Local Files</div>
                  </div>
                  <div className="text-center p-3 border rounded">
                    <Cloud className="h-6 w-6 mx-auto mb-2 text-green-500" />
                    <div className="text-2xl font-bold">{comparison.s3Files.length}</div>
                    <div className="text-sm text-muted-foreground">S3 Files</div>
                  </div>
                  <div className="text-center p-3 border rounded">
                    <Database className="h-6 w-6 mx-auto mb-2 text-purple-500" />
                    <div className="text-2xl font-bold">{comparison.databaseFiles.length}</div>
                    <div className="text-sm text-muted-foreground">Database Records</div>
                  </div>
                  <div className="text-center p-3 border rounded">
                    <AlertCircle className="h-6 w-6 mx-auto mb-2 text-red-500" />
                    <div className="text-2xl font-bold">
                      {comparison.localOnly.length + comparison.s3Only.length + comparison.databaseOnly.length +
                       (comparison.missing?.localMissingFromS3?.length || 0) +
                       (comparison.missing?.s3MissingFromLocal?.length || 0) +
                       (comparison.missing?.dbMissingFromLocal?.length || 0) +
                       (comparison.missing?.dbMissingFromS3?.length || 0)}
                    </div>
                    <div className="text-sm text-muted-foreground">Issues Found</div>
                  </div>
                </div>

                {/* Check for any inconsistencies */}
                {(() => {
                  const hasInconsistencies = comparison.localOnly.length > 0 || 
                                           comparison.s3Only.length > 0 || 
                                           comparison.databaseOnly.length > 0 ||
                                           (comparison.missing?.localMissingFromS3?.length || 0) > 0 ||
                                           (comparison.missing?.s3MissingFromLocal?.length || 0) > 0 ||
                                           (comparison.missing?.dbMissingFromLocal?.length || 0) > 0 ||
                                           (comparison.missing?.dbMissingFromS3?.length || 0) > 0
                  
                  return hasInconsistencies ? (
                    <div className="space-y-3">
                      <h4 className="text-md font-semibold text-red-700">Found Issues</h4>
                      
                      {comparison.localOnly.length > 0 && (
                        <div className="p-3 border border-red-200 rounded bg-red-50">
                          <div className="font-medium text-red-800">Files Only in Local ({comparison.localOnly.length})</div>
                          <div className="text-sm text-red-700 mt-1">
                            These files exist locally but are missing from S3 and database
                          </div>
                          <div className="text-xs text-red-600 mt-2 max-h-32 overflow-y-auto">
                            {comparison.localOnly.slice(0, 5).map((file, idx) => (
                              <div key={idx}>{file}</div>
                            ))}
                            {comparison.localOnly.length > 5 && (
                              <div>... and {comparison.localOnly.length - 5} more</div>
                            )}
                          </div>
                        </div>
                      )}

                      {comparison.s3Only.length > 0 && (
                        <div className="p-3 border border-yellow-200 rounded bg-yellow-50">
                          <div className="font-medium text-yellow-800">Files Only in S3 ({comparison.s3Only.length})</div>
                          <div className="text-sm text-yellow-700 mt-1">
                            These files exist in S3 but are missing from local filesystem and database
                          </div>
                          <div className="text-xs text-yellow-600 mt-2 max-h-32 overflow-y-auto">
                            {comparison.s3Only.slice(0, 5).map((file, idx) => (
                              <div key={idx}>{file}</div>
                            ))}
                            {comparison.s3Only.length > 5 && (
                              <div>... and {comparison.s3Only.length - 5} more</div>
                            )}
                          </div>
                        </div>
                      )}

                      {comparison.databaseOnly.length > 0 && (
                        <div className="p-3 border border-purple-200 rounded bg-purple-50">
                          <div className="font-medium text-purple-800">Files Only in Database ({comparison.databaseOnly.length})</div>
                          <div className="text-sm text-purple-700 mt-1">
                            These files exist in database but are missing from local filesystem and S3
                          </div>
                          <div className="text-xs text-purple-600 mt-2 max-h-32 overflow-y-auto">
                            {comparison.databaseOnly.slice(0, 5).map((file, idx) => (
                              <div key={idx}>{file}</div>
                            ))}
                            {comparison.databaseOnly.length > 5 && (
                              <div>... and {comparison.databaseOnly.length - 5} more</div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Missing files between locations */}
                      {(comparison.missing?.localMissingFromS3?.length || 0) > 0 && (
                        <div className="p-3 border border-orange-200 rounded bg-orange-50">
                          <div className="font-medium text-orange-800">Local Files Missing from S3 ({comparison.missing.localMissingFromS3.length})</div>
                          <div className="text-sm text-orange-700 mt-1">
                            These files exist locally and in database but are missing from S3
                          </div>
                          <div className="text-xs text-orange-600 mt-2 max-h-32 overflow-y-auto">
                            {comparison.missing.localMissingFromS3.slice(0, 5).map((file, idx) => (
                              <div key={idx}>{file}</div>
                            ))}
                            {comparison.missing.localMissingFromS3.length > 5 && (
                              <div>... and {comparison.missing.localMissingFromS3.length - 5} more</div>
                            )}
                          </div>
                        </div>
                      )}

                      {(comparison.missing?.dbMissingFromS3?.length || 0) > 0 && (
                        <div className="p-3 border border-blue-200 rounded bg-blue-50">
                          <div className="font-medium text-blue-800">Database Records Missing from S3 ({comparison.missing.dbMissingFromS3.length})</div>
                          <div className="text-sm text-blue-700 mt-1">
                            These files exist in database but are missing from S3
                          </div>
                          <div className="text-xs text-blue-600 mt-2 max-h-32 overflow-y-auto">
                            {comparison.missing.dbMissingFromS3.slice(0, 5).map((file, idx) => (
                              <div key={idx}>{file}</div>
                            ))}
                            {comparison.missing.dbMissingFromS3.length > 5 && (
                              <div>... and {comparison.missing.dbMissingFromS3.length - 5} more</div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="p-4 bg-green-50 border border-green-200 rounded">
                      <div className="flex items-center gap-2">
                        <CheckCircle className="h-5 w-5 text-green-600" />
                        <div className="text-green-800 font-medium">All files match perfectly!</div>
                      </div>
                      <div className="text-sm text-green-700 mt-1">
                        Local files, S3 storage, and database records are all in sync.
                      </div>
                      <div className="text-xs text-green-600 mt-2 p-2 bg-green-100 rounded">
                        ✓ This album has been automatically marked as safe for local file deletion.
                      </div>
                    </div>
                  )
                })()}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Albums List */}
      <div className="grid gap-4">
        <h2 className="text-xl font-semibold">Albums</h2>
        {albums.map((album) => (
          <Card key={album.id}>
            <CardContent className="p-6">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-3">
                    <h3 className="font-medium">{album.name}</h3>
                    <div className="flex gap-2">
                      {album.syncedToS3 && (
                        <span className="inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80 text-green-700 bg-green-50">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Synced to S3
                        </span>
                      )}
                      {album.localFilesSafeDelete && (
                        <span className="inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold text-foreground text-blue-700 bg-blue-50">
                          <Download className="h-3 w-3 mr-1" />
                          Safe to Delete Local
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground mt-1">{album.path}</p>
                  <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                    <span>{album.photoCount} photos</span>
                    {album.lastSyncAt && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Last sync: {new Date(album.lastSyncAt).toLocaleString()}
                      </span>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <Button 
                    className="border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-8 rounded-md px-3 text-xs"
                    onClick={() => compareAlbum(album.id)}
                    disabled={comparingAlbums.has(album.id)}
                  >
                    <Search className="h-4 w-4 mr-2" />
                    {comparingAlbums.has(album.id) ? 'Comparing...' : 'Compare'}
                  </Button>
                  
                  {album.localFilesSafeDelete ? (
                    <Button 
                      className="bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90 h-8 rounded-md px-3 text-xs"
                      onClick={() => deleteLocalFiles(album.id)}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete Local Files
                    </Button>
                  ) : (
                    <div className="flex flex-col gap-1 text-sm text-muted-foreground">
                      {album.syncedToS3 ? (
                        <div className="flex items-center gap-2">
                          <AlertCircle className="h-4 w-4 text-yellow-500" />
                          <div>
                            <div className="font-medium text-yellow-700">Needs Verification</div>
                            <div className="text-xs">
                              Album synced but some files may have failed upload.
                              Check sync logs for details and re-run sync to resolve.
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <Clock className="h-4 w-4 text-blue-500" />
                          <div>
                            <div className="font-medium text-blue-700">Pending Sync</div>
                            <div className="text-xs">
                              Album has not been synced yet. Run sync to upload files to S3.
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  )
}
