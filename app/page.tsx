'use client'

import React, { useState, useRef, useCallback, useEffect } from 'react'
import { callAIAgent, uploadFiles, type ArtifactFile } from '@/lib/aiAgent'
import { cn } from '@/lib/utils'
import { RiImageAddLine, RiHistoryLine, RiDownloadLine, RiRefreshLine, RiSendPlaneFill, RiGridLine, RiCloseLine, RiArrowLeftLine, RiZoomInLine, RiZoomOutLine, RiCompareLine, RiMagicLine, RiSparklingLine, RiImageEditLine } from 'react-icons/ri'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------
const AGENT_ID = '699c43ae3cd6d5c8e728bb4c'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
interface EditHistoryItem {
  id: string
  prompt: string
  editType: string
  editDescription: string
  imageUrl: string
  assetIds: string[]
  timestamp: Date
}

// ---------------------------------------------------------------------------
// Markdown renderer
// ---------------------------------------------------------------------------
function formatInline(text: string) {
  const parts = text.split(/\*\*(.*?)\*\*/g)
  if (parts.length === 1) return text
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <strong key={i} className="font-semibold">
        {part}
      </strong>
    ) : (
      part
    )
  )
}

function renderMarkdown(text: string) {
  if (!text) return null
  return (
    <div className="space-y-2">
      {text.split('\n').map((line, i) => {
        if (line.startsWith('### '))
          return (
            <h4 key={i} className="font-semibold text-sm mt-3 mb-1">
              {line.slice(4)}
            </h4>
          )
        if (line.startsWith('## '))
          return (
            <h3 key={i} className="font-semibold text-base mt-3 mb-1">
              {line.slice(3)}
            </h3>
          )
        if (line.startsWith('# '))
          return (
            <h2 key={i} className="font-bold text-lg mt-4 mb-2">
              {line.slice(2)}
            </h2>
          )
        if (line.startsWith('- ') || line.startsWith('* '))
          return (
            <li key={i} className="ml-4 list-disc text-sm">
              {formatInline(line.slice(2))}
            </li>
          )
        if (/^\d+\.\s/.test(line))
          return (
            <li key={i} className="ml-4 list-decimal text-sm">
              {formatInline(line.replace(/^\d+\.\s/, ''))}
            </li>
          )
        if (!line.trim()) return <div key={i} className="h-1" />
        return (
          <p key={i} className="text-sm">
            {formatInline(line)}
          </p>
        )
      })}
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sample data
// ---------------------------------------------------------------------------
const SAMPLE_HISTORY: EditHistoryItem[] = [
  {
    id: 'sample-1',
    prompt: 'Remove background and replace with sunset beach',
    editType: 'background_change',
    editDescription: 'Removed the original background and replaced it with a warm sunset beach scene with golden hour lighting.',
    imageUrl: '',
    assetIds: [],
    timestamp: new Date(Date.now() - 3600000),
  },
  {
    id: 'sample-2',
    prompt: 'Apply oil painting style transfer',
    editType: 'style_transfer',
    editDescription: 'Applied impressionist oil painting style with visible brush strokes and warm color palette.',
    imageUrl: '',
    assetIds: [],
    timestamp: new Date(Date.now() - 1800000),
  },
  {
    id: 'sample-3',
    prompt: 'Enhance colors and add vignette',
    editType: 'color_adjustment',
    editDescription: 'Boosted saturation by 15%, increased contrast, and added a subtle dark vignette around edges.',
    imageUrl: '',
    assetIds: [],
    timestamp: new Date(Date.now() - 600000),
  },
]

const SAMPLE_SUGGESTIONS = [
  'Adjust brightness and contrast',
  'Add a soft bokeh background blur',
  'Remove unwanted objects from the scene',
  'Apply vintage film filter',
]

// ---------------------------------------------------------------------------
// ErrorBoundary
// ---------------------------------------------------------------------------
class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  { hasError: boolean; error: string }
> {
  constructor(props: { children: React.ReactNode }) {
    super(props)
    this.state = { hasError: false, error: '' }
  }
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error: error.message }
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
          <div className="text-center p-8 max-w-md">
            <h2 className="text-xl font-semibold mb-2">Something went wrong</h2>
            <p className="text-muted-foreground mb-4 text-sm">{this.state.error}</p>
            <button
              onClick={() => this.setState({ hasError: false, error: '' })}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm"
            >
              Try again
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function UploadZone({ onFileSelect }: { onFileSelect: (file: File) => void }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [isDragOver, setIsDragOver] = useState(false)

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault()
      setIsDragOver(false)
      const file = e.dataTransfer.files[0]
      if (file && (file.type === 'image/png' || file.type === 'image/jpeg' || file.type === 'image/webp')) {
        onFileSelect(file)
      }
    },
    [onFileSelect]
  )

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) onFileSelect(file)
    },
    [onFileSelect]
  )

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        setIsDragOver(true)
      }}
      onDragLeave={() => setIsDragOver(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={cn(
        'flex flex-col items-center justify-center gap-6 w-full max-w-lg mx-auto p-12 rounded-xl border-2 border-dashed cursor-pointer transition-all duration-300',
        isDragOver
          ? 'border-accent bg-accent/10 scale-[1.02]'
          : 'border-border hover:border-accent/50 hover:bg-card'
      )}
    >
      <div className="w-20 h-20 rounded-2xl bg-accent/15 flex items-center justify-center">
        <RiImageAddLine className="w-10 h-10 text-accent" />
      </div>
      <div className="text-center space-y-2">
        <p className="text-foreground font-semibold text-lg tracking-tight">
          Drop your image here or click to browse
        </p>
        <p className="text-muted-foreground text-sm">
          Supports PNG, JPG, and WEBP formats
        </p>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={handleChange}
        className="hidden"
      />
    </div>
  )
}

