import type { UsuarioMini } from '@/api/tipos'
import { PALETA, Personaje } from './personajes/Personaje'
import './avatar.css'

interface Props {
  usuario: Pick<UsuarioMini, 'nombre' | 'personaje'>
  tamano?: number
  enLinea?: boolean
  anillo?: boolean
}

// La cabeza del personaje dentro de un circulo. Va quieto (sin animaciones)
// porque en el tablero puede haber cientos al mismo tiempo.
export function Avatar({ usuario, tamano = 32, enLinea, anillo }: Props) {
  const color = PALETA[usuario.personaje] ?? PALETA.vidrito
  // el SVG es mas grande que el circulo; lo corremos para que la cara
  // (x=50%, y=51% del dibujo) quede justo en el centro
  const ancho = tamano * 1.7
  const alto = ancho * (140 / 120)
  return (
    <span className={`avatar ${anillo ? 'avatar--anillo' : ''}`} style={{ width: tamano, height: tamano }} title={usuario.nombre}>
      <span className="avatar__circulo" style={{ background: `linear-gradient(135deg, ${color.claro}66, ${color.oscuro}66)` }}>
        <span className="avatar__cara" style={{ left: tamano / 2 - ancho / 2, top: tamano / 2 - alto * 0.52 }}>
          <Personaje personaje={usuario.personaje} tamano={ancho} quieto />
        </span>
      </span>
      {enLinea && <span className="avatar__punto" />}
    </span>
  )
}

export function PilaAvatares({ usuarios, max = 3, tamano = 26 }: { usuarios: UsuarioMini[]; max?: number; tamano?: number }) {
  const visibles = usuarios.slice(0, max)
  const resto = usuarios.length - visibles.length
  return (
    <span className="pila-avatares">
      {visibles.map((u) => (
        <Avatar key={u.id} usuario={u} tamano={tamano} anillo />
      ))}
      {resto > 0 && (
        <span className="pila-avatares__mas" style={{ width: tamano, height: tamano }}>
          +{resto}
        </span>
      )}
    </span>
  )
}
