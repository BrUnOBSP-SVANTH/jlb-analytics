import { cn } from "@/lib/utils";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { Component, ReactNode, type ErrorInfo } from "react";
import { reportClientError } from "@/lib/errorTracking";
import { ehErroDeVersaoAntiga, recarregarParaVersaoNova } from "@/lib/versaoNova";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    reportClientError(error.message, `boundary:${(info.componentStack ?? "").split("\n")[1]?.trim() ?? ""}`);
    // Arquivo de tela da versão anterior (publicação nova com a aba aberta):
    // recarregar resolve, e o visitante nem vê esta tela. Ver lib/versaoNova.ts.
    if (ehErroDeVersaoAntiga(error.message)) recarregarParaVersaoNova();
  }

  render() {
    if (this.state.hasError && ehErroDeVersaoAntiga(this.state.error?.message)) {
      // Se chegou aqui, ou está recarregando agora, ou já recarregou há pouco e
      // o arquivo continua faltando. Nos dois casos, stack trace não ajuda
      // ninguém: diz o que houve e dá a saída.
      return (
        <div className="flex items-center justify-center min-h-screen p-8 bg-background">
          <div className="flex flex-col items-center text-center w-full max-w-md p-8 gap-4">
            <RotateCcw size={40} className="text-primary" aria-hidden="true" />
            <h2 className="text-xl">Saiu uma versão nova do site</h2>
            <p className="text-sm text-muted-foreground">
              Esta aba ainda estava com a anterior. Recarregar traz a atualizada — nada do que
              você fez se perde.
            </p>
            <button
              onClick={() => window.location.reload()}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg",
                "bg-primary text-primary-foreground",
                "hover:opacity-90 cursor-pointer"
              )}
            >
              <RotateCcw size={16} />
              Recarregar página
            </button>
          </div>
        </div>
      );
    }

    if (this.state.hasError) {
      return (
        <div className="flex items-center justify-center min-h-screen p-8 bg-background">
          <div className="flex flex-col items-center w-full max-w-2xl p-8">
            <AlertTriangle
              size={48}
              className="text-destructive mb-6 flex-shrink-0"
            />

            <h2 className="text-xl mb-4">Ocorreu um erro inesperado.</h2>

            <div className="p-4 w-full rounded bg-muted overflow-auto mb-6">
              <pre className="text-sm text-muted-foreground whitespace-break-spaces">
                {this.state.error?.stack}
              </pre>
            </div>

            <button
              onClick={() => window.location.reload()}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg",
                "bg-primary text-primary-foreground",
                "hover:opacity-90 cursor-pointer"
              )}
            >
              <RotateCcw size={16} />
              Recarregar página
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
