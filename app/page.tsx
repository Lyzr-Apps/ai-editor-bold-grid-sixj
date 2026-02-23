'use client'

import React, { useState, useRef, useCallback } from 'react'
import { callAIAgent, uploadFiles, type AIAgentResponse, type ArtifactFile } from '@/lib/aiAgent'
import { cn } from '@/lib/utils'
import { RiImageAddLine, RiDownloadLine, RiArrowGoBackLine, RiArrowRightLine, RiCloseLine } from 'react-icons/ri'

const AGENT_ID = '699c43ae3cd6d5c8e728bb4c'

// Extract artifact files from any level of the response
function extractArtifactFiles(result: AIAgentResponse): ArtifactFile[] {
  // 1. Top-level module_outputs (standard location)
  if (Array.isArray(result?.module_outputs?.artifact_files) && result.module_outputs!.artifact_files.length > 0) {
    return result.module_outputs!.artifact_files
  }
  // 2. Inside response.result.module_outputs
  const r = result?.response?.result
  if (r && typeof r === 'object') {
    if (Array.isArray(r.module_outputs?.artifact_files) && r.module_outputs.artifact_files.length > 0) {
      return r.module_outputs.artifact_files
    }
    // 3. artifact_files directly on result
    if (Array.isArray(r.artifact_files) && r.artifact_files.length > 0) {
      return r.artifact_files
    }
  }
  // 4. Try parsing raw_response as a last resort
  if (result?.raw_response) {
    try {
      const raw = typeof result.raw_response === 'string' ? JSON.parse(result.raw_response) : result.raw_response
      if (Array.isArray(raw?.module_outputs?.artifact_files) && raw.module_outputs.artifact_files.length > 0) {
        return raw.module_outputs.artifact_files
      }
      if (Array.isArray(raw?.response?.module_outputs?.artifact_files) && raw.response.module_outputs.artifact_files.length > 0) {
        return raw.response.module_outputs.artifact_files
      }
    } catch {}
  }
  return []
}

// Extract image URL from response text/result as a fallback
function extractImageUrl(result: AIAgentResponse): string | null {
  const r = result?.response?.result
  if (!r || typeof r !== 'object') return null
  // Check common fields that might contain an image URL
  for (const key of ['image_url', 'imageUrl', 'url', 'image', 'output_url', 'file_url']) {
    const val = r[key]
    if (typeof val === 'string' && (val.startsWith('http://') || val.startsWith('https://'))) {
      return val
    }
  }
  // Check if any string value in result looks like an image URL
  for (const val of Object.values(r)) {
    if (typeof val === 'string' && /^https?:\/\/.*\.(png|jpg|jpeg|webp|gif)/i.test(val)) {
      return val
    }
  }
  return null
}

interface HistoryItem {
  id: string
  prompt: string
  imageUrl: string
  assetIds: string[]
}

