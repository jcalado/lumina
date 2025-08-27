import React, { useState, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import { 
  Upload, 
  X, 
  FileImage, 
  Archive, 
  CheckCircle, 
  AlertCircle,
  Loader2
} from 'lucide-react'

interface FileProgress {
  filename: string
  status: 'pending' | 'processing' | 'completed' | 'error'
  error?: string
  size: number
}

interface UploadProgress {
  uploadId: string
  totalFiles: number
  processedFiles: number
  currentBatch: number
  totalBatches: number
  files: FileProgress[]
  errors: Array<{ filename: string; error: string }>
  completed: boolean
  phase: 'validating' | 'extracting' | 'uploading' | 'completed' | 'error'
}

interface FileUploadModalProps {
  isOpen: boolean
  onClose: () => void
  albumId: string
  albumName: string
  onUploadComplete: () => void
}

export function FileUploadModal({
  isOpen,
  onClose,
  albumId,
  albumName,
  onUploadComplete
}: FileUploadModalProps) {
  const [dragActive, setDragActive] = useState(false)
  const [files, setFiles] = useState<File[]>([])
  const [uploadType, setUploadType] = useState<'files' | 'zip'>('files')
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState<UploadProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const progressInterval = useRef<NodeJS.Timeout | null>(null)

  const supportedFormats = ['.jpg', '.jpeg', '.png', '.webp']
  const maxFileSize = 50 * 1024 * 1024 // 50MB

  const handleDrag = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }, [])

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    const droppedFiles = Array.from(e.dataTransfer.files)
    validateAndSetFiles(droppedFiles)
  }, [])

  const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files)
      validateAndSetFiles(selectedFiles)
    }
  }, [])

  const validateAndSetFiles = (fileList: File[]) => {
    setError(null)
    
    // Check if it's a single ZIP file
    if (fileList.length === 1 && fileList[0].name.toLowerCase().endsWith('.zip')) {
      if (fileList[0].size > maxFileSize) {
        setError(`ZIP file too large: ${formatFileSize(fileList[0].size)}. Max size: ${formatFileSize(maxFileSize)}`)
        return
      }
      setUploadType('zip')
      setFiles(fileList)
      return
    }

    setUploadType('files')
    
    // Calculate total size first
    const totalSize = fileList.reduce((sum: number, file: File) => sum + file.size, 0)
    const maxTotalSize = 2 * 1024 * 1024 * 1024 // 2GB
    
    if (totalSize > maxTotalSize) {
      setError(`Total upload size too large: ${formatFileSize(totalSize)}. Maximum: ${formatFileSize(maxTotalSize)}`)
      return
    }
    
    // Filter for supported image formats
    const validFiles: File[] = []
    const errors: string[] = []
    
    fileList.forEach(file => {
      const ext = '.' + file.name.split('.').pop()?.toLowerCase()
      const isValidFormat = supportedFormats.includes(ext)
      const isValidSize = file.size <= maxFileSize
      
      if (!isValidFormat) {
        errors.push(`${file.name}: Unsupported format (${ext})`)
        return
      }
      
      if (!isValidSize) {
        errors.push(`${file.name}: Too large (${formatFileSize(file.size)})`)
        return
      }
      
      validFiles.push(file)
    })

    if (errors.length > 0) {
      setError(`Some files were rejected:\n${errors.slice(0, 5).join('\n')}${errors.length > 5 ? `\n...and ${errors.length - 5} more` : ''}`)
    }

    setFiles(validFiles)
    
    if (validFiles.length === 0 && errors.length > 0) {
      setError('No valid files to upload. ' + (errors.length > 0 ? 'Supported formats: ' + supportedFormats.join(', ') : ''))
    }
  }

  const startUpload = async () => {
    if (files.length === 0) return

    setUploading(true)
    setError(null)
    
    // Set initial progress state
    const initialProgress: UploadProgress = {
      uploadId: '',
      totalFiles: files.length,
      processedFiles: 0,
      currentBatch: 0,
      totalBatches: 0,
      files: files.map(file => ({
        filename: file.name,
        status: 'pending',
        size: file.size
      })),
      errors: [],
      completed: false,
      phase: 'validating'
    }
    
    setProgress(initialProgress)
    console.log('[UPLOAD] Set initial progress state:', initialProgress)

    try {
      const formData = new FormData()
      files.forEach(file => formData.append('files', file))
      formData.append('uploadType', uploadType)

      const response = await fetch(`/api/admin/albums/${albumId}/upload`, {
        method: 'POST',
        body: formData
      })

      const result = await response.json()

      if (!response.ok) {
        throw new Error(result.error || 'Upload failed')
      }

      const uploadId = result.uploadId
      initialProgress.uploadId = uploadId
      setProgress(initialProgress)
      
      console.log('[UPLOAD] Upload started with ID:', uploadId)
      
      // Start polling for progress immediately
      let pollCount = 0
      progressInterval.current = setInterval(async () => {
        pollCount++
        try {
          const progressResponse = await fetch(
            `/api/admin/albums/${albumId}/upload?uploadId=${uploadId}`
          )
          const progressData = await progressResponse.json()

          console.log(`[UPLOAD] Progress update #${pollCount}:`, progressData)

          if (progressResponse.ok) {
            setProgress(progressData)
            
            if (progressData.completed) {
              console.log('[UPLOAD] Upload completed, clearing interval')
              clearInterval(progressInterval.current!)
              setUploading(false)
              
              if (progressData.errors.length === 0) {
                // All files uploaded successfully
                setTimeout(() => {
                  onUploadComplete()
                  handleClose()
                }, 2000)
              }
            }
          } else {
            console.error('[UPLOAD] Progress check failed:', progressData)
            if (pollCount > 3) { // Stop polling after a few failures
              clearInterval(progressInterval.current!)
              setError('Failed to get upload progress')
              setUploading(false)
            }
          }
        } catch (error) {
          console.error(`Progress check error #${pollCount}:`, error)
          if (pollCount > 10) { // Stop polling after many attempts
            clearInterval(progressInterval.current!)
            setError('Lost connection to upload progress')
            setUploading(false)
          }
        }
      }, 500) // Poll more frequently for better responsiveness

    } catch (error) {
      setError(error instanceof Error ? error.message : 'Upload failed')
      setUploading(false)
    }
  }

  const handleClose = () => {
    if (progressInterval.current) {
      clearInterval(progressInterval.current)
    }
    setFiles([])
    setUploadType('files')
    setUploading(false)
    setProgress(null)
    setError(null)
    setDragActive(false)
    onClose()
  }

  const removeFile = (index: number) => {
    setFiles(files.filter((_, i) => i !== index))
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const getProgressPercentage = () => {
    if (!progress) return 0
    return Math.round((progress.processedFiles / progress.totalFiles) * 100)
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Upload Files to {albumName}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Upload Area */}
          {!uploading && (
            <div
              className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
                dragActive 
                  ? 'border-blue-500 bg-blue-50' 
                  : 'border-gray-300 hover:border-gray-400'
              }`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <div className="flex flex-col items-center space-y-4">
                <div className="p-4 rounded-full bg-gray-100">
                  <Upload className="h-8 w-8 text-gray-600" />
                </div>
                
                <div>
                  <p className="text-lg font-medium">
                    Drop files here or click to browse
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    Support for {supportedFormats.join(', ')} files up to 50MB each
                  </p>
                  <p className="text-sm text-gray-500">
                    You can also upload a ZIP file containing photos (max 2GB total)
                  </p>
                  <p className="text-xs text-gray-400 mt-2">
                    Files will be processed in batches based on your admin settings
                  </p>
                </div>

                <Button 
                  onClick={() => fileInputRef.current?.click()}
                  variant="outline"
                >
                  <FileImage className="h-4 w-4 mr-2" />
                  Choose Files
                </Button>

                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept={supportedFormats.join(',') + ',.zip'}
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </div>
            </div>
          )}

              {/* File List */}
          {files.length > 0 && !uploading && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="font-medium">
                  {uploadType === 'zip' ? 'ZIP Archive' : 'Selected Files'} ({files.length})
                </h3>
                <div className="flex items-center gap-2">
                  {files.length > 100 && (
                    <span className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded">
                      Large batch - will process in parallel
                    </span>
                  )}
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => setFiles([])}
                  >
                    Clear All
                  </Button>
                </div>
              </div>
              
              <div className="text-sm text-gray-600 mb-2">
                Total size: {formatFileSize(files.reduce((sum: number, file: File) => sum + file.size, 0))}
              </div>
              
              <div className="max-h-48 overflow-y-auto space-y-2">
                {files.map((file, index) => (
                  <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center space-x-3">
                      {uploadType === 'zip' ? (
                        <Archive className="h-5 w-5 text-orange-500" />
                      ) : (
                        <FileImage className="h-5 w-5 text-blue-500" />
                      )}
                      <div>
                        <p className="font-medium text-sm">{file.name}</p>
                        <p className="text-xs text-gray-500">{formatFileSize(file.size)}</p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => removeFile(index)}
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Progress */}
          {uploading && progress && (
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>
                    {progress.phase === 'validating' && 'Validating files...'}
                    {progress.phase === 'extracting' && 'Extracting ZIP archive...'}
                    {progress.phase === 'uploading' && `Batch ${progress.currentBatch}/${progress.totalBatches}`}
                    {progress.phase === 'completed' && 'Upload completed'}
                    {progress.phase === 'error' && 'Upload failed'}
                  </span>
                  <span>{getProgressPercentage()}%</span>
                </div>
                <Progress value={getProgressPercentage()} />
                <p className="text-sm text-gray-600">
                  {progress.processedFiles} of {progress.totalFiles} files processed
                </p>
              </div>

              {/* Individual File Progress */}
              {progress.files && progress.files.length > 0 ? (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium">File Status:</h4>
                  <div className="max-h-48 overflow-y-auto space-y-1">
                    {progress.files.map((file, index) => (
                      <div key={index} className="flex items-center justify-between p-2 border rounded text-xs">
                        <div className="flex items-center space-x-2 flex-1 min-w-0">
                          {file.status === 'pending' && <div className="w-3 h-3 rounded-full bg-gray-300" />}
                          {file.status === 'processing' && <Loader2 className="w-3 h-3 animate-spin text-blue-500" />}
                          {file.status === 'completed' && <CheckCircle className="w-3 h-3 text-green-500" />}
                          {file.status === 'error' && <AlertCircle className="w-3 h-3 text-red-500" />}
                          <span className="truncate">{file.filename}</span>
                          {file.error && (
                            <span className="text-red-500 text-xs">({file.error})</span>
                          )}
                        </div>
                        <div className="text-gray-500 ml-2">
                          {formatFileSize(file.size)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : progress.totalFiles > 0 && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium">Processing Files:</h4>
                  <div className="text-sm text-gray-600">
                    {progress.phase === 'extracting' && 'Extracting files from ZIP archive...'}
                    {progress.phase === 'validating' && 'Validating files...'}
                    {progress.phase === 'uploading' && `Processing ${progress.totalFiles} files...`}
                  </div>
                </div>
              )}

              {progress.errors.length > 0 && (
                <div className="border border-red-200 bg-red-50 p-3 rounded-lg">
                  <div className="flex items-center">
                    <AlertCircle className="h-4 w-4 text-red-600 mr-2" />
                    <div className="text-sm text-red-700">
                      {progress.errors.length} file(s) failed to upload:
                      <ul className="mt-1 space-y-1">
                        {progress.errors.slice(0, 3).map((error, index) => (
                          <li key={index} className="text-xs">
                            {error.filename}: {error.error}
                          </li>
                        ))}
                        {progress.errors.length > 3 && (
                          <li className="text-xs">...and {progress.errors.length - 3} more</li>
                        )}
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              {progress.completed && progress.errors.length === 0 && (
                <div className="border border-green-200 bg-green-50 p-3 rounded-lg">
                  <div className="flex items-center">
                    <CheckCircle className="h-4 w-4 text-green-600 mr-2" />
                    <div className="text-sm text-green-700">
                      All files uploaded successfully! The sync process will handle uploading to remote storage.
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="border border-red-200 bg-red-50 p-3 rounded-lg">
              <div className="flex items-center">
                <AlertCircle className="h-4 w-4 text-red-600 mr-2" />
                <div className="text-sm text-red-700">{error}</div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end space-x-3">
            <Button variant="outline" onClick={handleClose} disabled={uploading}>
              {uploading ? 'Close when done' : 'Cancel'}
            </Button>
            {files.length > 0 && !uploading && !progress?.completed && (
              <Button onClick={startUpload}>
                <Upload className="h-4 w-4 mr-2" />
                Upload {files.length} {uploadType === 'zip' ? 'ZIP file' : 'file(s)'}
              </Button>
            )}
            {uploading && (
              <Button disabled>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Uploading...
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
