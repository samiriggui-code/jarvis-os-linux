import { Component, type ErrorInfo, type ReactNode } from 'react';
import { tokens } from '../../../ui/tokens';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/** Affiche l'exception au lieu d'une page blanche. */
export class GraphErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[graph3d]', error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <pre
        style={{
          margin: 16,
          padding: 16,
          fontFamily: tokens.font.mono,
          fontSize: 12,
          color: tokens.color.danger,
          whiteSpace: 'pre-wrap',
          overflow: 'auto',
        }}
      >
        {this.state.error.message}
        {'\n'}
        {this.state.error.stack}
      </pre>
    );
  }
}
