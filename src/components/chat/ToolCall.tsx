import type { FC } from 'react'
import { useState, useMemo } from 'react'
import {
  CheckCircle2,
  XCircle,
  Loader2,
  ChevronDown,
  PlayCircle,
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

// Pulsing dot for streaming state
const PulsingDot: FC = () => (
  <m.div
    animate={{ scale: [1, 1.2, 1], opacity: [0.5, 1, 0.5] }}
    transition={{ duration: 1, repeat: Infinity, ease: 'easeInOut' }}
    className="size-2 rounded-full bg-blue-400"
  />
)

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

  // Get preview text - handle streaming case where args might be incomplete
  const paramsPreview = useMemo(() => {
    if (!toolCall.args || Object.keys(toolCall.args).length === 0) {
      return status.status === 'streaming' ? '...' : ''
    }
    return getParamsPreview(toolCall.args, 80)
  }, [toolCall.args, status.status])

  const argsText = JSON.stringify(toolCall.args || {}, null, 2)

  // Determine if we're in a streaming/pending state
  const isActiveState = status.status === 'streaming' || status.status === 'ready' || status.status === 'running'

  return (
    <LazyMotion features={domAnimation}>
      <m.div
        initial={{ opacity: 0, y: 5 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className={cn(
          "mb-1 rounded-xl border overflow-hidden backdrop-blur-[2px]",
          isActiveState && "border-blue-500/30"
        )}
        style={{ backgroundColor: 'hsl(var(--muted) / 0.35)' }}
      >
        {/* Header */}
        <div
          className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-white/3 transition-all duration-150"
          onClick={() => setIsExpanded(!isExpanded)}
        >
          {/* Status Icon */}
          <div className="shrink-0 flex items-center justify-center w-4">
            {status.status === 'streaming' && <PulsingDot />}
            {status.status === 'ready' && (
              <PlayCircle className="size-3 text-blue-400" />
            )}
            {status.status === 'running' && (
              <Loader2 className="size-3 text-blue-400 animate-spin" />
            )}
            {status.status === 'success' && (
              <CheckCircle2 className="size-3 text-muted-foreground/50" />
            )}
            {status.status === 'error' && (
              <XCircle className="size-3 text-red-400/70" />
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-baseline gap-1.5 flex-wrap">
              {/* Tool Name */}
              <span className={cn(
                "text-xs",
                isActiveState ? "text-blue-400" : "text-muted-foreground"
              )}>
                {displayToolName || 'Loading...'}
              </span>

              {/* Status label for active states */}
              {status.status === 'streaming' && (
                <span className="text-xs text-blue-400/60">parsing...</span>
              )}
              {status.status === 'ready' && (
                <span className="text-xs text-blue-400/60">ready</span>
              )}
              {status.status === 'running' && (
                <span className="text-xs text-blue-400/60">executing...</span>
              )}

              {/* Params Preview - only show when not in active state or when we have args */}
              {paramsPreview && !isActiveState && (
                <span className="text-xs text-muted-foreground/50 truncate">
                  {paramsPreview}
                </span>
              )}

              {/* Duration when completed */}
              {status.status === 'success' && toolCall.duration !== undefined && (
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
                  <div className="[&_*]:!bg-transparent">
                    <SyntaxHighlighter
                      language="json"
                      style={syntaxTheme}
                      customStyle={{
                        margin: 0,
                        padding: '10px',
                        fontSize: '10px',
                        lineHeight: '1.5',
                        background: 'transparent',
                      }}
                      wrapLongLines
                    >
                      {argsText}
                    </SyntaxHighlighter>
                  </div>
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
