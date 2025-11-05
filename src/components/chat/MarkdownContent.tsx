import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeHighlight from 'rehype-highlight'
import rehypeRaw from 'rehype-raw'
import { type FC, memo, useState } from 'react'
import { CheckIcon, CopyIcon } from 'lucide-react'
import { TooltipIconButton } from '@/components/ui/tooltip-icon-button'
import { cn } from '@/lib/utils'
import { MermaidRenderer } from '@/components/chat/MermaidRenderer'
import 'highlight.js/styles/atom-one-dark.css'

type CodeHeaderProps = {
  language: string
  code: string
}

const CodeHeader: FC<CodeHeaderProps> = ({ language, code }) => {
  const { isCopied, copyToClipboard } = useCopyToClipboard()
  const onCopy = () => {
    if (!code || isCopied) return
    copyToClipboard(code)
  }

  return (
    <div className="aui-code-header-root">
      <span className="aui-code-header-language">{language}</span>
      <TooltipIconButton tooltip="Copy" onClick={onCopy}>
        {!isCopied && <CopyIcon className="h-4 w-4" />}
        {isCopied && <CheckIcon className="h-4 w-4" />}
      </TooltipIconButton>
    </div>
  )
}

const useCopyToClipboard = ({
  copiedDuration = 3000,
}: {
  copiedDuration?: number
} = {}) => {
  const [isCopied, setIsCopied] = useState<boolean>(false)

  const copyToClipboard = (value: string) => {
    if (!value) return

    navigator.clipboard.writeText(value).then(() => {
      setIsCopied(true)
      setTimeout(() => setIsCopied(false), copiedDuration)
    })
  }

  return { isCopied, copyToClipboard }
}

interface MarkdownContentProps {
  content: string
}

const MarkdownContentImpl: FC<MarkdownContentProps> = ({ content }) => {
  return (
    <div className="aui-md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        rehypePlugins={[rehypeRaw, rehypeHighlight]}
        components={{
        h1: ({ node, className, ...props }) => (
          <h1 className="aui-md-h1" {...props} />
        ),
        h2: ({ node, className, ...props }) => (
          <h2 className="aui-md-h2" {...props} />
        ),
        h3: ({ node, className, ...props }) => (
          <h3 className="aui-md-h3" {...props} />
        ),
        h4: ({ node, className, ...props }) => (
          <h4 className="aui-md-h4" {...props} />
        ),
        h5: ({ node, className, ...props }) => (
          <h5 className="aui-md-h5" {...props} />
        ),
        h6: ({ node, className, ...props }) => (
          <h6 className="aui-md-h6" {...props} />
        ),
        p: ({ node, className, ...props }) => (
          <p className="aui-md-p" {...props} />
        ),
        a: ({ node, className, ...props }) => (
          <a className="aui-md-a" {...props} />
        ),
        blockquote: ({ node, className, ...props }) => (
          <blockquote className="aui-md-blockquote" {...props} />
        ),
        ul: ({ node, className, ...props }) => (
          <ul className="aui-md-ul" {...props} />
        ),
        ol: ({ node, className, ...props }) => (
          <ol className="aui-md-ol" {...props} />
        ),
        hr: ({ node, className, ...props }) => (
          <hr className="aui-md-hr" {...props} />
        ),
        table: ({ node, className, ...props }) => (
          <table className="aui-md-table" {...props} />
        ),
        th: ({ node, className, ...props }) => (
          <th className="aui-md-th" {...props} />
        ),
        td: ({ node, className, ...props }) => (
          <td className="aui-md-td" {...props} />
        ),
        tr: ({ node, className, ...props }) => (
          <tr className="aui-md-tr" {...props} />
        ),
        sup: ({ node, className, ...props }) => (
          <sup className="aui-md-sup" {...props} />
        ),
        pre: ({ children, ...props }: any) => {
          // Extract code element and language from children
          const codeElement = children?.props
          const className = codeElement?.className || ''
          const match = /language-(\w+)/.exec(className)
          const language = match ? match[1] : 'text'
          const code = codeElement?.children ? String(codeElement.children) : ''

          // Check for mermaid
          if (language === 'mermaid') {
            return <MermaidRenderer chart={code} />
          }

          return (
            <div className="aui-code-block-wrapper">
              <CodeHeader language={language} code={code} />
              <pre className={cn("aui-md-pre", className)} {...props}>
                {children}
              </pre>
            </div>
          )
        },
        code: ({ node, inline, className, children, ...props }: any) => {
          // For inline code, add custom class
          if (inline) {
            return (
              <code className="aui-md-inline-code" {...props}>
                {children}
              </code>
            )
          }

          // Block code - let rehype-highlight handle it
          return (
            <code className={className} {...props}>
              {children}
            </code>
          )
        },
      }}
    >
      {content}
    </ReactMarkdown>
    </div>
  )
}

export const MarkdownContent = memo(MarkdownContentImpl)