function HistoryCard({
  item,
  isActive,
  onClick,
}: {
  item: EditHistoryItem
  isActive: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left p-3 rounded-xl transition-all duration-200 border',
        isActive
          ? 'bg-accent/15 border-accent/40'
          : 'bg-card border-border hover:bg-secondary hover:border-border'
      )}
    >
      <div className="flex gap-3">
        {item.imageUrl ? (
          <img
            src={item.imageUrl}
            alt="Edit result"
            className="w-12 h-12 rounded-lg object-cover flex-shrink-0 bg-muted"
          />
        ) : (
          <div className="w-12 h-12 rounded-lg bg-muted flex items-center justify-center flex-shrink-0">
            <RiImageEditLine className="w-5 h-5 text-muted-foreground" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-xs text-foreground font-medium truncate">{item.prompt}</p>
          <Badge variant="secondary" className="mt-1 text-[10px] px-1.5 py-0">
            {item.editType?.replace(/_/g, ' ') || 'edit'}
          </Badge>
        </div>
      </div>
    </button>
  )
}

function ComparisonSlider({
  originalImage,
  editedImage,
  position,
  onPositionChange,
}: {
  originalImage: string
  editedImage: string
  position: number
  onPositionChange: (pos: number) => void
}) {
  const containerRef = useRef<HTMLDivElement>(null)
  const isDraggingRef = useRef(false)

  const handleMove = useCallback(
    (clientX: number) => {
      if (!containerRef.current) return
      const rect = containerRef.current.getBoundingClientRect()
      const x = clientX - rect.left
      const pct = Math.max(0, Math.min(100, (x / rect.width) * 100))
      onPositionChange(pct)
    },
    [onPositionChange]
  )

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (isDraggingRef.current) handleMove(e.clientX)
    }
    const handleMouseUp = () => {
      isDraggingRef.current = false
    }
    window.addEventListener('mousemove', handleMouseMove)
    window.addEventListener('mouseup', handleMouseUp)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
      window.removeEventListener('mouseup', handleMouseUp)
    }
  }, [handleMove])

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full overflow-hidden rounded-xl cursor-col-resize select-none"
      onMouseDown={(e) => {
        isDraggingRef.current = true
        handleMove(e.clientX)
      }}
    >
      {/* Edited (bottom layer) */}
      <img src={editedImage} alt="Edited" className="absolute inset-0 w-full h-full object-contain" />
      {/* Original (top layer, clipped) */}
      <div
        className="absolute inset-0 overflow-hidden"
        style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
      >
        <img src={originalImage} alt="Original" className="w-full h-full object-contain" />
      </div>
      {/* Slider line */}
      <div
        className="absolute top-0 bottom-0 w-0.5 bg-white/80 shadow-lg z-10"
        style={{ left: `${position}%` }}
      >
        <div className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-8 h-8 rounded-full bg-white shadow-lg flex items-center justify-center">
          <RiCompareLine className="w-4 h-4 text-gray-700" />
        </div>
      </div>
      {/* Labels */}
      <div className="absolute top-3 left-3 z-10">
        <span className="text-xs bg-black/60 text-white px-2 py-0.5 rounded-md">Original</span>
      </div>
      <div className="absolute top-3 right-3 z-10">
        <span className="text-xs bg-black/60 text-white px-2 py-0.5 rounded-md">Edited</span>
      </div>
    </div>
  )
}

