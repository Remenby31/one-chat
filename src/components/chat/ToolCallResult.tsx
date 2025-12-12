import type { FC } from 'react'
import { useMemo } from 'react'
import { Loader2 } from 'lucide-react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { m } from 'motion/react'
import type { ToolCall } from '@/lib/chatStore'
import { useToolCallStatus } from '@/hooks/useToolCallStatus'
import { useDarkMode } from '@/hooks/useDarkMode'
import { formatForDisplay } from '@/lib/syntaxHighlight'

interface ToolCallResultProps {
  toolCall: ToolCall
  className?: string
}

export const ToolCallResult: FC<ToolCallResultProps> = ({ toolCall, className }) => {
  const status = useToolCallStatus(toolCall)
  const isDark = useDarkMode()

  const syntaxTheme = isDark ? oneDark : oneLight

  const formattedResult = useMemo(() => {
    return toolCall.result !== undefined ? formatForDisplay(toolCall.result) : ''
  }, [toolCall.result])

  const isJson = useMemo(() => {
    if (!formattedResult) return false
    try {
      JSON.parse(formattedResult)
      return true
    } catch {
      return false
    }
  }, [formattedResult])

  const syntaxStyle = {
    margin: 0,
    padding: '8px 10px',
    fontSize: '11px',
    lineHeight: '1.4',
    background: 'transparent',
  }

  // Running state
  if (status.status === 'running' || status.status === 'streaming' || status.status === 'ready') {
    return (
      <m.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.15 }}
        className={className}
      >
        <div className="flex items-center gap-2 text-xs text-muted-foreground/60 py-1">
          <Loader2 className="size-3 animate-spin" />
          <span>Running...</span>
        </div>
      </m.div>
    )
  }

  // Error state
  if (status.status === 'error') {
    return (
      <m.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.15 }}
        className={className}
      >
        <div className="rounded-md overflow-hidden bg-red-500/5">
          {formattedResult ? (
            isJson ? (
              <SyntaxHighlighter
                language="json"
                style={syntaxTheme}
                customStyle={syntaxStyle}
                wrapLongLines
              >
                {formattedResult}
              </SyntaxHighlighter>
            ) : (
              <pre className="p-2 text-[11px] text-red-400/80 whitespace-pre-wrap break-words font-mono">
                {formattedResult}
              </pre>
            )
          ) : (
            <p className="p-2 text-[11px] text-red-400/80">
              {status.errorMessage || 'Execution failed'}
            </p>
          )}
        </div>
      </m.div>
    )
  }

  // Success state - no result
  if (!formattedResult) {
    return (
      <m.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.15 }}
        className={className}
      >
        <p className="text-[11px] text-muted-foreground/40 py-1">No output</p>
      </m.div>
    )
  }

  // Success state with result
  return (
    <m.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15 }}
      className={className}
    >
      <div className="rounded-md overflow-hidden bg-muted/30">
        {isJson ? (
          <SyntaxHighlighter
            language="json"
            style={syntaxTheme}
            customStyle={syntaxStyle}
            wrapLongLines
          >
            {formattedResult}
          </SyntaxHighlighter>
        ) : (
          <pre className="p-2 text-[11px] text-foreground/80 whitespace-pre-wrap break-words font-mono">
            {formattedResult}
          </pre>
        )}
      </div>
    </m.div>
  )
}
