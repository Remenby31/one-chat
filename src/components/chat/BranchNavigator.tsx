import type { FC } from 'react'
import { ChevronLeftIcon, ChevronRightIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { SiblingInfo } from '@/types/branching'

interface BranchNavigatorProps {
  siblingInfo: SiblingInfo
  onNavigate: (newIndex: number) => void
  className?: string
}

export const BranchNavigator: FC<BranchNavigatorProps> = ({
  siblingInfo,
  onNavigate,
  className,
}) => {
  const { currentIndex, totalCount } = siblingInfo

  const canGoPrev = currentIndex > 0
  const canGoNext = currentIndex < totalCount - 1

  return (
    <div className={cn('flex items-center gap-0.5 text-xs text-muted-foreground', className)}>
      <button
        type="button"
        className={cn(
          'h-6 w-6 flex items-center justify-center rounded hover:bg-muted transition-colors',
          !canGoPrev && 'opacity-40 cursor-not-allowed'
        )}
        disabled={!canGoPrev}
        onClick={() => onNavigate(currentIndex - 1)}
        aria-label="Previous version"
      >
        <ChevronLeftIcon className="h-3.5 w-3.5" />
      </button>

      <span className="min-w-[2.5rem] text-center tabular-nums">
        {currentIndex + 1} / {totalCount}
      </span>

      <button
        type="button"
        className={cn(
          'h-6 w-6 flex items-center justify-center rounded hover:bg-muted transition-colors',
          !canGoNext && 'opacity-40 cursor-not-allowed'
        )}
        disabled={!canGoNext}
        onClick={() => onNavigate(currentIndex + 1)}
        aria-label="Next version"
      >
        <ChevronRightIcon className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}
