import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Gamepad2, RotateCcw } from 'lucide-react';
import { PrimaryButton } from './ui/Buttons';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public override state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('[ErrorBoundary] Uncaught component render error:', error, errorInfo);
  }

  private handleReset = () => {
    this.setState({ hasError: false, error: null });
    if (typeof window !== 'undefined') {
      window.location.reload();
    }
  };

  public override render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen items-center justify-center p-4">
          <section className="panel-metal max-w-lg rounded-md p-6 text-center md:p-8">
            <div className="mb-4 flex justify-center">
              <Gamepad2 className="h-12 w-12 text-destructive" />
            </div>
            <h2 className="font-display text-2xl font-black uppercase tracking-wider text-destructive">
              ¡Pará la pelota!
            </h2>
            <p className="mt-2 text-sm text-foreground">
              Ocurrió un error inesperado en la pantalla. No te preocupes, todos los datos del torneo están guardados en tu navegador.
            </p>
            {this.state.error && (
              <pre className="my-4 max-h-32 overflow-auto rounded bg-background/80 p-2 text-left font-mono text-xs text-muted-foreground">
                {this.state.error.message}
              </pre>
            )}
            <div className="mt-6 flex justify-center">
              <PrimaryButton onClick={this.handleReset}>
                <RotateCcw className="h-4 w-4" /> Reintentar
              </PrimaryButton>
            </div>
          </section>
        </div>
      );
    }

    return this.props.children;
  }
}
