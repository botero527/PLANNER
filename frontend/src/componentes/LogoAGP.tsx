// El logo de AGP en SVG: el arco azul cielo encima de las letras.
// Las letras usan var(--logo-letras) para verse bien en tema claro y oscuro.
export function LogoAGP({ alto = 28, conProducto = true }: { alto?: number; conProducto?: boolean }) {
  return (
    <span className="logo-agp" style={{ display: 'inline-flex', alignItems: 'flex-end', gap: alto * 0.35 }}>
      <svg height={alto} viewBox="0 0 120 56" role="img" aria-label="AGP">
        <defs>
          <linearGradient id="arco-agp" x1="0" x2="1">
            <stop offset="0" stopColor="#9cc7d3" stopOpacity="0.2" />
            <stop offset="0.5" stopColor="#9cc7d3" />
            <stop offset="1" stopColor="#9cc7d3" stopOpacity="0.2" />
          </linearGradient>
        </defs>
        {/* el arco: grueso en el centro y fino en las puntas, como el original */}
        <path d="M2 24 Q60 -8 118 24 Q60 6 2 24 Z" fill="url(#arco-agp)" />
        <text
          x="60" y="54" textAnchor="middle"
          fontFamily="Outfit, 'Segoe UI', sans-serif" fontWeight="800" fontSize="36" letterSpacing="4"
          fill="var(--logo-letras)"
        >
          AGP
        </text>
      </svg>
      {conProducto && (
        <span style={{ fontSize: alto * 0.5, fontWeight: 600, color: 'var(--texto-2)', lineHeight: 1, paddingBottom: alto * 0.04 }}>
          Planner
        </span>
      )}
    </span>
  )
}
