// Los personajes del planner: cada uno es un vidrio con cara (somos AGP Glass).
// Todo es SVG dibujado a mano, sin imagenes, asi se ven nitidos a cualquier
// tamaño y se pueden animar pieza por pieza (ojos, brazos, boca).
import { motion, type TargetAndTransition, type Transition } from 'motion/react'
import { useEffect, useId, useRef, useState } from 'react'
import type { Personaje as TipoPersonaje } from '@/api/tipos'

export type Expresion =
  | 'feliz' | 'sorprendido' | 'pensando' | 'dormido' | 'celebrando' | 'tapado' | 'triste' | 'guiño'

interface Props {
  personaje?: TipoPersonaje
  expresion?: Expresion
  tamano?: number
  /** hacia donde mira, de -1 a 1 en cada eje */
  mirada?: { x: number; y: number }
  seguirCursor?: boolean
  quieto?: boolean
  className?: string
}

export const PALETA: Record<TipoPersonaje, { claro: string; oscuro: string; nombre: string; rol: string }> = {
  vidrito: { claro: '#9CC0FF', oscuro: '#5B6CFF', nombre: 'Vidrito', rol: 'El de siempre' },
  vendedora: { claro: '#7DF2CB', oscuro: '#16B386', nombre: 'Vendi', rol: 'Comercial' },
  trazos: { claro: '#D2B8FF', oscuro: '#7C5BFF', nombre: 'Trazos', rol: 'Dibujante' },
  tuerca: { claro: '#FFBE98', oscuro: '#FF5E8A', nombre: 'Tuerca', rol: 'Técnico' },
  jefa: { claro: '#FFE59A', oscuro: '#FF9F2E', nombre: 'La Jefa', rol: 'Admin' },
}

const RESORTE: Transition = { type: 'spring', stiffness: 260, damping: 18 }

