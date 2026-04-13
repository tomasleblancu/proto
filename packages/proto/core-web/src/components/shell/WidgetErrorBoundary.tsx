import { Component, type ReactNode } from 'react'
import { AlertTriangleIcon, RotateCcwIcon } from 'lucide-react'

interface Props {
  widgetType: string
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export class WidgetErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error }
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-full p-4 text-center gap-2">
          <AlertTriangleIcon className="w-5 h-5 text-destructive/60" />
          <p className="text-xs text-muted-foreground">
            Widget <span className="font-mono">{this.props.widgetType}</span> crashed
          </p>
          <p className="text-[10px] text-muted-foreground/50 max-w-[200px] truncate">
            {this.state.error?.message}
          </p>
          <button
            onClick={this.handleRetry}
            className="flex items-center gap-1 text-[11px] text-primary hover:underline mt-1"
          >
            <RotateCcwIcon className="w-3 h-3" /> Retry
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
