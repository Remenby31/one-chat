import type { FC } from 'react'
import { useState, useMemo } from 'react'
import {
  XIcon,
  Loader2,
} from 'lucide-react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { getParamsPreview } from '@/lib/syntaxHighlight'
import { cn } from '@/lib/utils'
import { m, LazyMotion, domAnimation, AnimatePresence } from 'motion/react'
import type { ToolCall } from '@/lib/chatStore'
import { parseToolName } from '@/lib/toolCallUtils'
import { useToolCallStatus } from '@/hooks/useToolCallStatus'
import { useDarkMode } from '@/hooks/useDarkMode'
import { ToolCallResult } from './ToolCallResult'

interface ToolCallProps {
  toolCall: ToolCall
}

export const ToolCallDisplay: FC<ToolCallProps> = ({ toolCall }) => {
  const [isExpanded, setIsExpanded] = useState(false)
  const [activeTab, setActiveTab] = useState<'params' | 'result'>('result')

  const status = useToolCallStatus(toolCall)
  const isDark = useDarkMode()

  const { toolName: displayToolName } = useMemo(
    () => parseToolName(toolCall.toolName),
    [toolCall.toolName]
  )

  const syntaxTheme = isDark ? oneDark : oneLight

  const paramsPreview = useMemo(() => {
    if (!toolCall.args || Object.keys(toolCall.args).length === 0) {
      return status.status === 'streaming' ? '...' : ''
    }
    return getParamsPreview(toolCall.args, 60)
  }, [toolCall.args, status.status])

  const argsText = JSON.stringify(toolCall.args || {}, null, 2)

  const isActiveState = status.status === 'streaming' || status.status === 'ready' || status.status === 'running'
  const isComplete = status.status === 'success'
  const isError = status.status === 'error'

  return (
    <LazyMotion features={domAnimation}>
      <m.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.15 }}
        className="group"
      >
        {/* Compact inline display */}
        <div
          className={cn(
            "flex items-center gap-2 px-2 py-1.5 rounded-lg cursor-pointer transition-colors",
            "hover:bg-muted/50",
            isExpanded && "bg-muted/30"
          )}
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {/* Status indicator - only show when active or error */}
          {(isActiveState || isError) && (
            <div className="shrink-0 flex items-center justify-center w-4 h-4">
              {isActiveState && (
                <Loader2 className="size-3.5 text-muted-foreground/50 animate-spin" />
              )}
              {isError && (
                <XIcon className="size-3.5 text-muted-foreground/50" strokeWidth={2.5} />
              )}
            </div>
          )}

          {/* Tool name */}
          <span className={cn(
            "text-[13px] font-medium",
            isActiveState ? "text-foreground/70" : "text-muted-foreground"
          )}>
            {displayToolName || 'Loading...'}
          </span>

          {/* Params preview */}
          {paramsPreview && (
            <span className="text-xs text-muted-foreground/40 truncate max-w-[300px]">
              {paramsPreview}
            </span>
          )}
        </div>

        {/* Expanded content */}
        <AnimatePresence>
          {isExpanded && (
            <m.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="overflow-hidden"
            >
              <div className="ml-6 mt-1 border-l-2 border-muted pl-3 pb-1">
                {/* Header with tabs and duration */}
                <div className="flex items-center gap-3 mb-2">
                  {/* Duration */}
                  {isComplete && toolCall.duration !== undefined && (
                    <span className="text-xs text-muted-foreground/40 mr-auto">
                      {toolCall.duration < 1000
                        ? `${toolCall.duration.toFixed(0)}ms`
                        : `${(toolCall.duration / 1000).toFixed(1)}s`
                      }
                    </span>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); setActiveTab('params') }}
                    className={cn(
                      'text-xs transition-colors',
                      activeTab === 'params'
                        ? 'text-foreground font-medium'
                        : 'text-muted-foreground/60 hover:text-muted-foreground'
                    )}
                  >
                    Input
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setActiveTab('result') }}
                    className={cn(
                      'text-xs transition-colors',
                      activeTab === 'result'
                        ? 'text-foreground font-medium'
                        : 'text-muted-foreground/60 hover:text-muted-foreground'
                    )}
                  >
                    Output
                  </button>
                </div>

                {/* Tab content */}
                <div className="text-xs">
                  {activeTab === 'params' && (
                    <div className="rounded-md overflow-hidden bg-muted/30">
                      <SyntaxHighlighter
                        language="json"
                        style={syntaxTheme}
                        customStyle={{
                          margin: 0,
                          padding: '8px 10px',
                          fontSize: '11px',
                          lineHeight: '1.4',
                          background: 'transparent',
                        }}
                        wrapLongLines
                      >
                        {argsText}
                      </SyntaxHighlighter>
                    </div>
                  )}

                  {activeTab === 'result' && <ToolCallResult toolCall={toolCall} />}
                </div>
              </div>
            </m.div>
          )}
        </AnimatePresence>
      </m.div>
    </LazyMotion>
  )
}