export function Personaje({
  personaje = 'vidrito',
  expresion = 'feliz',
  tamano = 120,
  mirada,
  seguirCursor = false,
  quieto = false,
  className,
}: Props) {
  const id = useId().replace(/:/g, '')
  const color = PALETA[personaje]
  const caja = useRef<SVGSVGElement>(null)
  const [parpadeo, setParpadeo] = useState(false)
  const [cursor, setCursor] = useState({ x: 0, y: 0 })

  // Parpadeo con tiempos random para que no se vea robotico
  useEffect(() => {
    if (quieto) return
    let t: number
    const programar = () => {
      t = window.setTimeout(() => {
        setParpadeo(true)
        window.setTimeout(() => setParpadeo(false), 130)
        programar()
      }, 2200 + Math.random() * 3200)
    }
    programar()
    return () => window.clearTimeout(t)
  }, [quieto])

  useEffect(() => {
    if (!seguirCursor) return
    const mover = (e: PointerEvent) => {
      const r = caja.current?.getBoundingClientRect()
      if (!r) return
      const cx = r.left + r.width / 2
      const cy = r.top + r.height * 0.5
      const lim = (v: number) => Math.max(-1, Math.min(1, v))
      setCursor({ x: lim((e.clientX - cx) / 300), y: lim((e.clientY - cy) / 300) })
    }
    window.addEventListener('pointermove', mover)
    return () => window.removeEventListener('pointermove', mover)
  }, [seguirCursor])

  const ojo = seguirCursor ? cursor : mirada ?? { x: 0, y: 0 }
  const ojosCerrados = parpadeo || expresion === 'dormido' || expresion === 'celebrando'
  const tapado = expresion === 'tapado'
  const celebra = expresion === 'celebrando'
  const px = ojo.x * 3.2
  const py = ojo.y * 2.6 + (expresion === 'pensando' ? -3 : 0)

  const cuerpo: Record<string, TargetAndTransition> = {
    feliz: { y: [0, -3, 0], rotate: 0 },
    celebrando: { y: [0, -18, 0, -10, 0], rotate: [0, -6, 6, -3, 0] },
    triste: { x: [0, -6, 6, -4, 4, 0], y: 2, rotate: 0 },
    dormido: { y: [0, 1.5, 0], rotate: -4 },
  }
  const animacion = quieto ? undefined : (cuerpo[expresion] ?? cuerpo.feliz)
  const duracion = expresion === 'celebrando' ? 0.9 : expresion === 'triste' ? 0.5 : 3.2

  return (
    <motion.svg
      ref={caja}
      className={className}
      width={tamano}
      height={tamano * (140 / 120)}
      viewBox="0 0 120 140"
      role="img"
      aria-label={`${color.nombre} (${expresion})`}
      animate={animacion}
      transition={{
        duration: duracion,
        repeat: expresion === 'triste' ? 0 : Infinity,
        repeatDelay: expresion === 'celebrando' ? 0.4 : 0,
        ease: 'easeInOut',
      }}
      style={{ overflow: 'visible' }}
    >
      <defs>
        <linearGradient id={`c-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={color.claro} />
          <stop offset="1" stopColor={color.oscuro} />
        </linearGradient>
        <linearGradient id={`b-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".9" />
          <stop offset="1" stopColor="#fff" stopOpacity=".15" />
        </linearGradient>
      </defs>

      {/* sombra en el piso: se anima la escala del grupo (no el rx) para que
          un personaje quieto no quede con atributos sin valor */}
      <motion.g
        animate={quieto ? undefined : { scaleX: celebra ? [1, 0.66, 1] : [1, 0.9, 1] }}
        transition={{ duration: duracion, repeat: Infinity }}
        style={{ originX: '60px', originY: '134px' }}
      >
        <ellipse cx="60" cy="134" rx="30" ry="4" fill="#000" opacity=".22" />
      </motion.g>

      {/* piernas */}
      <rect x="40" y="114" width="12" height="18" rx="6" fill={color.oscuro} />
      <rect x="68" y="114" width="12" height="18" rx="6" fill={color.oscuro} />

      {/* el cuerpo: un vidrio con brillo */}
      <rect x="20" y="24" width="80" height="96" rx="24" fill={`url(#c-${id})`} />
      <rect x="20" y="24" width="80" height="96" rx="24" fill="none" stroke="#fff" strokeOpacity=".45" strokeWidth="2" />
      <path d="M32 34 L58 34 L34 76 Z" fill={`url(#b-${id})`} opacity=".55" />
      <circle cx="86" cy="38" r="3" fill="#fff" opacity=".7" />

      {/* cara */}
      <g>
        {expresion === 'dormido' || (ojosCerrados && !tapado) ? (
          <g stroke="#1B2140" strokeWidth="3.2" strokeLinecap="round" fill="none">
            {celebra ? (
              <>
                <path d="M40 70 q7 -8 14 0" />
                <path d="M66 70 q7 -8 14 0" />
              </>
            ) : (
              <>
                <path d="M40 70 q7 5 14 0" />
                <path d="M66 70 q7 5 14 0" />
              </>
            )}
          </g>
        ) : (
          <g>
            <ellipse cx="47" cy="69" rx="9" ry={expresion === 'sorprendido' ? 11 : 9.5} fill="#fff" />
            {expresion === 'guiño' ? (
              <path d="M66 70 q7 5 14 0" stroke="#1B2140" strokeWidth="3.2" strokeLinecap="round" fill="none" />
            ) : (
              <ellipse cx="73" cy="69" rx="9" ry={expresion === 'sorprendido' ? 11 : 9.5} fill="#fff" />
            )}
            <motion.g animate={{ x: px, y: py }} transition={{ type: 'spring', stiffness: 300, damping: 22 }}>
              <circle cx="47" cy="70" r={expresion === 'sorprendido' ? 3.6 : 4.6} fill="#1B2140" />
              <circle cx="48.6" cy="68" r="1.5" fill="#fff" />
              {expresion !== 'guiño' && (
                <>
                  <circle cx="73" cy="70" r={expresion === 'sorprendido' ? 3.6 : 4.6} fill="#1B2140" />
                  <circle cx="74.6" cy="68" r="1.5" fill="#fff" />
                </>
              )}
            </motion.g>
          </g>
        )}

        {/* cachetes */}
        <circle cx="36" cy="84" r="5" fill="#FF7AA8" opacity=".35" />
        <circle cx="84" cy="84" r="5" fill="#FF7AA8" opacity=".35" />

        <Boca expresion={expresion} />
      </g>

      {/* brazos: van DESPUES de la cara para quedar encima cuando se tapa los ojos
          (en SVG lo ultimo que se dibuja queda adelante). Solo se trasladan, sin rotar. En SVG el punto de giro de motion
          se calcula sobre la caja del grupo y no del dibujo, y al rotar se
          salian volando. La "mano" es el circulo de arriba del brazo. */}
      <motion.g
        animate={tapado ? { x: 31, y: -12 } : celebra ? { x: -3, y: -30 } : { x: 0, y: 0 }}
        transition={RESORTE}
      >
        <rect x="8" y="80" width="16" height="30" rx="8" fill={color.oscuro} />
        <circle cx="16" cy="80" r={tapado ? 10.5 : 8.5} fill={color.claro} />
      </motion.g>
      <motion.g
        animate={tapado ? { x: -31, y: -12 } : celebra ? { x: 3, y: -30 } : { x: 0, y: 0 }}
        transition={RESORTE}
      >
        <rect x="96" y="80" width="16" height="30" rx="8" fill={color.oscuro} />
        <circle cx="104" cy="80" r={tapado ? 10.5 : 8.5} fill={color.claro} />
        {personaje === 'tuerca' && !tapado && (
          <path d="M104 64 l0 -10 m-5 -3 a6 6 0 1 0 10 0" stroke="#5A6280" strokeWidth="4" strokeLinecap="round" fill="none" />
        )}
      </motion.g>

      <Accesorio personaje={personaje} tapado={tapado} />

      {expresion === 'dormido' && !quieto && <Zzz />}
      {expresion === 'pensando' && (
        <g fill="#fff" opacity=".8">
          <circle cx="104" cy="30" r="3" />
          <circle cx="112" cy="18" r="4.5" />
        </g>
      )}
    </motion.svg>
  )
}

function Boca({ expresion }: { expresion: Expresion }) {
  const trazo = { stroke: '#1B2140', strokeWidth: 3.2, strokeLinecap: 'round' as const, fill: 'none' }
  switch (expresion) {
    case 'sorprendido':
      return <ellipse cx="60" cy="92" rx="5.5" ry="7" fill="#1B2140" />
    case 'celebrando':
      return <path d="M48 88 q12 16 24 0 z" fill="#1B2140" />
    case 'triste':
      return <path d="M50 96 q10 -8 20 0" {...trazo} />
    case 'pensando':
      return <path d="M52 92 l16 -2" {...trazo} />
    case 'dormido':
      return <ellipse cx="60" cy="92" rx="3.5" ry="2.5" fill="#1B2140" opacity=".7" />
    case 'tapado':
      return <path d="M52 91 q8 6 16 0" {...trazo} />
    default:
      return <path d="M50 89 q10 10 20 0" {...trazo} />
  }
}

function Accesorio({ personaje, tapado }: { personaje: TipoPersonaje; tapado: boolean }) {
  switch (personaje) {
    case 'vendedora':
      // corbata + pinza de pelo
      return (
        <g>
          <path d="M60 102 l-5 5 5 12 5 -12 z" fill="#1B2140" opacity=".85" />
          <path d="M55 100 h10 l-5 5 z" fill="#1B2140" />
          <path d="M84 22 q8 -8 14 0 q-7 6 -14 0" fill="#FF7AA8" />
          <circle cx="84" cy="24" r="3.5" fill="#FFD166" />
        </g>
      )
    case 'trazos':
      // boina + lapiz en la oreja
      return (
        <g>
          <ellipse cx="54" cy="25" rx="30" ry="9" fill="#2A2F55" />
          <path d="M28 25 q26 -24 52 0" fill="#343A6B" />
          <rect x="52" y="6" width="5" height="9" rx="2.5" fill="#2A2F55" />
          {!tapado && (
            <g transform="rotate(-35 100 50)">
              <rect x="92" y="46" width="30" height="7" rx="2" fill="#FFD166" />
              <path d="M122 46 l7 3.5 -7 3.5 z" fill="#F4E1C1" />
              <rect x="88" y="46" width="5" height="7" rx="1.5" fill="#FF7AA8" />
            </g>
          )}
        </g>
      )
    case 'tuerca':
      // casco de obra
      return (
        <g>
          <path d="M26 30 q34 -34 68 0 z" fill="#FFC53D" />
          <rect x="20" y="28" width="80" height="7" rx="3.5" fill="#F5A300" />
          <rect x="56" y="10" width="8" height="16" rx="3" fill="#F5A300" />
        </g>
      )
    case 'jefa':
      // corona
      return (
        <g>
          <path d="M34 26 l6 -18 12 12 8 -16 8 16 12 -12 6 18 z" fill="#FFD166" stroke="#F5A300" strokeWidth="2" strokeLinejoin="round" />
          <circle cx="60" cy="12" r="3" fill="#FF5C8A" />
          <circle cx="40" cy="10" r="2.4" fill="#7C8CFF" />
          <circle cx="80" cy="10" r="2.4" fill="#2FCB8B" />
        </g>
      )
    default:
      // antena con destello
      return (
        <g>
          <path d="M60 24 v-12" stroke="#5B6CFF" strokeWidth="3" strokeLinecap="round" />
          <motion.path
            d="M60 0 l3 6 6 3 -6 3 -3 6 -3 -6 -6 -3 6 -3 z"
            fill="#FFE59A"
            animate={{ rotate: 360, scale: [1, 1.2, 1] }}
            transition={{ duration: 6, repeat: Infinity, ease: 'linear' }}
            style={{ originX: '60px', originY: '9px' }}
          />
        </g>
      )
  }
}

function Zzz() {
  return (
    <g fill="#fff" fontFamily="Outfit, sans-serif" fontWeight="800">
      {[0, 1, 2].map((i) => (
        <motion.text
          key={i}
          x={92 + i * 8}
          y={30 - i * 10}
          fontSize={10 + i * 3}
          initial={{ opacity: 0, y: 0 }}
          animate={{ opacity: [0, 1, 0], y: -12 }}
          transition={{ duration: 2.4, repeat: Infinity, delay: i * 0.6 }}
        >
          z
        </motion.text>
      ))}
    </g>
  )
}
