import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { motion } from 'motion/react'
import { Box, Download, Eye, FileArchive, FileImage, FileSpreadsheet, FileText, Trash2, UploadCloud } from 'lucide-react'
import { useState } from 'react'
import { toast } from 'sonner'
import { ErrorApi } from '@/api/cliente'
import { adjuntos } from '@/api/endpoints'
import type { Adjunto, PedidoDetalle } from '@/api/tipos'
import { useAuth } from '@/auth/AuthContext'
import { Personaje } from '@/componentes/personajes/Personaje'
import { sePuedeVer, VisorArchivo } from '@/componentes/VisorArchivo'
import { haceCuanto, tamanoArchivo } from '@/utiles/formato'

function iconoPara(nombre: string) {
  const ext = nombre.split('.').pop()?.toLowerCase() ?? ''
  if (['xlsx', 'xls', 'csv'].includes(ext)) return FileSpreadsheet
  if (['zip', 'rar', '7z'].includes(ext)) return FileArchive
  if (['dwg', 'dxf', 'step', 'stp', 'igs', 'iges', '3dm'].includes(ext)) return Box
  if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp'].includes(ext)) return FileImage
  return FileText
}

export function PestanaArchivos({ pedido }: { pedido: PedidoDetalle }) {
  const { usuario, puede } = useAuth()
  const qc = useQueryClient()
  const [arrastrando, setArrastrando] = useState(false)
  const [viendo, setViendo] = useState<number | null>(null)  // posicion en la lista del visor
  const { data: lista = [], isLoading } = useQuery({ queryKey: ['adjuntos', pedido.id], queryFn: () => adjuntos.listar(pedido.id) })

  const refrescar = () => {
    qc.invalidateQueries({ queryKey: ['adjuntos', pedido.id] })
    qc.invalidateQueries({ queryKey: ['pedido', pedido.id] })
    qc.invalidateQueries({ queryKey: ['tablero'] })
  }

  const subir = useMutation({
    mutationFn: (archivos: File[]) => adjuntos.subir(pedido.id, archivos),
    onSuccess: (r) => { toast.success(`${r.length} archivo(s) subido(s)`); refrescar() },
    onError: (e) => toast.error(e instanceof ErrorApi ? e.message : 'No se pudo subir'),
  })
  const quitar = useMutation({ mutationFn: adjuntos.eliminar, onSuccess: refrescar, onError: (e) => toast.error((e as Error).message) })

  const recibir = (files: FileList | null) => {
    const arr = Array.from(files ?? [])
    if (arr.length) subir.mutate(arr)
  }

  const imagenes = lista.filter((a) => a.es_imagen)
  const otros = lista.filter((a) => !a.es_imagen)
  // el visor recorre las imagenes y despues los documentos, en el mismo orden de la pantalla
  const ordenados = [...imagenes, ...otros]
  const puedeQuitar = (a: Adjunto) => a.subido_por.id === usuario?.id || puede('pedido.eliminar')

  return (
    <div className="archivos">
      {puede('adjunto.subir') && (
        <label
          className={`archivos__zona ${arrastrando ? 'encima' : ''} ${subir.isPending ? 'subiendo' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setArrastrando(true) }}
          onDragLeave={() => setArrastrando(false)}
          onDrop={(e) => { e.preventDefault(); setArrastrando(false); recibir(e.dataTransfer.files) }}
        >
          <input type="file" multiple hidden onChange={(e) => { recibir(e.target.files); e.target.value = '' }} />
          <motion.span animate={arrastrando ? { y: -6, scale: 1.1 } : { y: 0, scale: 1 }}><UploadCloud size={30} /></motion.span>
          <strong>{subir.isPending ? 'Subiendo a la nube…' : arrastrando ? '¡Suéltalos!' : 'Arrastra archivos aquí o haz clic'}</strong>
          <span>Fotos, planos DWG/DXF, PDF, Excel… hasta 25 MB cada uno</span>
        </label>
      )}

      {!isLoading && lista.length === 0 && (
        <div className="chat__vacio">
          <Personaje expresion="pensando" tamano={80} />
          <p>Este pedido todavía no tiene archivos.</p>
        </div>
      )}

      {imagenes.length > 0 && (
        <section>
          <h4 className="archivos__titulo">Imágenes ({imagenes.length})</h4>
          <div className="archivos__galeria">
            {imagenes.map((a) => (
              <motion.button key={a.id} className="archivos__foto" onClick={() => setViendo(ordenados.indexOf(a))} whileHover={{ y: -3 }} layout>
                <img src={a.url} alt={a.nombre} loading="lazy" />
                <span>{a.nombre}</span>
              </motion.button>
            ))}
          </div>
        </section>
      )}

      {otros.length > 0 && (
        <section>
          <h4 className="archivos__titulo">Documentos ({otros.length})</h4>
          <ul className="archivos__lista">
            {otros.map((a) => {
              const Icono = iconoPara(a.nombre)
              return (
                <li key={a.id} className={`vidrio ${sePuedeVer(a) ? 'se-ve' : ''}`} onClick={() => setViendo(ordenados.indexOf(a))}>
                  <span className="archivos__icono"><Icono size={20} /></span>
                  <div className="archivos__info">
                    <strong>{a.nombre}</strong>
                    <span>{tamanoArchivo(a.tamano_bytes)} · {a.subido_por.nombre} · {haceCuanto(a.creado_en)}</span>
                  </div>
                  {sePuedeVer(a) && <span className="btn btn-fantasma btn-icono" title="Vista previa"><Eye size={17} /></span>}
                  <a className="btn btn-fantasma btn-icono" href={a.url_descarga} title="Descargar" onClick={(e) => e.stopPropagation()}><Download size={17} /></a>
                  {puedeQuitar(a) && (
                    <button className="btn btn-fantasma btn-icono btn-peligro" onClick={(e) => { e.stopPropagation(); if (window.confirm(`¿Quitar ${a.nombre}?`)) quitar.mutate(a.id) }} title="Quitar"><Trash2 size={16} /></button>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <VisorArchivo
        archivos={ordenados}
        indice={viendo}
        alCambiar={setViendo}
        puedeQuitar={puedeQuitar}
        alQuitar={(a) => quitar.mutate(a.id)}
      />
    </div>
  )
}
