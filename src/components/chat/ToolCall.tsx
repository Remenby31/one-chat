import type { FC } from 'react'
import { useState, useMemo } from 'react'
import {
  CheckCircle2,
  XCircle,
  Loader2,
  ChevronDown,
} from 'lucide-react'
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter'
import { oneDark, oneLight } from 'react-syntax-highlighter/dist/esm/styles/prism'
import { getParamsPreview } from '@/lib/syntaxHighlight'
import { cn } from '@/lib/utils'
import { m, LazyMotion, domAnimation } from 'motion/react'
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

  // Use custom hooks for state management
  const status = useToolCallStatus(toolCall)
  const isDark = useDarkMode()

  // Parse server and tool name using utility function
  const { toolName: displayToolName } = useMemo(
    () => parseToolName(toolCall.toolName),
    [toolCall.toolName]
  )

  const syntaxTheme = isDark ? oneDark : oneLight

  // Get preview text
  const paramsPreview = useMemo(
    () => getParamsPreview(toolCall.args, 80),
    [toolCall.args]
  )

  const argsText = JSON.stringify(toolCall.args, null, 2)

  return (
    <LazyMotion features={domAnimation}>
      <m.div
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="mb-1.5 rounded-xl border overflow-hidden backdrop-blur-[2px]"
        style={{ backgroundColor: 'hsl(var(--muted) / 0.35)' }}
      >
        {/* Header */}
        <div
          className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-white/3 transition-all duration-150"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {/* Status Icon */}
          <div className="shrink-0">
            {status.status === 'running' && (
              <Loader2 className="size-3 text-muted-foreground/50 animate-spin" />
            )}
            {status.status === 'success' && (
              <CheckCircle2 className="size-3 text-muted-foreground/50" />
            )}
            {status.status === 'error' && (
              <XCircle className="size-3 text-muted-foreground/50" />
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-1.5 flex-wrap">
              {/* Tool Name */}
              <span className="text-xs text-muted-foreground">
                {displayToolName}
              </span>

              {/* Params Preview */}
              {paramsPreview && (
                <span className="text-xs text-muted-foreground/50 truncate">
                  {paramsPreview}
                </span>
              )}

              {/* Duration when completed */}
              {toolCall.result !== undefined && toolCall.duration !== undefined && (
                <span className="text-xs text-muted-foreground/40">
                  · {toolCall.duration.toFixed(0)}ms
                </span>
              )}
            </div>
          </div>

          {/* Expand Button */}
          <button
            className="shrink-0 h-5 w-5 p-0 flex items-center justify-center rounded hover:bg-white/5 transition-colors"
            onClick={(e) => {
              e.stopPropagation()
              setIsExpanded(!isExpanded)
            }}
          >
            <m.div
              animate={{ rotate: isExpanded ? 180 : 0 }}
              transition={{ duration: 0.15 }}
            >
              <ChevronDown className="size-3 text-muted-foreground/40" />
            </m.div>
          </button>
        </div>

        {/* Expanded Content */}
        {isExpanded && (
          <m.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="border-t border-white/5"
          >
            {/* Tabs */}
            <div className="flex items-center gap-1.5 px-3 pt-2 pb-1.5">
              <button
                onClick={() => setActiveTab('params')}
                className={cn(
                  'px-2.5 py-1 text-xs rounded-md transition-all duration-150',
                  activeTab === 'params'
                    ? 'bg-white/5 text-muted-foreground'
                    : 'text-muted-foreground/60 hover:text-muted-foreground hover:bg-white/3'
                )}
              >
                Parameters
              </button>
              <button
                onClick={() => setActiveTab('result')}
                className={cn(
                  'px-2.5 py-1 text-xs rounded-md transition-all duration-150',
                  activeTab === 'result'
                    ? 'bg-white/5 text-muted-foreground'
                    : 'text-muted-foreground/60 hover:text-muted-foreground hover:bg-white/3'
                )}
              >
                Result
              </button>
            </div>

            {/* Tab Content */}
            <div className="px-3 pb-3">
              {activeTab === 'params' && (
                <m.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.15 }}
                  className="rounded-md overflow-hidden border border-white/5"
                >
                  <SyntaxHighlighter
                    language="json"
                    style={syntaxTheme}
                    customStyle={{
                      margin: 0,
                      padding: '10px',
                      fontSize: '10px',
                      lineHeight: '1.5',
                      background: isDark
                        ? 'rgba(40, 42, 54, 0.3)'
                        : 'rgba(250, 250, 250, 0.3)',
                    }}
                    wrapLongLines
                  >
                    {argsText}
                  </SyntaxHighlighter>
                </m.div>
              )}

              {activeTab === 'result' && <ToolCallResult toolCall={toolCall} />}
            </div>
          </m.div>
        )}
      </m.div>
    </LazyMotion>
  )
}