export default function Page() {
  const [originalImage, setOriginalImage] = useState<string | null>(null)
  const [originalAssetIds, setOriginalAssetIds] = useState<string[]>([])
  const [currentImage, setCurrentImage] = useState<string | null>(null)
  const [currentAssetIds, setCurrentAssetIds] = useState<string[]>([])
  const [history, setHistory] = useState<HistoryItem[]>([])
  const [variations, setVariations] = useState<ArtifactFile[]>([])
  const [loading, setLoading] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [sessionId] = useState(() =>
    typeof window !== 'undefined' ? crypto.randomUUID() : 'ssr'
  )

  const fileRef = useRef<HTMLInputElement>(null)
  const hasImage = Boolean(originalImage)

  // Upload handler
  const handleUpload = useCallback(async (file: File) => {
    const localUrl = URL.createObjectURL(file)
    setOriginalImage(localUrl)
    setCurrentImage(localUrl)
    setError(null)
    setUploading(true)
    try {
      const res = await uploadFiles(file)
      if (res.success && Array.isArray(res.asset_ids) && res.asset_ids.length > 0) {
        setOriginalAssetIds(res.asset_ids)
        setCurrentAssetIds(res.asset_ids)
      } else {
        setError('Upload failed. Try a different image.')
      }
    } catch {
      setError('Upload error. Check your connection.')
    } finally {
      setUploading(false)
    }
  }, [])

  // Drop handler
  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      const file = e.dataTransfer.files[0]
      if (file && file.type.startsWith('image/')) handleUpload(file)
    },
    [handleUpload]
  )

  // Apply edit
  const handleEdit = useCallback(async () => {
    if (!prompt.trim() || currentAssetIds.length === 0) return
    setLoading(true)
    setError(null)
    setVariations([])

    try {
      const result = await callAIAgent(prompt, AGENT_ID, {
        session_id: sessionId,
        assets: currentAssetIds,
      })

      if (result.success) {
        const images = extractArtifactFiles(result)
        const sug = Array.isArray(result.response?.result?.suggestions)
          ? result.response.result.suggestions
          : []

        if (images.length > 0) {
          const url = images[0]?.file_url ?? ''
          if (url) {
            setCurrentImage(url)
            setSuggestions(sug)
            setHistory((prev) => [
              ...prev,
              { id: crypto.randomUUID(), prompt, imageUrl: url, assetIds: currentAssetIds },
            ])
          } else {
            setError('No image returned. Try rephrasing.')
          }
        } else {
          // Fallback: check if there's a direct image URL in the response
          const fallbackUrl = extractImageUrl(result)
          if (fallbackUrl) {
            setCurrentImage(fallbackUrl)
            setSuggestions(sug)
            setHistory((prev) => [
              ...prev,
              { id: crypto.randomUUID(), prompt, imageUrl: fallbackUrl, assetIds: currentAssetIds },
            ])
          } else {
            setError('No image returned. Try a different prompt.')
          }
        }
      } else {
        setError(result.error || 'Edit failed. Try again.')
      }
    } catch {
      setError('Something went wrong. Try again.')
    } finally {
      setLoading(false)
      setPrompt('')
    }
  }, [prompt, currentAssetIds, sessionId])

  // Download
  const handleDownload = useCallback(async () => {
    if (!currentImage) return
    try {
      const r = await fetch(currentImage)
      const blob = await r.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `edit-${Date.now()}.png`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch {
      window.open(currentImage, '_blank')
    }
  }, [currentImage])

  // Reset
  const handleReset = useCallback(() => {
    setCurrentImage(originalImage)
    setCurrentAssetIds(originalAssetIds)
    setHistory([])
    setVariations([])
    setSuggestions([])
    setError(null)
  }, [originalImage, originalAssetIds])

  // New image
  const handleNewImage = useCallback(() => {
    setOriginalImage(null)
    setOriginalAssetIds([])
    setCurrentImage(null)
    setCurrentAssetIds([])
    setHistory([])
    setVariations([])
    setSuggestions([])
    setError(null)
    setPrompt('')
  }, [])

  // ---- RENDER ----

  // Empty state: upload
  if (!hasImage) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center px-4">
        <div className="text-center mb-10">
          <h1 className="text-2xl font-semibold tracking-tight text-foreground">
            PixelPrompt
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Edit images with text
          </p>
        </div>

        <div
          onDragOver={(e) => e.preventDefault()}
          onDrop={handleDrop}
          onClick={() => fileRef.current?.click()}
          className="w-full max-w-sm p-10 rounded-xl border border-dashed border-border hover:border-foreground/30 cursor-pointer transition-colors flex flex-col items-center gap-4"
        >
          <RiImageAddLine className="w-8 h-8 text-muted-foreground" />
          <div className="text-center">
            <p className="text-sm font-medium text-foreground">
              Drop an image here
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              or click to browse
            </p>
          </div>
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) handleUpload(f)
            }}
            className="hidden"
          />
        </div>

        {uploading && (
          <p className="mt-4 text-xs text-muted-foreground">Uploading...</p>
        )}
        {error && (
          <p className="mt-4 text-xs text-red-500">{error}</p>
        )}
      </div>
    )
  }

  // Editor state
  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <header className="flex items-center justify-between px-5 py-3 border-b border-border flex-shrink-0">
        <button
          onClick={handleNewImage}
          className="text-sm font-semibold tracking-tight text-foreground hover:opacity-70 transition-opacity"
        >
          PixelPrompt
        </button>

        <div className="flex items-center gap-2">
          {history.length > 0 && (
            <button
              onClick={handleReset}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1"
            >
              Reset
            </button>
          )}
          <button
            onClick={handleDownload}
            disabled={!currentImage}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-foreground text-background hover:opacity-80 transition-opacity disabled:opacity-30"
          >
            <RiDownloadLine className="w-3.5 h-3.5" />
            Download
          </button>
        </div>
      </header>

      {/* Canvas */}
      <div className="flex-1 flex flex-col items-center justify-center p-6 overflow-auto">
        {loading ? (
          <div className="flex flex-col items-center gap-3">
            <div className="w-8 h-8 border-2 border-foreground/20 border-t-foreground rounded-full animate-spin" />
            <p className="text-xs text-muted-foreground">Editing...</p>
          </div>
        ) : (
          <>
            {currentImage && (
              <img
                src={currentImage}
                alt="Image"
                className="max-w-full max-h-[55vh] rounded-lg object-contain"
              />
            )}

            {/* Variations */}
            {Array.isArray(variations) && variations.length > 0 && (
              <div className="mt-4 flex gap-3 overflow-x-auto">
                {variations.map((v, i) => (
                  <button
                    key={v?.file_url ?? i}
                    onClick={() => {
                      if (v?.file_url) {
                        setCurrentImage(v.file_url)
                        setVariations([])
                      }
                    }}
                    className="flex-shrink-0 rounded-lg overflow-hidden border border-border hover:border-foreground/40 transition-colors"
                  >
                    <img
                      src={v?.file_url ?? ''}
                      alt={`Variation ${i + 1}`}
                      className="w-24 h-24 object-cover"
                    />
                  </button>
                ))}
                <button
                  onClick={() => setVariations([])}
                  className="flex-shrink-0 w-24 h-24 rounded-lg border border-border flex items-center justify-center hover:bg-muted transition-colors"
                >
                  <RiCloseLine className="w-4 h-4 text-muted-foreground" />
                </button>
              </div>
            )}
          </>
        )}

        {/* History thumbnails */}
        {history.length > 1 && (
          <div className="mt-4 flex items-center gap-2 overflow-x-auto max-w-full">
            <button
              onClick={() => {
                setCurrentImage(originalImage)
              }}
              className={cn(
                'flex-shrink-0 w-10 h-10 rounded-md overflow-hidden border transition-colors',
                currentImage === originalImage ? 'border-foreground' : 'border-border opacity-60 hover:opacity-100'
              )}
            >
              {originalImage && (
                <img src={originalImage} alt="Original" className="w-full h-full object-cover" />
              )}
            </button>
            {history.map((h) => (
              <button
                key={h.id}
                onClick={() => setCurrentImage(h.imageUrl)}
                className={cn(
                  'flex-shrink-0 w-10 h-10 rounded-md overflow-hidden border transition-colors',
                  currentImage === h.imageUrl ? 'border-foreground' : 'border-border opacity-60 hover:opacity-100'
                )}
              >
                <img src={h.imageUrl} alt="" className="w-full h-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Suggestions */}
      {Array.isArray(suggestions) && suggestions.length > 0 && !loading && (
        <div className="px-5 pb-2 flex gap-2 flex-wrap justify-center">
          {suggestions.map((s, i) => (
            <button
              key={i}
              onClick={() => setPrompt(typeof s === 'string' ? s : '')}
              className="text-xs px-3 py-1 rounded-full border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
            >
              {typeof s === 'string' ? s : ''}
            </button>
          ))}
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="px-5 pb-2 text-center">
          <p className="text-xs text-red-500">{error}</p>
        </div>
      )}

      {/* Prompt bar */}
      <div className="px-5 py-4 border-t border-border flex-shrink-0">
        <div className="flex items-center gap-2 max-w-2xl mx-auto">
          <input
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleEdit()
              }
            }}
            placeholder="Describe your edit..."
            disabled={loading || uploading || currentAssetIds.length === 0}
            className="flex-1 px-4 py-2.5 rounded-lg bg-muted/50 border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-foreground/20 transition-all disabled:opacity-40"
          />
          <button
            onClick={handleEdit}
            disabled={loading || !prompt.trim() || currentAssetIds.length === 0}
            className="px-4 py-2.5 rounded-lg bg-foreground text-background text-sm font-medium hover:opacity-80 transition-opacity disabled:opacity-30 disabled:cursor-not-allowed flex items-center gap-1.5"
          >
            {loading ? (
              <div className="w-4 h-4 border-2 border-background/30 border-t-background rounded-full animate-spin" />
            ) : (
              <RiArrowRightLine className="w-4 h-4" />
            )}
            <span className="hidden sm:inline">Edit</span>
          </button>
        </div>
      </div>
    </div>
  )
}
