import { useState, useEffect } from 'react'
import { mcpManager } from '@/lib/mcpManager'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Copy, Download, Loader2, FileText } from 'lucide-react'
import type { MCPResource, MCPResourceContent } from '@/types/mcp'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { toast } from 'sonner'

interface MCPResourceViewerProps {
  serverId: string
  resource: MCPResource
}

export function MCPResourceViewer({ serverId, resource }: MCPResourceViewerProps) {
  const [content, setContent] = useState<MCPResourceContent | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadContent = async () => {
      setIsLoading(true)
      setError(null)
      try {
        const contents = await mcpManager.readResource(serverId, resource.uri)
        if (contents && contents.length > 0) {
          setContent(contents[0]) // Use first content item
        } else {
          setError('No content returned')
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load resource')
      } finally {
        setIsLoading(false)
      }
    }

    loadContent()
  }, [serverId, resource.uri])

  const handleCopy = async () => {
    if (!content?.text) return

    try {
      await navigator.clipboard.writeText(content.text)
      toast.success('Copied to clipboard', {
        description: 'Resource content copied successfully',
        duration: 2000,
      })
    } catch (err) {
      toast.error('Copy failed', {
        description: 'Failed to copy to clipboard',
        duration: 2000,
      })
    }
  }

  const handleDownload = () => {
    if (!content) return

    const dataStr = content.text || (content.blob ? atob(content.blob) : '')
    const blob = new Blob([dataStr], {
      type: content.mimeType || 'application/octet-stream'
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = resource.name || 'resource'
    a.click()
    URL.revokeObjectURL(url)
  }

  const renderContent = () => {
    if (!content) return null

    const mimeType = content.mimeType || resource.mimeType || 'text/plain'

    // Text content
    if (content.text) {
      // JSON
      if (mimeType === 'application/json' || mimeType.includes('json')) {
        try {
          const formatted = JSON.stringify(JSON.parse(content.text), null, 2)
          return (
            <SyntaxHighlighter
              language="json"
              style={vscDarkPlus}
              customStyle={{
                margin: 0,
                borderRadius: '0.5rem',
                fontSize: '0.875rem',
              }}
            >
              {formatted}
            </SyntaxHighlighter>
          )
        } catch {
          // Not valid JSON, fall through to plain text
        }
      }

      // Markdown
      if (mimeType === 'text/markdown' || mimeType.includes('markdown')) {
        return (
          <div className="prose prose-sm dark:prose-invert max-w-none p-4">
            <pre className="whitespace-pre-wrap font-mono text-sm">
              {content.text}
            </pre>
          </div>
        )
      }

      // HTML
      if (mimeType === 'text/html') {
        return (
          <div className="p-4">
            <SyntaxHighlighter
              language="html"
              style={vscDarkPlus}
              customStyle={{
                margin: 0,
                borderRadius: '0.5rem',
                fontSize: '0.875rem',
              }}
            >
              {content.text}
            </SyntaxHighlighter>
          </div>
        )
      }

      // XML
      if (mimeType === 'application/xml' || mimeType === 'text/xml') {
        return (
          <div className="p-4">
            <SyntaxHighlighter
              language="xml"
              style={vscDarkPlus}
              customStyle={{
                margin: 0,
                borderRadius: '0.5rem',
                fontSize: '0.875rem',
              }}
            >
              {content.text}
            </SyntaxHighlighter>
          </div>
        )
      }

      // Code files (JavaScript, TypeScript, Python, etc.)
      if (mimeType.includes('javascript') || mimeType.includes('typescript')) {
        return (
          <div className="p-4">
            <SyntaxHighlighter
              language={mimeType.includes('typescript') ? 'typescript' : 'javascript'}
              style={vscDarkPlus}
              customStyle={{
                margin: 0,
                borderRadius: '0.5rem',
                fontSize: '0.875rem',
              }}
            >
              {content.text}
            </SyntaxHighlighter>
          </div>
        )
      }

      // Plain text or other
      return (
        <ScrollArea className="h-full">
          <pre className="p-4 text-sm whitespace-pre-wrap font-mono">
            {content.text}
          </pre>
        </ScrollArea>
      )
    }

    // Binary content (blob)
    if (content.blob) {
      // Images
      if (mimeType.startsWith('image/')) {
        return (
          <div className="p-4 flex items-center justify-center">
            <img
              src={`data:${mimeType};base64,${content.blob}`}
              alt={resource.name}
              className="max-w-full h-auto rounded-lg shadow-lg"
            />
          </div>
        )
      }

      // Other binary content
      return (
        <div className="p-4 flex flex-col items-center justify-center h-full text-muted-foreground">
          <FileText className="h-12 w-12 mb-4" />
          <p className="text-sm">Binary content ({mimeType})</p>
          <p className="text-xs mt-2">Use the download button to save this file</p>
        </div>
      )
    }

    return (
      <div className="p-4 text-muted-foreground">
        <p>No content available</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b">
        <div className="flex-1 min-w-0">
          <h3 className="font-semibold truncate">{resource.name}</h3>
          <p className="text-xs text-muted-foreground truncate">{resource.uri}</p>
          {(content?.mimeType || resource.mimeType) && (
            <p className="text-xs text-muted-foreground mt-1">
              {content?.mimeType || resource.mimeType}
            </p>
          )}
        </div>
        <div className="flex gap-2 ml-4">
          <Button
            size="sm"
            variant="outline"
            onClick={handleCopy}
            disabled={!content?.text}
            title="Copy to clipboard"
          >
            <Copy className="h-4 w-4" />
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={handleDownload}
            disabled={!content}
            title="Download"
          >
            <Download className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-hidden">
        {isLoading && (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        )}

        {error && (
          <div className="p-4 text-destructive">
            <p className="font-semibold">Error loading resource</p>
            <p className="text-sm mt-1">{error}</p>
          </div>
        )}

        {!isLoading && !error && renderContent()}
      </div>
    </div>
  )
}
