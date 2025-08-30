'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Progress } from "@/components/ui/progress"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog"
import { RefreshCw, Download, Trash2, CheckCircle, AlertCircle, Clock, Search, FileText, Database, Cloud, ChevronDown, ChevronRight, Folder, FolderOpen, X, AlertTriangle, CloudDownload, Plus, FolderPlus, Upload } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import { FileUploadModal } from "@/components/Admin/FileUploadModal"

interface AlbumTreeNode {
  path: string
  name: string
  depth: number
  album?: Album
  children: AlbumTreeNode[]
}

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

interface ReconciliationData {
  stats: {
    total: {
      filesystem: number
      database: number
      orphaned: number
      new: number
      synced: number
    }
    orphaned: {
      cleanupNeeded: number
      recoverable: number
      needsReview: number
    }
  }
  orphanedAlbums: Array<{
    id: string
    path: string
    name: string
    s3PhotoCount: number
    totalPhotoCount: number
    recommendedAction: 'cleanup' | 'recoverable' | 'review'
  }>
  summary: {
    hasIssues: boolean
    message: string
  }
}

export default function SyncPage() {
  const [albums, setAlbums] = useState<Album[]>([])
  const [currentSync, setCurrentSync] = useState<SyncJob | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSyncing, setIsSyncing] = useState(false)
  const [comparingAlbums, setComparingAlbums] = useState<Set<string>>(new Set())
  const [albumComparisons, setAlbumComparisons] = useState<Map<string, AlbumComparison>>(new Map())
  const [selectedComparisonAlbumId, setSelectedComparisonAlbumId] = useState<string | null>(null)
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(new Set())
  const [isHelpExpanded, setIsHelpExpanded] = useState(false)
  const [deleteConfirmation, setDeleteConfirmation] = useState<{ isOpen: boolean; album: Album | null }>({ isOpen: false, album: null })
  const [isDeletingLocal, setIsDeletingLocal] = useState(false)
  const [restoringAlbums, setRestoringAlbums] = useState<Set<string>>(new Set())
  const [restoreProgress, setRestoreProgress] = useState<Map<string, { current: number; total: number; message: string }>>(new Map())
  const [reconciliationData, setReconciliationData] = useState<ReconciliationData | null>(null)
  const [createAlbumModal, setCreateAlbumModal] = useState<{ isOpen: boolean; parentPath?: string; parentName?: string }>({ isOpen: false })
  const [fsAlbums, setFsAlbums] = useState<Array<{ path: string; name: string; counts?: { photos: number; videos: number; total: number } }>>([])
  const [selectedPaths, setSelectedPaths] = useState<Set<string>>(new Set())
  const [selectionInitialized, setSelectionInitialized] = useState(false)
  const [isCreatingAlbum, setIsCreatingAlbum] = useState(false)
  const [uploadModal, setUploadModal] = useState<{ isOpen: boolean; albumId: string; albumName: string }>({ isOpen: false, albumId: '', albumName: '' })
  const [isUpdatingFingerprints, setIsUpdatingFingerprints] = useState(false)
  const [isCancellingSync, setIsCancellingSync] = useState(false)
  const { toast } = useToast()

  const buildAlbumTree = (albums: Album[]): AlbumTreeNode[] => {
    const pathMap = new Map<string, AlbumTreeNode>()
    const roots: AlbumTreeNode[] = []

    // First, create all nodes
    albums.forEach(album => {
      const pathParts = album.path.split('/').filter(Boolean)
      let currentPath = ''
      
      pathParts.forEach((part, index) => {
        const depth = index
        currentPath = currentPath ? `${currentPath}/${part}` : part
        
        if (!pathMap.has(currentPath)) {
          const node: AlbumTreeNode = {
            path: currentPath,
            name: part,
            depth,
            children: [],
            album: currentPath === album.path ? album : undefined
          }
          pathMap.set(currentPath, node)
        } else if (currentPath === album.path) {
          // Update existing node with album data
          const node = pathMap.get(currentPath)!
          node.album = album
        }
      })
    })

    // Build the tree structure
    pathMap.forEach(node => {
      if (node.depth === 0) {
        roots.push(node)
      } else {
        const parentPath = node.path.substring(0, node.path.lastIndexOf('/'))
        const parent = pathMap.get(parentPath)
        if (parent) {
          parent.children.push(node)
        }
      }
    })

    // Sort children at each level
    const sortNodes = (nodes: AlbumTreeNode[]) => {
      nodes.sort((a, b) => a.name.localeCompare(b.name))
      nodes.forEach(node => sortNodes(node.children))
    }
    
    sortNodes(roots)
    return roots
  }

  const toggleNode = (path: string) => {
    setExpandedNodes(prev => {
      const newSet = new Set(prev)
      if (newSet.has(path)) {
        newSet.delete(path)
      } else {
        newSet.add(path)
      }
      return newSet
    })
  }

  const restoreLocalFiles = async (albumId: string, missingFiles: string[]) => {
    setRestoringAlbums(prev => new Set([...prev, albumId]))
    setRestoreProgress(prev => new Map(prev.set(albumId, { current: 0, total: missingFiles.length, message: 'Starting...' })))

    try {
      console.log(`[FRONTEND] Starting restore request for album ID: ${albumId}`)
      console.log(`[FRONTEND] Files to restore: ${missingFiles.length}`)
      
      const response = await fetch(`/api/admin/albums/${albumId}/restore-progress`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ missingFiles })
      })
      
      console.log(`[FRONTEND] Restore response status: ${response.status}`)
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        console.error(`[FRONTEND] Restore failed with status ${response.status}:`, errorData)
        throw new Error(errorData.error || `HTTP ${response.status}`)
      }

      // Handle streaming response
      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      if (!reader) {
        throw new Error('No response body reader available')
      }

      while (true) {
        const { done, value } = await reader.read()
        
        if (done) {
          break
        }

        // Decode the chunk and process SSE messages
        const chunk = decoder.decode(value, { stream: true })
        const lines = chunk.split('\n')
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))
              
              switch (data.type) {
                case 'progress':
                  setRestoreProgress(prev => new Map(prev.set(albumId, {
                    current: data.current,
                    total: data.total,
                    message: data.message
                  })))
                  break
                  
                case 'complete':
                  console.log(`[FRONTEND] Restore complete:`, data)
                  
                  toast({
                    title: "Success",
                    description: data.message || `Restored ${data.stats?.restored || 0} files successfully`
                  })
                  
                  // If there were failed files, show a warning
                  if (data.failedFiles && data.failedFiles.length > 0) {
                    toast({
                      title: "Warning",
                      description: `${data.failedFiles.length} files failed to restore. Check logs for details.`,
                      variant: "destructive"
                    })
                  }
                  
                  // If album was updated, show success message
                  if (data.albumUpdated) {
                    toast({
                      title: "Album Restored",
                      description: "Album is now complete and marked as safe for deletion."
                    })
                  }

                  // Refresh data and update comparison modal if it's open
                  await fetchData()
                  if (selectedComparisonAlbumId === albumId) {
                    await compareAlbum(albumId)
                  }
                  
                  break
                  
                case 'error':
                  console.error(`[FRONTEND] Restore error:`, data)
                  throw new Error(data.error || 'Unknown error during restoration')
              }
            } catch (parseError) {
              console.error('Error parsing SSE data:', parseError)
            }
          }
        }
      }
      
    } catch (error) {
      console.error('[FRONTEND] Error in restoreLocalFiles:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      toast({
        title: "Error",
        description: `Failed to restore files: ${errorMessage}`,
        variant: "destructive"
      })
    } finally {
      setRestoringAlbums(prev => {
        const newSet = new Set(prev)
        newSet.delete(albumId)
        return newSet
      })
      setRestoreProgress(prev => {
        const newMap = new Map(prev)
        newMap.delete(albumId)
        return newMap
      })
    }
  }

  const createAlbum = async (albumData: { name: string; description?: string; parentPath?: string }) => {
    setIsCreatingAlbum(true)
    
    try {
      console.log(`[FRONTEND] Creating album:`, albumData)
      
      const response = await fetch('/api/admin/albums/create', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(albumData)
      })
      
      const result = await response.json()
      
      if (response.ok) {
        toast({
          title: "Success",
          description: result.message
        })
        
        // Close modal and refresh data
        setCreateAlbumModal({ isOpen: false })
        await fetchData()
        
        // Expand parent path if creating sub-album
        if (albumData.parentPath) {
          setExpandedNodes(prev => new Set([...prev, albumData.parentPath!]))
        }
        
      } else {
        throw new Error(result.error || 'Failed to create album')
      }
    } catch (error) {
      console.error('[FRONTEND] Error creating album:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      toast({
        title: "Error",
        description: `Failed to create album: ${errorMessage}`,
        variant: "destructive"
      })
    } finally {
      setIsCreatingAlbum(false)
    }
  }

  const fetchData = async () => {
    try {
      const [albumsRes, syncRes, reconciliationRes] = await Promise.all([
        fetch('/api/admin/albums'),
        fetch('/api/admin/sync/status'),
        fetch('/api/admin/reconciliation')
      ])
      
      const albumsData = await albumsRes.json()
      const syncData = await syncRes.json()
      
      setAlbums(albumsData.albums || [])
      setCurrentSync(syncData.currentJob)
      
      if (reconciliationRes.ok) {
        const reconciliationData = await reconciliationRes.json()
        setReconciliationData(reconciliationData)

        // If filesystem has more albums than database, load full filesystem album list
        if (
          reconciliationData?.stats?.total?.filesystem > reconciliationData?.stats?.total?.database
        ) {
          const fsRes = await fetch('/api/admin/albums/filesystem')
          if (fsRes.ok) {
            const fsData = await fsRes.json()
            const list: any[] = Array.isArray(fsData.albums) ? fsData.albums : []
            // Support both string[] and object[] shapes
            const normalized = list.map((it: any) => typeof it === 'string' 
              ? { path: it, name: it.split('/').pop() || it }
              : { path: it.path, name: it.name, counts: it.counts })
            setFsAlbums(normalized)
            // Initialize selection once to all; thereafter preserve user choices and only add new items
            if (!selectionInitialized) {
              setSelectedPaths(new Set(normalized.map(n => n.path)))
              setSelectionInitialized(true)
            } else {
              setSelectedPaths(prev => {
                const next = new Set(prev)
                for (const n of normalized) {
                  if (!next.has(n.path)) next.add(n.path)
                }
                return next
              })
            }
          }
        } else {
          setFsAlbums([])
          // Do not reset selection to preserve user choices
        }
      }
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

  const startSelectiveSync = async () => {
    setIsSyncing(true)
    try {
      const paths = Array.from(selectedPaths)
      const response = await fetch('/api/sync', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paths })
      })
      if (response.ok) {
        toast({ title: 'Sync Started', description: `${paths.length} album(s) selected` })
        fetchData()
      } else {
        const err = await response.json().catch(() => ({}))
        throw new Error(err.error || 'Failed to start selective sync')
      }
    } catch (error) {
      toast({ title: 'Error', description: 'Failed to start selective sync', variant: 'destructive' })
    } finally {
      setIsSyncing(false)
    }
  }

  // Build filesystem album tree nodes from path strings
  type FsNode = { path: string; name: string; depth: number; children: FsNode[]; counts?: { photos: number; videos: number; total: number } }
  const buildFsTree = (items: Array<{ path: string; name: string; counts?: { photos: number; videos: number; total: number } }>): FsNode[] => {
    const map = new Map<string, FsNode>()
    const roots: FsNode[] = []
    for (const item of items) {
      const p = item.path
      const parts = p.split('/').filter(Boolean)
      let cur = ''
      parts.forEach((part, idx) => {
        cur = cur ? `${cur}/${part}` : part
        if (!map.has(cur)) {
          map.set(cur, { path: cur, name: part, depth: idx, children: [] })
        }
      })
      // attach counts and canonical name on the leaf
      const leaf = map.get(p)
      if (leaf) {
        leaf.name = item.name
        if (item.counts) leaf.counts = item.counts
      }
    }
    // link parents
    map.forEach((node, key) => {
      if (node.depth === 0) {
        roots.push(node)
      } else {
        const parentKey = key.slice(0, key.lastIndexOf('/'))
        const parent = map.get(parentKey)
        if (parent) parent.children.push(node)
      }
    })
    // sort
    const sortNodes = (nodes: FsNode[]) => {
      nodes.sort((a, b) => a.name.localeCompare(b.name))
      nodes.forEach(n => sortNodes(n.children))
    }
    sortNodes(roots)
    return roots
  }

  const [fsExpanded, setFsExpanded] = useState<Set<string>>(new Set())
  const toggleFsNode = (path: string) => setFsExpanded(prev => {
    const s = new Set(prev); s.has(path) ? s.delete(path) : s.add(path); return s
  })
  const toggleSelected = (path: string, checked: boolean) => {
    setSelectedPaths(prev => {
      const next = new Set(prev)
      if (checked) next.add(path); else next.delete(path)
      return next
    })
  }
  const selectAll = () => setSelectedPaths(new Set(fsAlbums.map(a => a.path)))
  const deselectAll = () => setSelectedPaths(new Set())

  const updateFingerprints = async () => {
    setIsUpdatingFingerprints(true)
    try {
      const response = await fetch('/api/admin/fingerprints', { method: 'POST' })
      if (response.ok) {
        const result = await response.json()
        toast({
          title: "Fingerprints Updated",
          description: `Updated ${result.updated} albums, ${result.errors} errors`
        })
        fetchData() // Refresh the data
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update fingerprints",
        variant: "destructive"
      })
    } finally {
      setIsUpdatingFingerprints(false)
    }
  }

  const cancelSync = async (jobId: string) => {
    setIsCancellingSync(true)
    try {
      const response = await fetch('/api/admin/sync/cancel', { 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId })
      })
      
      if (response.ok) {
        const result = await response.json()
        toast({
          title: "Sync Cancelled",
          description: "The sync job has been cancelled successfully"
        })
        fetchData() // Refresh the data to show updated status
      } else {
        throw new Error('Failed to cancel sync')
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to cancel sync job",
        variant: "destructive"
      })
    } finally {
      setIsCancellingSync(false)
    }
  }

  const openDeleteConfirmation = (albumId: string) => {
    const album = albums.find(a => a.id === albumId)
    if (album) {
      setDeleteConfirmation({ isOpen: true, album })
    }
  }

  const closeDeleteConfirmation = () => {
    setDeleteConfirmation({ isOpen: false, album: null })
  }

  const deleteLocalFiles = async () => {
    if (!deleteConfirmation.album) return

    const album = deleteConfirmation.album
    setIsDeletingLocal(true)

    try {
      console.log(`[FRONTEND] Starting delete request for album ID: ${album.id}`)
      console.log(`[FRONTEND] Album: ${album.name} (${album.path})`)
      
      const response = await fetch(`/api/admin/albums/${album.id}/delete-local`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      })
      
      console.log(`[FRONTEND] Delete response status: ${response.status}`)
      
      if (response.ok) {
        const data = await response.json()
        console.log(`[FRONTEND] Delete response data:`, data)
        
        toast({
          title: "Success",
          description: data.message || "Local files deleted successfully"
        })
        fetchData()
        closeDeleteConfirmation()
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
        console.error(`[FRONTEND] Delete failed with status ${response.status}:`, errorData)
        throw new Error(errorData.error || `HTTP ${response.status}`)
      }
    } catch (error) {
      console.error('[FRONTEND] Error in deleteLocalFiles:', error)
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      toast({
        title: "Error",
        description: `Failed to delete local files: ${errorMessage}`,
        variant: "destructive"
      })
    } finally {
      setIsDeletingLocal(false)
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
        setSelectedComparisonAlbumId(albumId)
        
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
    const interval = setInterval(fetchData, 5000) // Poll every 5 seconds to reduce churn
    return () => clearInterval(interval)
  }, [])

  const renderAlbumNode = (node: AlbumTreeNode): React.ReactNode => {
    const isExpanded = expandedNodes.has(node.path)
    const hasChildren = node.children.length > 0
    const hasAlbum = !!node.album
    const indentLevel = node.depth * 24

    return (
      <div key={node.path}>
        <div 
          className="flex items-center gap-2 py-2 px-3 hover:bg-gray-50 rounded-md"
          style={{ paddingLeft: `${12 + indentLevel}px` }}
        >
          {/* Expand/Collapse Button */}
          {hasChildren ? (
            <button
              onClick={() => toggleNode(node.path)}
              className="p-1 hover:bg-gray-200 rounded"
            >
              {isExpanded ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </button>
          ) : (
            <div className="w-6" />
          )}

          {/* Folder Icon */}
          {hasChildren ? (
            isExpanded ? (
              <FolderOpen className="h-4 w-4 text-blue-500" />
            ) : (
              <Folder className="h-4 w-4 text-blue-500" />
            )
          ) : (
            <div className="w-4" />
          )}

          {/* Node Content */}
          <div className="flex-1 min-w-0">
            {hasAlbum ? (
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3">
                    <h3 className="font-medium text-sm">{node.name}</h3>
                    <div className="flex gap-2">
                      {node.album!.syncedToS3 && (
                        <span className="inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold border-transparent bg-green-50 text-green-700">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Synced
                        </span>
                      )}
                      {node.album!.localFilesSafeDelete && (
                        <span className="inline-flex items-center rounded-md border px-2 py-0.5 text-xs font-semibold text-blue-700 bg-blue-50">
                          <Download className="h-3 w-3 mr-1" />
                          Safe Delete
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4 mt-1 text-xs text-muted-foreground">
                    <span>{node.album!.photoCount} photos</span>
                    <span className="truncate">{node.path}</span>
                    {node.album!.lastSyncAt && (
                      <span className="flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(node.album!.lastSyncAt).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
                
                <div className="flex items-center gap-2 ml-4">
                  <Button 
                    variant="outline"
                    size="sm"
                    onClick={() => setCreateAlbumModal({ isOpen: true, parentPath: node.path })}
                    className="bg-blue-50 hover:bg-blue-100 text-blue-700 border-blue-200 h-7 rounded-md px-2 text-xs"
                  >
                    <FolderPlus className="h-3 w-3 mr-1" />
                    Add Sub-Album
                  </Button>
                  
                  <Button 
                    variant="outline"
                    size="sm"
                    onClick={() => setUploadModal({ isOpen: true, albumId: node.album!.id, albumName: node.album!.name })}
                    className="bg-green-50 hover:bg-green-100 text-green-700 border-green-200 h-7 rounded-md px-2 text-xs"
                  >
                    <Upload className="h-3 w-3 mr-1" />
                    Upload Files
                  </Button>
                  
                  <Button 
                    className="border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground h-7 rounded-md px-2 text-xs"
                    onClick={() => compareAlbum(node.album!.id)}
                    disabled={comparingAlbums.has(node.album!.id)}
                  >
                    <Search className="h-3 w-3 mr-1" />
                    {comparingAlbums.has(node.album!.id) ? 'Comparing...' : 'Compare'}
                  </Button>
                  
                  {node.album!.localFilesSafeDelete ? (
                    <Button 
                      className="bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90 h-7 rounded-md px-2 text-xs"
                      onClick={() => openDeleteConfirmation(node.album!.id)}
                    >
                      <Trash2 className="h-3 w-3 mr-1" />
                      Delete Local
                    </Button>
                  ) : (
                    <div className="flex items-center gap-1 text-xs">
                      {node.album!.syncedToS3 ? (
                        <div className="flex items-center gap-1 text-yellow-600">
                          <AlertCircle className="h-3 w-3" />
                          <span>Needs Verification</span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-1 text-blue-600">
                          <Clock className="h-3 w-3" />
                          <span>Pending Sync</span>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-sm text-gray-600 font-medium">
                {node.name} <span className="text-xs text-gray-400">({node.children.length} album{node.children.length !== 1 ? 's' : ''})</span>
              </div>
            )}
          </div>
        </div>

        {/* Render children if expanded */}
        {hasChildren && isExpanded && (
          <div>
            {node.children.map(child => renderAlbumNode(child))}
          </div>
        )}
      </div>
    )
  }

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
        <div className="flex gap-2">
          <Button 
            onClick={updateFingerprints}
            disabled={isSyncing || currentSync?.status === 'RUNNING' || isUpdatingFingerprints}
            variant="outline"
          >
            <FileText className={`h-4 w-4 mr-2 ${isUpdatingFingerprints ? 'animate-spin' : ''}`} />
            {isUpdatingFingerprints ? 'Updating...' : 'Update Fingerprints'}
          </Button>
          <Button 
            onClick={startSync} 
            disabled={isSyncing || currentSync?.status === 'RUNNING'}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
            {isSyncing ? 'Starting...' : 'Sync Now'}
          </Button>
        </div>
      </div>

      {/* Pre-Sync Reconciliation Status */}
      {reconciliationData && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5" />
              System Status Check
              {reconciliationData.summary.hasIssues && (
                <Badge variant="destructive" className="ml-2">
                  Issues Found
                </Badge>
              )}
              {!reconciliationData.summary.hasIssues && (
                <Badge variant="secondary" className="ml-2 bg-green-100 text-green-800">
                  All Good
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              {reconciliationData.summary.message}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              {/* Filesystem Albums */}
              <div className="rounded-lg border bg-card p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="p-2 rounded-full bg-blue-100 text-blue-600">
                      <Folder className="h-4 w-4" />
                    </span>
                    <span className="text-xs uppercase tracking-wide text-muted-foreground">Filesystem Albums</span>
                  </div>
                </div>
                <div className="mt-2 text-2xl font-bold">{reconciliationData.stats.total.filesystem}</div>
              </div>

              {/* Database Albums */}
              <div className="rounded-lg border bg-card p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="p-2 rounded-full bg-violet-100 text-violet-600">
                      <Database className="h-4 w-4" />
                    </span>
                    <span className="text-xs uppercase tracking-wide text-muted-foreground">Database Albums</span>
                  </div>
                </div>
                <div className="mt-2 text-2xl font-bold">{reconciliationData.stats.total.database}</div>
              </div>

              {/* Orphaned Albums */}
              <div className="rounded-lg border bg-card p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`p-2 rounded-full ${reconciliationData.stats.total.orphaned > 0 ? 'bg-orange-100 text-orange-600' : 'bg-green-100 text-green-600'}`}>
                      <AlertTriangle className="h-4 w-4" />
                    </span>
                    <span className="text-xs uppercase tracking-wide text-muted-foreground">Orphaned Albums</span>
                  </div>
                </div>
                <div className={`mt-2 text-2xl font-bold ${reconciliationData.stats.total.orphaned > 0 ? 'text-orange-600' : ''}`}>
                  {reconciliationData.stats.total.orphaned}
                </div>
              </div>

              {/* New Albums */}
              <div className="rounded-lg border bg-card p-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`p-2 rounded-full ${reconciliationData.stats.total.new > 0 ? 'bg-blue-100 text-blue-600' : 'bg-green-100 text-green-600'}`}>
                      <FolderPlus className="h-4 w-4" />
                    </span>
                    <span className="text-xs uppercase tracking-wide text-muted-foreground">New Albums</span>
                  </div>
                </div>
                <div className={`mt-2 text-2xl font-bold ${reconciliationData.stats.total.new > 0 ? 'text-blue-600' : ''}`}>
                  {reconciliationData.stats.total.new}
                </div>
              </div>
            </div>

            {reconciliationData.summary.hasIssues && (() => {
              const cleanup = reconciliationData.stats.orphaned.cleanupNeeded
              const recoverable = reconciliationData.stats.orphaned.recoverable
              const needsReview = reconciliationData.stats.orphaned.needsReview
              const newAlbums = reconciliationData.stats.total.new
              const hasActions = cleanup > 0 || recoverable > 0 || needsReview > 0 || newAlbums > 0
              if (!hasActions) return null
              return (
                <div className="mt-4 p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                  <div className="text-sm font-medium text-yellow-900 mb-2">Actions that will be taken during sync:</div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                    {newAlbums > 0 && (
                      <div className="flex items-center gap-2">
                        <FolderPlus className="h-3 w-3 text-green-600" />
                        <span>Create {newAlbums} new album{newAlbums === 1 ? '' : 's'} from filesystem</span>
                      </div>
                    )}
                    {cleanup > 0 && (
                      <div className="flex items-center gap-2">
                        <Trash2 className="h-3 w-3 text-red-600" />
                        <span>Clean up {cleanup} empty album{cleanup === 1 ? '' : 's'}</span>
                      </div>
                    )}
                    {recoverable > 0 && (
                      <div className="flex items-center gap-2">
                        <CloudDownload className="h-3 w-3 text-blue-600" />
                        <span>Mark {recoverable} album{recoverable === 1 ? '' : 's'} as recoverable</span>
                      </div>
                    )}
                    {needsReview > 0 && (
                      <div className="flex items-center gap-2">
                        <AlertTriangle className="h-3 w-3 text-orange-600" />
                        <span>{needsReview} album{needsReview === 1 ? '' : 's'} need manual review</span>
                      </div>
                    )}
                  </div>
                </div>
              )
            })()}

            {/* Selective Sync when filesystem has more albums */}
            {reconciliationData.stats.total.filesystem > reconciliationData.stats.total.database && fsAlbums.length > 0 && (
              <div className="mt-6">
                <div className="flex items-center justify-between mb-2">
                  <div className="text-sm font-medium">Select Albums to Sync</div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={selectAll}>Select All</Button>
                    <Button variant="outline" size="sm" onClick={deselectAll}>Deselect All</Button>
                    <Button size="sm" onClick={startSelectiveSync} disabled={isSyncing || selectedPaths.size === 0}>
                      <RefreshCw className={`h-4 w-4 mr-2 ${isSyncing ? 'animate-spin' : ''}`} />
                      {isSyncing ? 'Starting...' : `Sync Selected (${selectedPaths.size})`}
                    </Button>
                  </div>
                </div>
                <div className="border rounded-md divide-y">
                  {buildFsTree(fsAlbums).map(node => (
                    <div key={node.path}>
                      {/* render row */}
                      <div className="flex items-center gap-2 py-2 px-3 hover:bg-gray-50" style={{ paddingLeft: `${12 + node.depth * 24}px` }}>
                        {/* expand */}
                        {node.children.length > 0 ? (
                          <button onClick={() => toggleFsNode(node.path)} className="p-1 hover:bg-gray-200 rounded">
                            {fsExpanded.has(node.path) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                          </button>
                        ) : (
                          <div className="w-6" />
                        )}
                        {/* checkbox */}
                        <input
                          type="checkbox"
                          className="h-4 w-4"
                          checked={selectedPaths.has(node.path)}
                          onChange={(e) => toggleSelected(node.path, e.target.checked)}
                        />
                        {/* icon and label */}
                        {node.children.length > 0 ? (
                          fsExpanded.has(node.path) ? <FolderOpen className="h-4 w-4 text-blue-500" /> : <Folder className="h-4 w-4 text-blue-500" />
                        ) : <div className="w-4" />}
                        <span className="text-sm">{node.name}</span>
                        {node.counts && (
                          <span className="ml-2 text-xs text-muted-foreground">{node.counts.total} media (P {node.counts.photos} / V {node.counts.videos})</span>
                        )}
                        <span className="ml-2 text-xs text-muted-foreground">/{node.path}</span>
                      </div>
                      {/* children */}
                      {node.children.length > 0 && fsExpanded.has(node.path) && (
                        <div>
                          {node.children.map(child => (
                            <div key={child.path} className="flex items-center gap-2 py-2 px-3 hover:bg-gray-50" style={{ paddingLeft: `${12 + child.depth * 24}px` }}>
                              {child.children.length > 0 ? (
                                <button onClick={() => toggleFsNode(child.path)} className="p-1 hover:bg-gray-200 rounded">
                                  {fsExpanded.has(child.path) ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                                </button>
                              ) : <div className="w-6" />}
                              <input type="checkbox" className="h-4 w-4" checked={selectedPaths.has(child.path)} onChange={(e) => toggleSelected(child.path, e.target.checked)} />
                              {child.children.length > 0 ? (fsExpanded.has(child.path) ? <FolderOpen className="h-4 w-4 text-blue-500" /> : <Folder className="h-4 w-4 text-blue-500" />) : <div className="w-4" />}
                              <span className="text-sm">{child.name}</span>
                              {child.counts && (
                                <span className="ml-2 text-xs text-muted-foreground">{child.counts.total} media (P {child.counts.photos} / V {child.counts.videos})</span>
                              )}
                              <span className="ml-2 text-xs text-muted-foreground">/{child.path}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Current Sync Status */}
      {currentSync && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CardTitle>Current Sync Job</CardTitle>
                <span className={`inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 ${
                  currentSync.status === 'RUNNING' ? 'border-transparent bg-primary text-primary-foreground shadow hover:bg-primary/80' : 
                  currentSync.status === 'COMPLETED' ? 'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80' : 
                  'border-transparent bg-destructive text-destructive-foreground shadow hover:bg-destructive/80'
                }`}>
                  {currentSync.status}
                </span>
              </div>
              {currentSync.status === 'RUNNING' && (
                <Button
                  onClick={() => cancelSync(currentSync.id)}
                  disabled={isCancellingSync}
                  variant="destructive"
                  size="sm"
                >
                  <X className={`h-4 w-4 mr-2 ${isCancellingSync ? 'animate-spin' : ''}`} />
                  {isCancellingSync ? 'Cancelling...' : 'Cancel Sync'}
                </Button>
              )}
            </div>
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
            
            {/* Current Album Progress */}
            {currentSync.albumProgress && (() => {
              try {
                const albumProgressData = typeof currentSync.albumProgress === 'string' 
                  ? JSON.parse(currentSync.albumProgress) 
                  : currentSync.albumProgress;
                
                // Find the current album being processed (not completed and not error)
                const currentAlbum = Object.entries(albumProgressData).find(([albumPath, progress]: [string, any]) => 
                  progress.status && progress.status !== 'COMPLETED' && progress.status !== 'ERROR' && 
                  ((progress.photosTotal !== undefined && progress.photosUploaded !== undefined) ||
                   (progress.videosTotal !== undefined && progress.videosUploaded !== undefined))
                );
                
                if (currentAlbum) {
                  const [albumPath, progress]: [string, any] = currentAlbum;
                  const albumName = albumPath.split('/').pop() || albumPath;
                  
                  // Calculate total progress including both photos and videos
                  const totalFiles = (progress.photosTotal || 0) + (progress.videosTotal || 0);
                  const processedFiles = (progress.photosProcessed || 0) + (progress.videosProcessed || 0);
                  const albumProgressPercent = totalFiles > 0 
                    ? Math.round((processedFiles / totalFiles) * 100) 
                    : 0;
                  
                  return (
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span>Current Album: {albumName}</span>
                        <span>{processedFiles}/{totalFiles} ({albumProgressPercent}%)</span>
                      </div>
                      <div className="w-full bg-gray-200 rounded-full h-2">
                        <div 
                          className="bg-green-600 h-2 rounded-full transition-all duration-300" 
                          style={{ width: `${albumProgressPercent}%` }}
                        ></div>
                      </div>
                    </div>
                  );
                }
              } catch (error) {
                console.error('Error parsing album progress:', error);
              }
              return null;
            })()}
            
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

            {/* Reconciliation Summary */}
            {currentSync.albumProgress && (() => {
              try {
                const albumProgressData = typeof currentSync.albumProgress === 'string' 
                  ? JSON.parse(currentSync.albumProgress) 
                  : currentSync.albumProgress;
                
                const reconciledCount = Object.keys(albumProgressData).filter(key => key.startsWith('reconciled_')).length;
                const orphanedCount = Object.keys(albumProgressData).filter(key => key.startsWith('orphaned_')).length;
                const cleanedUpCount = Object.values(albumProgressData).filter((album: any) => album.action === 'cleaned_up').length;
                const markedMissingCount = Object.values(albumProgressData).filter((album: any) => album.action === 'marked_missing').length;

                if (reconciledCount > 0 || orphanedCount > 0) {
                  return (
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
                      <div className="text-sm font-medium text-blue-900 mb-2">Album Reconciliation</div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                        {cleanedUpCount > 0 && (
                          <div>
                            <p className="text-green-700 font-medium">Cleaned Up</p>
                            <p className="text-green-600">{cleanedUpCount} albums</p>
                          </div>
                        )}
                        {markedMissingCount > 0 && (
                          <div>
                            <p className="text-yellow-700 font-medium">Missing Local</p>
                            <p className="text-yellow-600">{markedMissingCount} recoverable</p>
                          </div>
                        )}
                        {orphanedCount > 0 && (
                          <div>
                            <p className="text-orange-700 font-medium">Need Review</p>
                            <p className="text-orange-600">{orphanedCount} albums</p>
                          </div>
                        )}
                        {reconciledCount > 0 && (
                          <div>
                            <p className="text-blue-700 font-medium">Total Handled</p>
                            <p className="text-blue-600">{reconciledCount} albums</p>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                }
              } catch (error) {
                console.error('Error parsing album progress:', error);
              }
              return null;
            })()}

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

      {/* Comparison Results Modal */}
      <Dialog open={selectedComparisonAlbumId !== null} onOpenChange={(open) => !open && setSelectedComparisonAlbumId(null)}>
        <DialogContent className="max-w-6xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Album Comparison Results</DialogTitle>
            <DialogDescription>
              Comparing album across local filesystem, S3 storage, and database
            </DialogDescription>
          </DialogHeader>
          
          {selectedComparisonAlbumId && albumComparisons.has(selectedComparisonAlbumId) && (() => {
            const comparison = albumComparisons.get(selectedComparisonAlbumId)!
            return (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold mb-3">{comparison.albumName}</h3>
                  <p className="text-sm text-muted-foreground">{comparison.albumPath}</p>
                </div>
                
                {/* Summary Stats */}
                <div className="grid grid-cols-4 gap-4">
                  <div className="text-center p-4 border rounded-lg">
                    <FileText className="h-8 w-8 mx-auto mb-3 text-blue-500" />
                    <div className="text-3xl font-bold">{comparison.localFiles.length}</div>
                    <div className="text-sm text-muted-foreground">Local Files</div>
                  </div>
                  <div className="text-center p-4 border rounded-lg">
                    <Cloud className="h-8 w-8 mx-auto mb-3 text-green-500" />
                    <div className="text-3xl font-bold">{comparison.s3Files.length}</div>
                    <div className="text-sm text-muted-foreground">S3 Files</div>
                  </div>
                  <div className="text-center p-4 border rounded-lg">
                    <Database className="h-8 w-8 mx-auto mb-3 text-purple-500" />
                    <div className="text-3xl font-bold">{comparison.databaseFiles.length}</div>
                    <div className="text-sm text-muted-foreground">Database Records</div>
                  </div>
                  <div className="text-center p-4 border rounded-lg">
                    <AlertCircle className="h-8 w-8 mx-auto mb-3 text-red-500" />
                    <div className="text-3xl font-bold">
                      {comparison.localOnly.length + comparison.s3Only.length + comparison.databaseOnly.length +
                       (comparison.missing?.localMissingFromS3?.length || 0) +
                       (comparison.missing?.localMissingFromDB?.length || 0) +
                       (comparison.missing?.s3MissingFromLocal?.length || 0) +
                       (comparison.missing?.s3MissingFromDB?.length || 0) +
                       (comparison.missing?.dbMissingFromLocal?.length || 0) +
                       (comparison.missing?.dbMissingFromS3?.length || 0)}
                    </div>
                    <div className="text-sm text-muted-foreground">Issues Found</div>
                  </div>
                </div>

                {/* Issues Details */}
                {(() => {
                  const hasInconsistencies = comparison.localOnly.length > 0 || 
                                           comparison.s3Only.length > 0 || 
                                           comparison.databaseOnly.length > 0 ||
                                           (comparison.missing?.localMissingFromS3?.length || 0) > 0 ||
                                           (comparison.missing?.localMissingFromDB?.length || 0) > 0 ||
                                           (comparison.missing?.s3MissingFromLocal?.length || 0) > 0 ||
                                           (comparison.missing?.s3MissingFromDB?.length || 0) > 0 ||
                                           (comparison.missing?.dbMissingFromLocal?.length || 0) > 0 ||
                                           (comparison.missing?.dbMissingFromS3?.length || 0) > 0
                  
                  return hasInconsistencies ? (
                    <div className="space-y-4">
                      <h4 className="text-lg font-semibold text-red-700">Found Issues</h4>
                      
                      {comparison.localOnly.length > 0 && (
                        <div className="p-4 border border-red-200 rounded-lg bg-red-50">
                          <div className="font-medium text-red-800 mb-2">Files Only in Local ({comparison.localOnly.length})</div>
                          <div className="text-sm text-red-700 mb-3">
                            These files exist locally but are missing from S3 and database
                          </div>
                          <div className="text-xs text-red-600 max-h-40 overflow-y-auto bg-white p-3 rounded border">
                            {comparison.localOnly.slice(0, 10).map((file, idx) => (
                              <div key={idx} className="py-1">{file}</div>
                            ))}
                            {comparison.localOnly.length > 10 && (
                              <div className="py-1 font-medium">... and {comparison.localOnly.length - 10} more</div>
                            )}
                          </div>
                        </div>
                      )}

                      {comparison.s3Only.length > 0 && (
                        <div className="p-4 border border-yellow-200 rounded-lg bg-yellow-50">
                          <div className="flex items-start justify-between mb-2">
                            <div className="font-medium text-yellow-800">Files Only in S3 ({comparison.s3Only.length})</div>
                            <Button
                              size="sm"
                              className="bg-blue-600 hover:bg-blue-700 text-white"
                              onClick={() => restoreLocalFiles(selectedComparisonAlbumId!, comparison.s3Only)}
                              disabled={restoringAlbums.has(selectedComparisonAlbumId!)}
                            >
                              {restoringAlbums.has(selectedComparisonAlbumId!) ? (
                                <>
                                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                                  Restoring...
                                </>
                              ) : (
                                <>
                                  <CloudDownload className="h-4 w-4 mr-2" />
                                  Restore Files
                                </>
                              )}
                            </Button>
                          </div>
                          {restoringAlbums.has(selectedComparisonAlbumId!) && restoreProgress.has(selectedComparisonAlbumId!) && (
                            <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded">
                              <div className="flex items-center justify-between text-sm mb-2">
                                <span className="text-blue-700">Restoration Progress</span>
                                <span className="text-blue-600 font-medium">
                                  {restoreProgress.get(selectedComparisonAlbumId!)?.current || 0} / {restoreProgress.get(selectedComparisonAlbumId!)?.total || 0}
                                </span>
                              </div>
                              <Progress 
                                value={((restoreProgress.get(selectedComparisonAlbumId!)?.current || 0) / (restoreProgress.get(selectedComparisonAlbumId!)?.total || 1)) * 100} 
                                className="mb-2"
                              />
                              <div className="text-xs text-blue-600">
                                {restoreProgress.get(selectedComparisonAlbumId!)?.message || 'Processing...'}
                              </div>
                            </div>
                          )}
                          <div className="text-sm text-yellow-700 mb-3">
                            These files exist in S3 but are missing from local filesystem and database. Click "Restore Files" to download them locally.
                          </div>
                          <div className="text-xs text-yellow-600 max-h-40 overflow-y-auto bg-white p-3 rounded border">
                            {comparison.s3Only.slice(0, 10).map((file, idx) => (
                              <div key={idx} className="py-1">{file}</div>
                            ))}
                            {comparison.s3Only.length > 10 && (
                              <div className="py-1 font-medium">... and {comparison.s3Only.length - 10} more</div>
                            )}
                          </div>
                        </div>
                      )}

                      {comparison.databaseOnly.length > 0 && (
                        <div className="p-4 border border-purple-200 rounded-lg bg-purple-50">
                          <div className="font-medium text-purple-800 mb-2">Files Only in Database ({comparison.databaseOnly.length})</div>
                          <div className="text-sm text-purple-700 mb-3">
                            These files exist in database but are missing from local filesystem and S3
                          </div>
                          <div className="text-xs text-purple-600 max-h-40 overflow-y-auto bg-white p-3 rounded border">
                            {comparison.databaseOnly.slice(0, 10).map((file, idx) => (
                              <div key={idx} className="py-1">{file}</div>
                            ))}
                            {comparison.databaseOnly.length > 10 && (
                              <div className="py-1 font-medium">... and {comparison.databaseOnly.length - 10} more</div>
                            )}
                          </div>
                        </div>
                      )}

                      {/* Missing files between locations */}
                      {(comparison.missing?.localMissingFromS3?.length || 0) > 0 && (
                        <div className="p-4 border border-orange-200 rounded-lg bg-orange-50">
                          <div className="font-medium text-orange-800 mb-2">Local Files Missing from S3 ({comparison.missing.localMissingFromS3.length})</div>
                          <div className="text-sm text-orange-700 mb-3">
                            These files exist locally and in database but are missing from S3
                          </div>
                          <div className="text-xs text-orange-600 max-h-40 overflow-y-auto bg-white p-3 rounded border">
                            {comparison.missing.localMissingFromS3.slice(0, 10).map((file, idx) => (
                              <div key={idx} className="py-1">{file}</div>
                            ))}
                            {comparison.missing.localMissingFromS3.length > 10 && (
                              <div className="py-1 font-medium">... and {comparison.missing.localMissingFromS3.length - 10} more</div>
                            )}
                          </div>
                        </div>
                      )}

                      {(comparison.missing?.dbMissingFromS3?.length || 0) > 0 && (
                        <div className="p-4 border border-blue-200 rounded-lg bg-blue-50">
                          <div className="font-medium text-blue-800 mb-2">Database Records Missing from S3 ({comparison.missing.dbMissingFromS3.length})</div>
                          <div className="text-sm text-blue-700 mb-3">
                            These files exist in database but are missing from S3
                          </div>
                          <div className="text-xs text-blue-600 max-h-40 overflow-y-auto bg-white p-3 rounded border">
                            {comparison.missing.dbMissingFromS3.slice(0, 10).map((file, idx) => (
                              <div key={idx} className="py-1">{file}</div>
                            ))}
                            {comparison.missing.dbMissingFromS3.length > 10 && (
                              <div className="py-1 font-medium">... and {comparison.missing.dbMissingFromS3.length - 10} more</div>
                            )}
                          </div>
                        </div>
                      )}

                      {(comparison.missing?.s3MissingFromLocal?.length || 0) > 0 && (
                        <div className="p-4 border border-green-200 rounded-lg bg-green-50">
                          <div className="flex items-start justify-between mb-2">
                            <div className="font-medium text-green-800">S3 Files Missing from Local ({comparison.missing.s3MissingFromLocal.length})</div>
                            <Button
                              size="sm"
                              className="bg-blue-600 hover:bg-blue-700 text-white"
                              onClick={() => restoreLocalFiles(selectedComparisonAlbumId!, comparison.missing.s3MissingFromLocal)}
                              disabled={restoringAlbums.has(selectedComparisonAlbumId!)}
                            >
                              {restoringAlbums.has(selectedComparisonAlbumId!) ? (
                                <>
                                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                                  Restoring...
                                </>
                              ) : (
                                <>
                                  <CloudDownload className="h-4 w-4 mr-2" />
                                  Restore from S3
                                </>
                              )}
                            </Button>
                          </div>
                          {restoringAlbums.has(selectedComparisonAlbumId!) && restoreProgress.has(selectedComparisonAlbumId!) && (
                            <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded">
                              <div className="flex items-center justify-between text-sm mb-2">
                                <span className="text-blue-700">Restoration Progress</span>
                                <span className="text-blue-600 font-medium">
                                  {restoreProgress.get(selectedComparisonAlbumId!)?.current || 0} / {restoreProgress.get(selectedComparisonAlbumId!)?.total || 0}
                                </span>
                              </div>
                              <Progress 
                                value={((restoreProgress.get(selectedComparisonAlbumId!)?.current || 0) / (restoreProgress.get(selectedComparisonAlbumId!)?.total || 1)) * 100} 
                                className="mb-2"
                              />
                              <div className="text-xs text-blue-600">
                                {restoreProgress.get(selectedComparisonAlbumId!)?.message || 'Processing...'}
                              </div>
                            </div>
                          )}
                          <div className="text-sm text-green-700 mb-3">
                            These files exist in S3 and database but are missing from local filesystem
                          </div>
                          <div className="text-xs text-green-600 max-h-40 overflow-y-auto bg-white p-3 rounded border">
                            {comparison.missing.s3MissingFromLocal.slice(0, 10).map((file, idx) => (
                              <div key={idx} className="py-1">{file}</div>
                            ))}
                            {comparison.missing.s3MissingFromLocal.length > 10 && (
                              <div className="py-1 font-medium">... and {comparison.missing.s3MissingFromLocal.length - 10} more</div>
                            )}
                          </div>
                        </div>
                      )}

                      {(comparison.missing?.dbMissingFromLocal?.length || 0) > 0 && (
                        <div className="p-4 border border-indigo-200 rounded-lg bg-indigo-50">
                          <div className="font-medium text-indigo-800 mb-2">Database Records Missing from Local ({comparison.missing.dbMissingFromLocal.length})</div>
                          <div className="text-sm text-indigo-700 mb-3">
                            These files exist in database but are missing from local filesystem
                          </div>
                          <div className="text-xs text-indigo-600 max-h-40 overflow-y-auto bg-white p-3 rounded border">
                            {comparison.missing.dbMissingFromLocal.slice(0, 10).map((file, idx) => (
                              <div key={idx} className="py-1">{file}</div>
                            ))}
                            {comparison.missing.dbMissingFromLocal.length > 10 && (
                              <div className="py-1 font-medium">... and {comparison.missing.dbMissingFromLocal.length - 10} more</div>
                            )}
                          </div>
                        </div>
                      )}

                      {(comparison.missing?.localMissingFromDB?.length || 0) > 0 && (
                        <div className="p-4 border border-violet-200 rounded-lg bg-violet-50">
                          <div className="font-medium text-violet-800 mb-2">Local Files Missing from Database ({comparison.missing.localMissingFromDB.length})</div>
                          <div className="text-sm text-violet-700 mb-3">
                            These files exist locally but are missing from database
                          </div>
                          <div className="text-xs text-violet-600 max-h-40 overflow-y-auto bg-white p-3 rounded border">
                            {comparison.missing.localMissingFromDB.slice(0, 10).map((file, idx) => (
                              <div key={idx} className="py-1">{file}</div>
                            ))}
                            {comparison.missing.localMissingFromDB.length > 10 && (
                              <div className="py-1 font-medium">... and {comparison.missing.localMissingFromDB.length - 10} more</div>
                            )}
                          </div>
                        </div>
                      )}

                      {(comparison.missing?.s3MissingFromDB?.length || 0) > 0 && (
                        <div className="p-4 border border-cyan-200 rounded-lg bg-cyan-50">
                          <div className="font-medium text-cyan-800 mb-2">S3 Files Missing from Database ({comparison.missing.s3MissingFromDB.length})</div>
                          <div className="text-sm text-cyan-700 mb-3">
                            These files exist in S3 but are missing from database
                          </div>
                          <div className="text-xs text-cyan-600 max-h-40 overflow-y-auto bg-white p-3 rounded border">
                            {comparison.missing.s3MissingFromDB.slice(0, 10).map((file, idx) => (
                              <div key={idx} className="py-1">{file}</div>
                            ))}
                            {comparison.missing.s3MissingFromDB.length > 10 && (
                              <div className="py-1 font-medium">... and {comparison.missing.s3MissingFromDB.length - 10} more</div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="p-6 bg-green-50 border border-green-200 rounded-lg">
                      <div className="flex items-center gap-3 mb-3">
                        <CheckCircle className="h-6 w-6 text-green-600" />
                        <div className="text-green-800 font-medium text-lg">All files match perfectly!</div>
                      </div>
                      <div className="text-sm text-green-700 mb-3">
                        Local files, S3 storage, and database records are all in sync.
                      </div>
                      <div className="text-sm text-green-600 p-3 bg-green-100 rounded border">
                        ✓ This album has been automatically marked as safe for local file deletion.
                      </div>
                    </div>
                  )
                })()}
              </div>
            )
          })()}
        </DialogContent>
      </Dialog>

      {/* Create Album Modal */}
      <Dialog open={createAlbumModal.isOpen} onOpenChange={(open) => setCreateAlbumModal({ isOpen: open })}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <FolderPlus className="h-5 w-5" />
              Create New Album
            </DialogTitle>
            <DialogDescription>
              {createAlbumModal.parentPath 
                ? `Create a sub-album under "${createAlbumModal.parentName}"`
                : 'Create a new root-level album'
              }
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => {
            e.preventDefault()
            const formData = new FormData(e.currentTarget)
            const name = formData.get('albumName') as string
            const description = formData.get('albumDescription') as string
            
            if (name.trim()) {
              createAlbum({
                name: name.trim(),
                description: description.trim() || undefined,
                parentPath: createAlbumModal.parentPath
              })
            }
          }}>
            <div className="space-y-4 py-4">
              {createAlbumModal.parentPath && (
                <div className="p-3 bg-blue-50 border border-blue-200 rounded-md">
                  <div className="text-sm font-medium text-blue-900">Parent Album</div>
                  <div className="text-sm text-blue-700">{createAlbumModal.parentPath}</div>
                </div>
              )}
              
              <div className="space-y-2">
                <Label htmlFor="albumName">Album Name *</Label>
                <Input
                  id="albumName"
                  name="albumName"
                  placeholder="Enter album name"
                  required
                  disabled={isCreatingAlbum}
                />
                <div className="text-xs text-muted-foreground">
                  Special characters will be sanitized for filesystem compatibility
                </div>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="albumDescription">Description (Optional)</Label>
                <Textarea
                  id="albumDescription"
                  name="albumDescription"
                  placeholder="Enter album description..."
                  rows={3}
                  disabled={isCreatingAlbum}
                />
                <div className="text-xs text-muted-foreground">
                  Will be saved as project.md in the album folder
                </div>
              </div>
            </div>
            
            <DialogFooter>
              <Button 
                type="button" 
                variant="outline" 
                onClick={() => setCreateAlbumModal({ isOpen: false })}
                disabled={isCreatingAlbum}
              >
                Cancel
              </Button>
              <Button 
                type="submit" 
                disabled={isCreatingAlbum}
                className="bg-primary hover:bg-primary/90"
              >
                {isCreatingAlbum ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Creating...
                  </>
                ) : (
                  <>
                    <FolderPlus className="h-4 w-4 mr-2" />
                    Create Album
                  </>
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Albums Tree View */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xl">Albums</CardTitle>
              <CardDescription>
                Hierarchical view of all photo albums. Expand folders to see nested albums.
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button 
                variant="outline"
                size="sm"
                onClick={() => setCreateAlbumModal({ isOpen: true })}
                className="bg-green-50 hover:bg-green-100 text-green-700 border-green-200"
              >
                <Plus className="h-4 w-4 mr-2" />
                Create Album
              </Button>
              <Button 
                variant="outline"
                size="sm"
                onClick={() => {
                  // Expand all nodes
                  const allPaths = new Set<string>()
                  const addPaths = (nodes: AlbumTreeNode[]) => {
                    nodes.forEach(node => {
                      if (node.children.length > 0) {
                        allPaths.add(node.path)
                        addPaths(node.children)
                      }
                    })
                  }
                  addPaths(buildAlbumTree(albums))
                  setExpandedNodes(allPaths)
                }}
              >
                Expand All
              </Button>
              <Button 
                variant="outline"
                size="sm"
                onClick={() => setExpandedNodes(new Set())}
              >
                Collapse All
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-h-96 overflow-y-auto border-t">
            {buildAlbumTree(albums).map(node => renderAlbumNode(node))}
          </div>
        </CardContent>
      </Card>

      {/* Help Section */}
      <Card>
        <CardHeader className="pb-3">
          <div 
            className="flex items-center justify-between cursor-pointer"
            onClick={() => setIsHelpExpanded(!isHelpExpanded)}
          >
            <CardTitle className="text-lg">Understanding Album Status</CardTitle>
            {isHelpExpanded ? (
              <ChevronDown className="h-5 w-5" />
            ) : (
              <ChevronRight className="h-5 w-5" />
            )}
          </div>
        </CardHeader>
        {isHelpExpanded && (
          <CardContent className="space-y-4 pt-0">
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
        )}
      </Card>

      {/* Delete Confirmation Modal */}
      <Dialog open={deleteConfirmation.isOpen} onOpenChange={(open) => !open && closeDeleteConfirmation()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              Delete Local Files
            </DialogTitle>
            <DialogDescription>
              This action will permanently delete the local files for this album.
            </DialogDescription>
          </DialogHeader>
          
          {deleteConfirmation.album && (
            <div className="space-y-4">
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="space-y-2">
                  <div className="font-medium text-red-900">
                    {deleteConfirmation.album.name}
                  </div>
                  <div className="text-sm text-red-700">
                    <strong>Path:</strong> {deleteConfirmation.album.path}
                  </div>
                  <div className="text-sm text-red-700">
                    <strong>Photos:</strong> {deleteConfirmation.album.photoCount} files
                  </div>
                </div>
              </div>
              
              <div className="space-y-2">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
                  <div className="text-sm text-gray-700">
                    <strong>Warning:</strong> This action cannot be undone. All local files in this album directory will be permanently removed from your filesystem.
                  </div>
                </div>
                <div className="text-sm text-gray-600 ml-6">
                  The files will remain available in S3 storage and the database records will be preserved.
                </div>
              </div>
            </div>
          )}
          
          <DialogFooter className="flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2">
            <Button
              variant="outline"
              onClick={closeDeleteConfirmation}
              disabled={isDeletingLocal}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={deleteLocalFiles}
              disabled={isDeletingLocal}
              className="mb-2 sm:mb-0"
            >
              {isDeletingLocal ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  Deleting...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  Delete Local Files
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* File Upload Modal */}
      <FileUploadModal
        isOpen={uploadModal.isOpen}
        onClose={() => setUploadModal({ isOpen: false, albumId: '', albumName: '' })}
        albumId={uploadModal.albumId}
        albumName={uploadModal.albumName}
        onUploadComplete={() => {
          // Refresh albums after upload
          fetchData()
          toast({
            title: "Upload completed",
            description: "Files have been uploaded. You can now run a sync to upload them to remote storage.",
          })
        }}
      />
    </div>
  )
}
