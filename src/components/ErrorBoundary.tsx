import { Component, type ErrorInfo, type ReactNode } from 'react'
import { AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { showReactErrorToast } from '@/lib/errorToast'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  }

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo)
    // Show error toast notification
    showReactErrorToast(error, { componentStack: errorInfo.componentStack ?? undefined })
  }

  public render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-screen p-8">
          <div className="flex flex-col items-center max-w-md text-center">
            <AlertCircle className="h-12 w-12 text-destructive mb-4" />
            <h1 className="text-2xl font-semibold mb-2">Une erreur est survenue</h1>
            <p className="text-muted-foreground mb-4">
              {this.state.error?.message || "Une erreur inconnue s'est produite"}
            </p>
            <Button
              onClick={() => window.location.reload()}
              variant="default"
            >
              Recharger l'application
            </Button>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}