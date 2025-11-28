import type { FC } from 'react'
import { useMemo } from 'react'
import { Loader2, XCircle } from 'lucide-react'
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

/**
 * Component to display the result of a tool call execution
 * Handles three states: running, success, and error
 */
export const ToolCallResult: FC<ToolCallResultProps> = ({ toolCall, className }) => {
  const status = useToolCallStatus(toolCall)
  const isDark = useDarkMode()

  const syntaxTheme = isDark ? oneDark : oneLight

  // Format result for display
  const formattedResult = useMemo(() => {
    return toolCall.result !== undefined ? formatForDisplay(toolCall.result) : ''
  }, [toolCall.result])

  // Common SyntaxHighlighter styles
  const syntaxStyle = {
    margin: 0,
    padding: '10px',
    fontSize: '10px',
    lineHeight: '1.5',
    background: isDark ? 'rgba(40, 42, 54, 0.3)' : 'rgba(250, 250, 250, 0.3)',
  }

  // Running state
  if (status.status === 'running') {
    return (
      <m.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.15 }}
        className={className}
      >
        <div className="flex items-center gap-2 text-xs text-muted-foreground/70 p-2.5 rounded-md bg-white/3">
          <Loader2 className="size-3 animate-spin" />
          <span>Executing...</span>
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
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground/70 p-2.5 rounded-md bg-white/3 border border-white/5">
            <XCircle className="size-3" />
            <span>Execution failed</span>
            {status.errorMessage && (
              <span className="text-muted-foreground/50">· {status.errorMessage}</span>
            )}
          </div>
          <div className="rounded-md overflow-hidden border border-white/5">
            <SyntaxHighlighter
              language="json"
              style={syntaxTheme}
              customStyle={syntaxStyle}
              wrapLongLines
            >
              {formattedResult}
            </SyntaxHighlighter>
          </div>
        </div>
      </m.div>
    )
  }

  // Success state
  return (
    <m.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.15 }}
      className={className}
    >
      <div className="rounded-md overflow-hidden border border-white/5">
        <SyntaxHighlighter
          language="json"
          style={syntaxTheme}
          customStyle={syntaxStyle}
          wrapLongLines
        >
          {formattedResult}
        </SyntaxHighlighter>
      </div>
    </m.div>
  )
}
