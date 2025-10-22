"use client"

import { type FC } from 'react'
import ShikiHighlighter, { type ShikiHighlighterProps } from 'react-shiki'
import { cn } from '@/lib/utils'

/**
 * Props for the CodeHighlighter component
 */
export type CodeHighlighterProps = {
  code: string
  language: string
  className?: string
  theme?: ShikiHighlighterProps['theme']
}

/**
 * Standalone code syntax highlighter using react-shiki
 * No dependencies on assistant-ui
 */
export const CodeHighlighter: FC<CodeHighlighterProps> = ({
  code,
  language,
  theme = { dark: 'github-dark', light: 'github-light' },
  className,
}) => {
  const BASE_STYLES =
    'aui-shiki-base [&_pre]:overflow-x-auto [&_pre]:rounded-b-lg [&_pre]:!bg-[#0d1117] dark:[&_pre]:!bg-[#0d1117] [&_pre]:p-4'

  return (
    <ShikiHighlighter
      language={language}
      theme={theme}
      addDefaultStyles={false}
      showLanguage={false}
      defaultColor="light-dark()"
      className={cn(BASE_STYLES, className)}
    >
      {code.trim()}
    </ShikiHighlighter>
  )
}

CodeHighlighter.displayName = 'CodeHighlighter'
