// El unico lugar que hace fetch. Pone el token, entiende los errores del
// backend y los vuelve un mensaje que una persona normal pueda leer.

const CLAVE_TOKEN = 'agp-planner-token'

export const sesion = {
  token: () => localStorage.getItem(CLAVE_TOKEN),
  guardar: (token: string) => localStorage.setItem(CLAVE_TOKEN, token),
  borrar: () => localStorage.removeItem(CLAVE_TOKEN),
}

export class ErrorApi extends Error {
  status: number

  constructor(status: number, mensaje: string) {
    super(mensaje)
    this.status = status
  }
}

// Cuando el token se vence, cualquier parte de la app puede enterarse
type Oyente = () => void
const alSalir = new Set<Oyente>()
export const escucharSesionVencida = (fn: Oyente) => {
  alSalir.add(fn)
  return () => {
    alSalir.delete(fn)
  }
}

type Detalle = string | { loc?: (string | number)[]; msg: string }[] | undefined

function mensajeDeError(status: number, detalle: Detalle): string {
  if (typeof detalle === 'string') return detalle
  // FastAPI manda los errores de validacion como lista: sacamos el primero legible
  if (Array.isArray(detalle) && detalle.length) {
    const d = detalle[0]
    const campo = d.loc?.filter((x) => x !== 'body').join(' → ')
    const msg = d.msg.replace(/^Value error, /, '')
    return campo ? `${campo}: ${msg}` : msg
  }
  if (status >= 500) return 'El servidor tuvo un problema. Intenta de nuevo en un momento.'
  return `Algo salio mal (${status})`
}

export async function api<T>(ruta: string, opciones: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...resto } = opciones
  const token = sesion.token()

  let respuesta: Response
  try {
    respuesta = await fetch(`/api${ruta}`, {
      ...resto,
      headers: {
        ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: json !== undefined ? JSON.stringify(json) : resto.body,
    })
  } catch {
    throw new ErrorApi(0, 'No hay conexion con el servidor. Revisa tu internet o la VPN.')
  }

  if (respuesta.status === 401 && token && !ruta.startsWith('/auth/login')) {
    sesion.borrar()
    alSalir.forEach((fn) => fn())
  }

  if (!respuesta.ok) {
    const cuerpo = await respuesta.json().catch(() => ({}))
    throw new ErrorApi(respuesta.status, mensajeDeError(respuesta.status, cuerpo.detail))
  }

  if (respuesta.status === 204) return undefined as T
  return respuesta.json() as Promise<T>
}