function AgentStatusBar({ isActive }: { isActive: boolean }) {
  return (
    <div className="flex items-center gap-3 px-4 py-2 rounded-xl bg-card border border-border">
      <div className="flex items-center gap-2">
        <div className={cn('w-2 h-2 rounded-full', isActive ? 'bg-green-400 animate-pulse' : 'bg-muted-foreground/40')} />
        <span className="text-xs text-muted-foreground">Image Editor Agent</span>
      </div>
      <span className="text-[10px] text-muted-foreground/60 font-mono">{AGENT_ID.slice(0, 8)}...</span>
      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
        {isActive ? 'Processing' : 'Ready'}
      </Badge>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function Page() {
  // Image state
  const [originalImage, setOriginalImage] = useState<string | null>(null)
  const [originalAssetIds, setOriginalAssetIds] = useState<string[]>([])
  const [currentImage, setCurrentImage] = useState<string | null>(null)
  const [currentAssetIds, setCurrentAssetIds] = useState<string[]>([])

  // Edit state
  const [editHistory, setEditHistory] = useState<EditHistoryItem[]>([])
  const [activeHistoryId, setActiveHistoryId] = useState<string | null>(null)
  const [variations, setVariations] = useState<ArtifactFile[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [editDescription, setEditDescription] = useState('')
  const [editType, setEditType] = useState('')

  // UI state
  const [showComparison, setShowComparison] = useState(false)
  const [comparisonPosition, setComparisonPosition] = useState(50)
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [zoom, setZoom] = useState(100)
  const [showSampleData, setShowSampleData] = useState(false)

  // Session
  const [sessionId] = useState(() => {
    if (typeof window !== 'undefined') return crypto.randomUUID()
    return 'ssr-placeholder'
  })

  // Derived
  const hasImage = Boolean(originalImage)
  const displayHistory = showSampleData && editHistory.length === 0 ? SAMPLE_HISTORY : editHistory
  const displaySuggestions = showSampleData && suggestions.length === 0 ? SAMPLE_SUGGESTIONS : suggestions

  // Handlers ---------------------------------------------------------------

  const handleUpload = useCallback(async (file: File) => {
    const localUrl = URL.createObjectURL(file)
    setOriginalImage(localUrl)
    setCurrentImage(localUrl)
    setError(null)
    setIsUploading(true)

    try {
      const uploadResult = await uploadFiles(file)
      if (uploadResult.success && Array.isArray(uploadResult.asset_ids) && uploadResult.asset_ids.length > 0) {
        setOriginalAssetIds(uploadResult.asset_ids)
        setCurrentAssetIds(uploadResult.asset_ids)
      } else {
        setError('Upload failed. Please try again with a different image.')
      }
    } catch {
      setError('Upload error. Check your connection and try again.')
    } finally {
      setIsUploading(false)
    }
  }, [])

  const handleApplyEdit = useCallback(async () => {
    if (!prompt.trim() || currentAssetIds.length === 0) return
    setIsLoading(true)
    setError(null)
    setVariations([])

    try {
      const result = await callAIAgent(prompt, AGENT_ID, {
        session_id: sessionId,
        assets: currentAssetIds,
      })

      if (result.success) {
        const editDesc = result.response?.result?.edit_description ?? ''
        const eType = result.response?.result?.edit_type ?? ''
        const sug = Array.isArray(result.response?.result?.suggestions) ? result.response.result.suggestions : []
        const images = Array.isArray(result?.module_outputs?.artifact_files) ? result.module_outputs!.artifact_files : []

        if (images.length > 0) {
          const newImageUrl = images[0]?.file_url ?? ''
          if (newImageUrl) {
            setCurrentImage(newImageUrl)
            setSuggestions(sug)
            setEditDescription(editDesc)
            setEditType(eType)

            const newId = crypto.randomUUID()
            setEditHistory((prev) => [
              ...prev,
              {
                id: newId,
                prompt: prompt,
                editType: eType,
                editDescription: editDesc,
                imageUrl: newImageUrl,
                assetIds: currentAssetIds,
                timestamp: new Date(),
              },
            ])
            setActiveHistoryId(newId)
          } else {
            setError('No image URL returned. The agent may not have produced an output.')
          }
        } else {
          // No images but maybe text response
          const message = result.response?.message ?? result.response?.result?.edit_description ?? ''
          setError(message || 'No edited image returned. Try rephrasing your prompt.')
        }
      } else {
        setError(result.error || 'Edit failed. Try rephrasing your prompt.')
      }
    } catch {
      setError('An unexpected error occurred. Please try again.')
    } finally {
      setIsLoading(false)
      setPrompt('')
    }
  }, [prompt, currentAssetIds, sessionId])

  const handleGenerateVariations = useCallback(async () => {
    if (!prompt.trim() || currentAssetIds.length === 0) return
    setIsLoading(true)
    setError(null)
    setVariations([])

    try {
      const variationPrompt = `Generate 3 different variations of this edit: ${prompt}`
      const result = await callAIAgent(variationPrompt, AGENT_ID, {
        session_id: sessionId,
        assets: currentAssetIds,
      })

      if (result.success) {
        const images = Array.isArray(result?.module_outputs?.artifact_files) ? result.module_outputs!.artifact_files : []
        const sug = Array.isArray(result.response?.result?.suggestions) ? result.response.result.suggestions : []

        if (images.length > 0) {
          setVariations(images)
          setSuggestions(sug)
        } else {
          setError('No variations generated. Try a different prompt.')
        }
      } else {
        setError(result.error || 'Failed to generate variations.')
      }
    } catch {
      setError('An unexpected error occurred while generating variations.')
    } finally {
      setIsLoading(false)
      setPrompt('')
    }
  }, [prompt, currentAssetIds, sessionId])

  const handleSelectVariation = useCallback((artifact: ArtifactFile) => {
    const url = artifact?.file_url
    if (url) {
      setCurrentImage(url)
      setVariations([])
    }
  }, [])

  const handleRevert = useCallback((item: EditHistoryItem) => {
    if (item.imageUrl) {
      setCurrentImage(item.imageUrl)
    }
    setActiveHistoryId(item.id)
    setEditDescription(item.editDescription)
    setEditType(item.editType)
  }, [])

  const handleReset = useCallback(() => {
    if (originalImage) {
      setCurrentImage(originalImage)
      setCurrentAssetIds(originalAssetIds)
    }
    setEditHistory([])
    setVariations([])
    setSuggestions([])
    setEditDescription('')
    setEditType('')
    setActiveHistoryId(null)
    setError(null)
    setShowComparison(false)
    setZoom(100)
  }, [originalImage, originalAssetIds])

  const handleDownload = useCallback(async () => {
    if (!currentImage) return
    try {
      const response = await fetch(currentImage)
      const blob = await response.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `pixelprompt-edit-${Date.now()}.png`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch {
      // Fallback: open in new tab
      window.open(currentImage, '_blank')
    }
  }, [currentImage])

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleApplyEdit()
      }
    },
    [handleApplyEdit]
  )

  // Render -----------------------------------------------------------------
  return (
    <ErrorBoundary>
      <div className="min-h-screen bg-background text-foreground flex flex-col font-sans">
        {/* ==================== HEADER ==================== */}
        <header className="flex items-center justify-between px-4 md:px-6 py-3 border-b border-border bg-card/60 backdrop-blur-sm flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-accent/20 flex items-center justify-center">
              <RiSparklingLine className="w-5 h-5 text-accent" />
            </div>
            <h1 className="text-lg font-bold tracking-tight text-foreground">PixelPrompt</h1>
            <span className="hidden md:inline text-xs text-muted-foreground ml-1">AI Image Editor</span>
          </div>

          <div className="flex items-center gap-3">
            {/* Sample data toggle */}
            <div className="flex items-center gap-2 mr-2">
              <Label htmlFor="sample-toggle" className="text-xs text-muted-foreground cursor-pointer">
                Sample Data
              </Label>
              <Switch
                id="sample-toggle"
                checked={showSampleData}
                onCheckedChange={setShowSampleData}
              />
            </div>

            {hasImage && (
              <>
                <button
                  onClick={handleDownload}
                  disabled={!currentImage}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg bg-secondary hover:bg-muted transition-all duration-200 text-foreground disabled:opacity-40"
                >
                  <RiDownloadLine className="w-4 h-4" />
                  <span className="hidden sm:inline">Download</span>
                </button>
                <button
                  onClick={handleReset}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-lg hover:bg-secondary transition-all duration-200 text-muted-foreground hover:text-foreground"
                >
                  <RiRefreshLine className="w-4 h-4" />
                  <span className="hidden sm:inline">Reset</span>
                </button>
              </>
            )}
          </div>
        </header>

        {/* ==================== MAIN CONTENT ==================== */}
        <div className="flex flex-1 overflow-hidden">
          {/* ---------- LEFT SIDEBAR: HISTORY ---------- */}
          {hasImage && (
            <div
              className={cn(
                'flex-shrink-0 border-r border-border bg-card/40 transition-all duration-300 overflow-hidden',
                sidebarOpen ? 'w-64' : 'w-0'
              )}
            >
              {sidebarOpen && (
                <div className="flex flex-col h-full w-64">
                  <div className="flex items-center justify-between p-3 border-b border-border">
                    <div className="flex items-center gap-2">
                      <RiHistoryLine className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm font-semibold tracking-tight">Edit History</span>
                    </div>
                    <button
                      onClick={() => setSidebarOpen(false)}
                      className="p-1 rounded-md hover:bg-secondary transition-colors"
                    >
                      <RiArrowLeftLine className="w-4 h-4 text-muted-foreground" />
                    </button>
                  </div>
                  <ScrollArea className="flex-1 p-3">
                    {displayHistory.length === 0 ? (
                      <div className="text-center py-8">
                        <RiHistoryLine className="w-8 h-8 text-muted-foreground/30 mx-auto mb-2" />
                        <p className="text-xs text-muted-foreground">
                          Your edit history will appear here
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {displayHistory.map((item) => (
                          <HistoryCard
                            key={item.id}
                            item={item}
                            isActive={activeHistoryId === item.id}
                            onClick={() => handleRevert(item)}
                          />
                        ))}
                      </div>
                    )}
                  </ScrollArea>
                </div>
              )}
            </div>
          )}

          {/* Sidebar toggle (when collapsed) */}
          {hasImage && !sidebarOpen && (
            <button
              onClick={() => setSidebarOpen(true)}
              className="absolute left-2 top-1/2 -translate-y-1/2 z-20 p-2 rounded-lg bg-card border border-border shadow-lg hover:bg-secondary transition-all duration-200"
            >
              <RiHistoryLine className="w-4 h-4 text-muted-foreground" />
            </button>
          )}

          {/* ---------- CENTER: CANVAS ---------- */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {!hasImage ? (
              /* ---- UPLOAD STATE ---- */
              <div className="flex-1 flex flex-col items-center justify-center p-8">
                <UploadZone onFileSelect={handleUpload} />
                {isUploading && (
                  <div className="mt-4 flex items-center gap-2 text-sm text-muted-foreground">
                    <div className="w-4 h-4 border-2 border-accent border-t-transparent rounded-full animate-spin" />
                    Uploading image...
                  </div>
                )}
                {error && (
                  <p className="mt-4 text-sm text-red-400">{error}</p>
                )}
                <div className="mt-8 text-center max-w-md">
                  <p className="text-muted-foreground text-sm leading-relaxed">
                    Upload an image to get started. Describe your edits in natural language and let AI transform your photos.
                  </p>
                </div>
              </div>
            ) : (
              /* ---- IMAGE LOADED STATE ---- */
              <div className="flex-1 flex flex-col overflow-hidden">
                {/* Canvas toolbar */}
                <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card/30 flex-shrink-0">
                  <div className="flex items-center gap-2">
                    {editType && (
                      <Badge variant="secondary" className="text-xs">
                        {editType.replace(/_/g, ' ')}
                      </Badge>
                    )}
                    {editDescription && (
                      <span className="text-xs text-muted-foreground truncate max-w-[300px]">
                        {editDescription}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {/* Compare button */}
                    {editHistory.length > 0 && currentImage !== originalImage && (
                      <button
                        onClick={() => setShowComparison((prev) => !prev)}
                        className={cn(
                          'flex items-center gap-1.5 px-2.5 py-1.5 text-xs rounded-lg transition-all duration-200',
                          showComparison ? 'bg-accent text-accent-foreground' : 'bg-secondary hover:bg-muted text-foreground'
                        )}
                      >
                        <RiCompareLine className="w-3.5 h-3.5" />
                        Compare
                      </button>
                    )}
                    {/* Zoom */}
                    <button
                      onClick={() => setZoom((z) => Math.max(25, z - 25))}
                      className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground"
                    >
                      <RiZoomOutLine className="w-4 h-4" />
                    </button>
                    <span className="text-xs text-muted-foreground min-w-[40px] text-center">{zoom}%</span>
                    <button
                      onClick={() => setZoom((z) => Math.min(200, z + 25))}
                      className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground"
                    >
                      <RiZoomInLine className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Canvas area */}
                <div className="flex-1 overflow-auto flex items-center justify-center p-4 bg-background/50 relative">
                  {isLoading ? (
                    <div className="w-full max-w-2xl aspect-video relative">
                      <Skeleton className="w-full h-full rounded-xl" />
                      <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
                        <div className="w-10 h-10 border-3 border-accent border-t-transparent rounded-full animate-spin" />
                        <p className="text-sm text-muted-foreground">Applying edits...</p>
                      </div>
                    </div>
                  ) : showComparison && originalImage && currentImage && currentImage !== originalImage ? (
                    <div className="w-full max-w-3xl aspect-video">
                      <ComparisonSlider
                        originalImage={originalImage}
                        editedImage={currentImage}
                        position={comparisonPosition}
                        onPositionChange={setComparisonPosition}
                      />
                    </div>
                  ) : (
                    <div
                      className="transition-transform duration-300"
                      style={{ transform: `scale(${zoom / 100})` }}
                    >
                      {currentImage && (
                        <img
                          src={currentImage}
                          alt="Current edit"
                          className="max-w-full max-h-[60vh] rounded-xl shadow-lg object-contain"
                        />
                      )}
                    </div>
                  )}
                </div>

                {/* Variations grid */}
                {Array.isArray(variations) && variations.length > 0 && (
                  <div className="px-4 py-3 border-t border-border bg-card/30 flex-shrink-0">
                    <div className="flex items-center gap-2 mb-2">
                      <RiGridLine className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm font-semibold tracking-tight">Variations</span>
                      <button
                        onClick={() => setVariations([])}
                        className="ml-auto p-1 rounded-md hover:bg-secondary transition-colors"
                      >
                        <RiCloseLine className="w-4 h-4 text-muted-foreground" />
                      </button>
                    </div>
                    <div className="flex gap-3 overflow-x-auto pb-1">
                      {variations.map((v, i) => (
                        <button
                          key={v?.file_url ?? i}
                          onClick={() => handleSelectVariation(v)}
                          className="flex-shrink-0 group relative rounded-xl overflow-hidden border border-border hover:border-accent transition-all duration-200"
                        >
                          <img
                            src={v?.file_url ?? ''}
                            alt={v?.name ?? `Variation ${i + 1}`}
                            className="w-32 h-32 object-cover"
                          />
                          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all duration-200 flex items-center justify-center">
                            <span className="text-white text-xs opacity-0 group-hover:opacity-100 transition-opacity font-medium">
                              Use This
                            </span>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Suggestions */}
                {Array.isArray(displaySuggestions) && displaySuggestions.length > 0 && !isLoading && (
                  <div className="px-4 py-2 border-t border-border bg-card/20 flex-shrink-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <RiMagicLine className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                      <span className="text-xs text-muted-foreground mr-1">Suggestions:</span>
                      {displaySuggestions.map((s, i) => (
                        <button
                          key={i}
                          onClick={() => setPrompt(typeof s === 'string' ? s : '')}
                          className="text-xs px-2.5 py-1 rounded-full bg-secondary hover:bg-accent/20 hover:text-accent transition-all duration-200 text-muted-foreground"
                        >
                          {typeof s === 'string' ? s : ''}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Error message */}
                {error && (
                  <div className="px-4 py-2 border-t border-red-500/20 bg-red-500/5 flex-shrink-0">
                    <p className="text-sm text-red-400">{error}</p>
                  </div>
                )}

                {/* ---- PROMPT BAR ---- */}
                <div className="px-4 py-3 border-t border-border bg-card/60 backdrop-blur-sm flex-shrink-0">
                  <div className="flex items-center gap-2 max-w-4xl mx-auto">
                    <div className="flex-1 relative">
                      <input
                        type="text"
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder="Describe your edit... e.g., Remove the background and replace it with a sunset beach"
                        disabled={isLoading || isUploading || currentAssetIds.length === 0}
                        className="w-full px-4 py-2.5 rounded-xl bg-input border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent/50 focus:border-accent/50 transition-all duration-200 disabled:opacity-50"
                      />
                    </div>
                    <button
                      onClick={handleApplyEdit}
                      disabled={isLoading || !prompt.trim() || currentAssetIds.length === 0}
                      className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-accent text-accent-foreground text-sm font-semibold hover:opacity-90 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {isLoading ? (
                        <div className="w-4 h-4 border-2 border-accent-foreground border-t-transparent rounded-full animate-spin" />
                      ) : (
                        <RiSendPlaneFill className="w-4 h-4" />
                      )}
                      <span className="hidden sm:inline">Apply Edit</span>
                    </button>
                    <button
                      onClick={handleGenerateVariations}
                      disabled={isLoading || !prompt.trim() || currentAssetIds.length === 0}
                      className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl border border-border text-sm hover:bg-secondary transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed text-muted-foreground hover:text-foreground"
                    >
                      <RiGridLine className="w-4 h-4" />
                      <span className="hidden md:inline">Variations</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ==================== FOOTER: Agent Status ==================== */}
        <footer className="flex items-center justify-center px-4 py-2 border-t border-border bg-card/30 flex-shrink-0">
          <AgentStatusBar isActive={isLoading} />
        </footer>
      </div>
    </ErrorBoundary>
  )
}
