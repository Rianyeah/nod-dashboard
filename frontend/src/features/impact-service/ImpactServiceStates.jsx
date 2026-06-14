import { Component } from 'react';
import {
  ArrowClockwiseIcon,
  ChartBarIcon,
  WarningCircleIcon,
} from '@phosphor-icons/react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';

export function ImpactServiceAlert({ title = 'Data tidak dapat diperbarui', children, variant = 'destructive' }) {
  return (
    <Alert variant={variant}>
      <WarningCircleIcon />
      <AlertTitle>{title}</AlertTitle>
      <AlertDescription>{children}</AlertDescription>
    </Alert>
  );
}

export function ChartEmptyState({ label = 'Data belum tersedia untuk filter ini.' }) {
  return (
    <Empty className="h-72 border border-border bg-muted/20 p-6">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <ChartBarIcon />
        </EmptyMedia>
        <EmptyTitle className="text-sm">Tidak ada data</EmptyTitle>
        <EmptyDescription>{label}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

export class ImpactServiceErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('Impact Service render failed:', error, info);
  }

  render() {
    if (!this.state.hasError) return this.props.children;

    return (
      <div className="min-h-screen bg-background p-6 text-foreground">
        <section className="mx-auto mt-16 max-w-xl rounded-2xl border bg-card p-6 shadow-lg">
          <div className="mb-4 flex items-start gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-destructive/10 text-destructive">
              <WarningCircleIcon className="size-5" />
            </div>
            <div>
              <h1 className="font-heading text-lg font-semibold">Impact Service</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Halaman gagal dirender. Muat ulang komponen untuk mencoba kembali.
              </p>
            </div>
          </div>
          <Button type="button" variant="outline" onClick={() => this.setState({ hasError: false })}>
            <ArrowClockwiseIcon data-icon="inline-start" />
            Muat ulang halaman
          </Button>
        </section>
      </div>
    );
  }
}
