import { useEffect, useRef } from 'react';

// eslint-disable-next-line react-refresh/only-export-components
export const VANTA_FOG_OPTIONS = {
  mouseControls: true,
  touchControls: true,
  gyroControls: false,
  minHeight: 200,
  minWidth: 200,
  highlightColor: 0x000000,
  lowlightColor: 0x000000,
  baseColor: 0x000000,
  midtoneColor: 0xe60013,
  blurFactor: .64,
  speed: 2.6,
  zoom: 1.3,
};

export default function LoginFogBackground({ children }) {
  const backgroundRef = useRef(null);

  useEffect(() => {
    const prefersReducedMotion = typeof window !== 'undefined'
      && typeof window.matchMedia === 'function'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (prefersReducedMotion) return undefined;

    let disposed = false;
    let vantaEffect;

    const startFog = async () => {
      try {
        const THREE = await import('three');
        if (disposed || !backgroundRef.current) return;

        const vantaModule = await import('vanta/dist/vanta.fog.min.js');
        if (disposed || !backgroundRef.current) return;

        const createFog = vantaModule.default ?? vantaModule.FOG;
        vantaEffect = createFog?.({
          el: backgroundRef.current,
          THREE,
          ...VANTA_FOG_OPTIONS,
        });
      } catch {
        // The static graphite-red treatment remains visible if WebGL is unavailable.
      }
    };

    void startFog();

    return () => {
      disposed = true;
      vantaEffect?.destroy?.();
    };
  }, []);

  return (
    <div
      ref={backgroundRef}
      data-testid="login-fog-background"
      className="dashboard-canvas relative min-h-[100dvh] overflow-hidden bg-[#090B0F]"
      style={{
        backgroundColor: '#090B0F',
        backgroundImage: 'radial-gradient(circle at 50% 35%, rgba(230, 0, 19, 0.22), transparent 52%)',
      }}
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-[1]"
        style={{
          backgroundImage: 'radial-gradient(ellipse at center, rgba(9, 11, 15, 0.06) 0%, rgba(9, 11, 15, 0.18) 50%, rgba(0, 0, 0, 0.78) 100%)',
        }}
      />
      {children}
    </div>
  );
}
