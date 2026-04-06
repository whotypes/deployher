import { Component, type ErrorInfo, type ReactNode } from "react";
import { withTranslation, type WithTranslation } from "react-i18next";

type Props = { children: ReactNode } & WithTranslation;

type State = { hasError: boolean; message: string };

class AppErrorBoundaryInner extends Component<Props, State> {
  override state: State = { hasError: false, message: "" };

  static getDerivedStateFromError(err: Error): State {
    return { hasError: true, message: err.message };
  }

  override componentDidCatch(err: Error, info: ErrorInfo): void {
    console.error(err, info.componentStack);
  }

  override render(): ReactNode {
    if (this.state.hasError) {
      const { t } = this.props;
      return (
        <div className="bg-background text-foreground flex min-h-svh flex-col items-center justify-center gap-3 p-6">
          <p className="text-destructive text-sm font-medium">{t("appError.title")}</p>
          <p className="text-muted-foreground max-w-md text-center text-sm">{this.state.message}</p>
        </div>
      );
    }
    return this.props.children;
  }
}

export const AppErrorBoundary = withTranslation()(AppErrorBoundaryInner);
