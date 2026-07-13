import { Component } from 'react';
import { Card, CardContent } from '@/components/ui/card';

export default class RfTiltResultErrorBoundary extends Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidUpdate(previousProps) {
    if (previousProps.resetKey !== this.props.resetKey && this.state.hasError) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <Card className="border-destructive/30 bg-destructive/5">
          <CardContent className="py-8 text-center text-sm text-muted-foreground">
            Panel hasil tidak dapat ditampilkan. Ubah input lalu jalankan analisis kembali.
          </CardContent>
        </Card>
      );
    }

    return this.props.children;
  }
}
