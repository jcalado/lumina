import React, { useState, useRef, useCallback } from 'react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Progress } from '@/components/ui/progress'
import {
  Upload,
  X,
  FileImage,
  CheckCircle,
  AlertCircle,
  Loader2
} from 'lucide-react'
import { useTranslations } from 'next-intl'

interface FileUploadState {
  file: File
  filename: string
  s3Key: string
  presignedUrl: string
  status: 'pending' | 'uploading' | 'uploaded' | 'confirming' | 'completed' | 'error'
  progress: number
  error?: string
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
  const t = useTranslations('fileUpload')
  const [dragActive, setDragActive] = useState(false)
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [uploadStates, setUploadStates] = useState<FileUploadState[]>([])
  const [uploading, setUploading] = useState(false)
  const [phase, setPhase] = useState<'select' | 'uploading' | 'confirming' | 'completed' | 'error'>('select')
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const abortControllers = useRef<Map<string, AbortController>>(new Map())

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
      const selected = Array.from(e.target.files)
      validateAndSetFiles(selected)
    }
  }, [])

  const validateAndSetFiles = (fileList: File[]) => {
    setError(null)

    const validFiles: File[] = []
    const errors: string[] = []

    fileList.forEach(file => {
      const ext = '.' + file.name.split('.').pop()?.toLowerCase()
      if (!supportedFormats.includes(ext)) {
        errors.push(t('unsupportedFormat', { name: file.name, ext }))
        return
      }
      if (file.size > maxFileSize) {
        errors.push(t('fileTooLarge', { name: file.name, size: formatFileSize(file.size) }))
        return
      }
      validFiles.push(file)
    })

    if (errors.length > 0) {
      const shown = errors.slice(0, 5).join('\n')
      const extra = errors.length > 5 ? '\n' + t('andMore', { count: errors.length - 5 }) : ''
      setError(`${t('filesRejected')}\n${shown}${extra}`)
    }

    setSelectedFiles(validFiles)

    if (validFiles.length === 0 && errors.length > 0) {
      setError(t('noValidFiles', { formats: supportedFormats.join(', ') }))
    }
  }

  const uploadFileWithXHR = (state: FileUploadState): Promise<void> => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const pct = Math.round((e.loaded / e.total) * 100)
          setUploadStates(prev =>
            prev.map(s => s.filename === state.filename ? { ...s, progress: pct } : s)
          )
        }
      })

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          setUploadStates(prev =>
            prev.map(s => s.filename === state.filename ? { ...s, status: 'uploaded', progress: 100 } : s)
          )
          resolve()
        } else {
          const errMsg = t('s3UploadFailed', { status: xhr.status })
          setUploadStates(prev =>
            prev.map(s => s.filename === state.filename ? { ...s, status: 'error', error: errMsg } : s)
          )
          reject(new Error(errMsg))
        }
      })

      xhr.addEventListener('error', () => {
        const errMsg = t('networkError')
        setUploadStates(prev =>
          prev.map(s => s.filename === state.filename ? { ...s, status: 'error', error: errMsg } : s)
        )
        reject(new Error(errMsg))
      })

      xhr.open('PUT', state.presignedUrl)
      xhr.setRequestHeader('Content-Type', state.file.type || 'application/octet-stream')
      xhr.send(state.file)
    })
  }

  const startUpload = async () => {
    if (selectedFiles.length === 0) return

    setUploading(true)
    setPhase('uploading')
    setError(null)

    try {
      // 1. Get presigned URLs
      const fileMetadata = selectedFiles.map(f => ({
        filename: f.name,
        contentType: f.type || 'application/octet-stream',
        size: f.size,
      }))

      const presignResponse = await fetch(`/api/admin/albums/${albumId}/presign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: fileMetadata }),
      })

      if (!presignResponse.ok) {
        const err = await presignResponse.json()
        throw new Error(err.error || t('failedPresign'))
      }

      const { uploads } = await presignResponse.json()

      // 2. Initialize upload state
      const states: FileUploadState[] = uploads.map((u: any, i: number) => ({
        file: selectedFiles[i],
        filename: u.filename,
        s3Key: u.s3Key,
        presignedUrl: u.presignedUrl,
        status: 'pending' as const,
        progress: 0,
      }))

      setUploadStates(states)

      // 3. Upload files to S3 in parallel (batch of 12 at a time)
      const batchSize = 12
      for (let i = 0; i < states.length; i += batchSize) {
        const batch = states.slice(i, i + batchSize)

        // Mark batch as uploading
        setUploadStates(prev =>
          prev.map(s => batch.find(b => b.filename === s.filename) ? { ...s, status: 'uploading' } : s)
        )

        const results = await Promise.allSettled(
          batch.map(s => uploadFileWithXHR(s))
        )

        // Check for failures
        results.forEach((result, idx) => {
          if (result.status === 'rejected') {
            console.error(`Upload failed for ${batch[idx].filename}:`, result.reason)
          }
        })
      }

      // 4. Confirm uploads with the server
      setPhase('confirming')

      // Get the current state to check which uploads succeeded
      let currentStates: FileUploadState[] = []
      setUploadStates(prev => {
        currentStates = prev
        return prev
      })

      // Wait a tick for state to settle
      await new Promise(resolve => setTimeout(resolve, 50))

      setUploadStates(prev => {
        currentStates = prev
        return prev
      })

      const uploaded = currentStates.filter(s => s.status === 'uploaded')

      if (uploaded.length === 0) {
        throw new Error(t('noFilesUploaded'))
      }

      const confirmPayload = {
        files: uploaded.map(s => ({
          filename: s.filename,
          s3Key: s.s3Key,
          size: s.file.size,
          contentType: s.file.type || 'application/octet-stream',
        })),
      }

      const confirmResponse = await fetch(`/api/admin/albums/${albumId}/confirm-upload`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(confirmPayload),
      })

      if (!confirmResponse.ok) {
        const err = await confirmResponse.json()
        throw new Error(err.error || t('failedConfirm'))
      }

      const confirmResult = await confirmResponse.json()

      // Mark all uploaded as completed
      setUploadStates(prev =>
        prev.map(s => s.status === 'uploaded' ? { ...s, status: 'completed' } : s)
      )

      setPhase('completed')
      setUploading(false)

      // Auto-close after a delay
      setTimeout(() => {
        onUploadComplete()
        handleClose()
      }, 2000)

    } catch (error) {
      console.error('Upload error:', error)
      setError(error instanceof Error ? error.message : t('uploadFailed'))
      setPhase('error')
      setUploading(false)
    }
  }

  const handleClose = () => {
    // Abort any in-progress uploads
    abortControllers.current.forEach(controller => controller.abort())
    abortControllers.current.clear()

    setSelectedFiles([])
    setUploadStates([])
    setUploading(false)
    setPhase('select')
    setError(null)
    setDragActive(false)
    onClose()
  }

  const removeFile = (index: number) => {
    setSelectedFiles(selectedFiles.filter((_, i) => i !== index))
  }

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes'
    const k = 1024
    const sizes = ['Bytes', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i]
  }

  const overallProgress = () => {
    if (uploadStates.length === 0) return 0
    const total = uploadStates.reduce((sum, s) => sum + s.progress, 0)
    return Math.round(total / uploadStates.length)
  }

  const completedCount = uploadStates.filter(s => s.status === 'completed' || s.status === 'uploaded').length
  const errorCount = uploadStates.filter(s => s.status === 'error').length

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t('title', { album: albumName })}</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Upload Area */}
          {phase === 'select' && (
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
                    {t('dropOrBrowse')}
                  </p>
                  <p className="text-sm text-gray-500 mt-1">
                    {t('supportedFormats', { formats: supportedFormats.join(', '), maxSize: '50MB' })}
                  </p>
                  <p className="text-xs text-gray-400 mt-2">
                    {t('directToCloud')}
                  </p>
                </div>

                <Button
                  onClick={() => fileInputRef.current?.click()}
                  variant="outline"
                >
                  <FileImage className="h-4 w-4 mr-2" />
                  {t('chooseFiles')}
                </Button>

                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept={supportedFormats.join(',')}
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </div>
            </div>
          )}

          {/* File List (before upload) */}
          {selectedFiles.length > 0 && phase === 'select' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h3 className="font-medium">
                  {t('selectedFiles', { count: selectedFiles.length })}
                </h3>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedFiles([])}
                >
                  {t('clearAll')}
                </Button>
              </div>

              <div className="text-sm text-gray-600 mb-2">
                {t('totalSize', { size: formatFileSize(selectedFiles.reduce((sum, f) => sum + f.size, 0)) })}
              </div>

              <div className="max-h-48 overflow-y-auto space-y-2">
                {selectedFiles.map((file, index) => (
                  <div key={index} className="flex items-center justify-between p-3 border rounded-lg">
                    <div className="flex items-center space-x-3">
                      <FileImage className="h-5 w-5 text-blue-500" />
                      <div>
                        <p className="font-medium text-sm">{file.name}</p>
                        <p className="text-xs text-gray-500">{formatFileSize(file.size)}</p>
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => removeFile(index)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Upload Progress */}
          {(phase === 'uploading' || phase === 'confirming' || phase === 'completed') && uploadStates.length > 0 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span>
                    {phase === 'uploading' && t('uploadingToCloud')}
                    {phase === 'confirming' && t('registeringFiles')}
                    {phase === 'completed' && t('uploadCompleted')}
                  </span>
                  <span>{overallProgress()}%</span>
                </div>
                <Progress value={overallProgress()} />
                <p className="text-sm text-gray-600">
                  {t('filesUploaded', { completed: completedCount, total: uploadStates.length })}
                  {errorCount > 0 && t('filesFailed', { count: errorCount })}
                </p>
              </div>

              {/* Per-file status */}
              <div className="max-h-64 overflow-y-auto space-y-2">
                {uploadStates.map((state, index) => (
                  <div key={index} className="p-2 border rounded space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center space-x-2 min-w-0 flex-1">
                        {state.status === 'pending' && <div className="w-3 h-3 rounded-full bg-gray-300 shrink-0" />}
                        {state.status === 'uploading' && <Loader2 className="w-3 h-3 animate-spin text-blue-500 shrink-0" />}
                        {(state.status === 'uploaded' || state.status === 'confirming') && <CheckCircle className="w-3 h-3 text-yellow-500 shrink-0" />}
                        {state.status === 'completed' && <CheckCircle className="w-3 h-3 text-green-500 shrink-0" />}
                        {state.status === 'error' && <AlertCircle className="w-3 h-3 text-red-500 shrink-0" />}
                        <span className="truncate">{state.filename}</span>
                      </div>
                      <div className="flex items-center gap-2 ml-2 shrink-0">
                        {state.status === 'uploading' && (
                          <span className="text-blue-600 tabular-nums">{state.progress}%</span>
                        )}
                        <span className="text-muted-foreground">{formatFileSize(state.file.size)}</span>
                      </div>
                    </div>
                    {(state.status === 'uploading' || state.status === 'uploaded' || state.status === 'completed') && (
                      <Progress
                        value={state.progress}
                        className="h-1"
                      />
                    )}
                    {state.status === 'error' && state.error && (
                      <p className="text-xs text-red-500">{state.error}</p>
                    )}
                  </div>
                ))}
              </div>

              {phase === 'completed' && errorCount === 0 && (
                <div className="border border-green-200 bg-green-50 p-3 rounded-lg">
                  <div className="flex items-center">
                    <CheckCircle className="h-4 w-4 text-green-600 mr-2" />
                    <div className="text-sm text-green-700">
                      {t('allFilesSuccess')}
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
                <div className="text-sm text-red-700 whitespace-pre-line">{error}</div>
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex justify-end space-x-3">
            <Button variant="outline" onClick={handleClose} disabled={uploading && phase === 'uploading'}>
              {phase === 'completed' ? t('close') : t('cancel')}
            </Button>
            {selectedFiles.length > 0 && phase === 'select' && (
              <Button onClick={startUpload}>
                <Upload className="h-4 w-4 mr-2" />
                {t('uploadCount', { count: selectedFiles.length })}
              </Button>
            )}
            {uploading && (
              <Button disabled>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                {phase === 'confirming' ? t('registering') : t('uploading')}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
