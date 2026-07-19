import React from 'react';


export default class MapRouteErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('Map route failed:', error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;

    return (
      <div className="flex min-h-[60vh] items-center justify-center p-6">
        <div className="max-w-md rounded-xl border border-red-400/30 bg-[var(--bg-surface)] p-6 text-center shadow-xl">
          <h2 className="text-base font-semibold text-red-300">Terjadi kesalahan saat membuka halaman peta</h2>
          <p className="mt-2 text-sm text-[var(--text-secondary)]">
            Halaman lain tetap aman. Muat ulang route peta atau kembali ke Home.
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-md bg-[var(--primary)] px-3 py-2 text-xs font-semibold text-white"
            >
              Coba lagi
            </button>
            <a
              href="/home"
              className="rounded-md border border-[var(--border)] px-3 py-2 text-xs font-semibold text-[var(--text-secondary)]"
            >
              Kembali ke Home
            </a>
          </div>
        </div>
      </div>
    );
  }
}
