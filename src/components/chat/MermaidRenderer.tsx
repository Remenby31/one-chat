"use client"

import mermaid from 'mermaid'
import { type FC, useEffect, useRef } from 'react'
import { cn } from '@/lib/utils'

/**
 * Props for the MermaidRenderer component
 */
export interface MermaidRendererProps {
  chart: string
  className?: string
}

// Configure mermaid options
mermaid.initialize({ theme: 'default', startOnLoad: false })

/**
 * Standalone Mermaid diagram renderer
 * No dependencies on assistant-ui
 */
export const MermaidRenderer: FC<MermaidRendererProps> = ({
  chart,
  className,
}) => {
  const ref = useRef<HTMLPreElement>(null)

  useEffect(() => {
    if (!chart || !ref.current) return

    (async () => {
      try {
        const id = `mermaid-${Math.random().toString(36).slice(2)}`
        const result = await mermaid.render(id, chart)
        if (ref.current) {
          ref.current.innerHTML = result.svg
          result.bindFunctions?.(ref.current)
        }
      } catch (e) {
        console.warn('Failed to render Mermaid diagram:', e)
        if (ref.current) {
          ref.current.textContent = 'Failed to render diagram'
        }
      }
    })()
  }, [chart])

  return (
    <pre
      ref={ref}
      className={cn(
        'aui-mermaid-diagram rounded-b-lg bg-muted p-2 text-center [&_svg]:mx-auto',
        className
      )}
    >
      Drawing diagram...
    </pre>
  )
}

MermaidRenderer.displayName = 'MermaidRenderer'
