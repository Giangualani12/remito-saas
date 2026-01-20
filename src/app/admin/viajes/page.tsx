'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '@/lib/supabase'

type EstadoViaje = 'pendiente' | 'aprobado' | 'facturado' | 'pagado' | 'rechazado'

type ViajeRow = {
  viaje_id: string
  estado: EstadoViaje

  transportista_nombre: string | null

  destino: string | null
  tipo_unidad: string | null

  fecha_viaje: string | null
  numero_remito: string | null
}

const ESTADOS = ['todos', 'pendiente', 'aprobado', 'facturado', 'pagado', 'rechazado'] as const

function EstadoBadge({ estado }: { estado: EstadoViaje }) {
  const map: Record<EstadoViaje, string> = {
    pendiente: 'bg-yellow-100 text-yellow-800',
    aprobado: 'bg-blue-100 text-blue-800',
    facturado: 'bg-purple-100 text-purple-800',
    pagado: 'bg-green-100 text-green-800',
    rechazado: 'bg-red-100 text-red-800',
  }

  return (
    <span className={`px-2 py-1 rounded-lg text-xs font-medium inline-flex items-center gap-1 ${map[estado]}`}>
      <span className="w-1.5 h-1.5 rounded-full bg-current opacity-60" />
      {estado}
    </span>
  )
}

function SkeletonRow() {
  return (
    <tr className="border-b last:border-b-0">
      {Array.from({ length: 7 }).map((_, i) => (
        <td key={i} className="p-3">
          <div className="h-4 w-full rounded bg-gray-100 animate-pulse" />
        </td>
      ))}
    </tr>
  )
}

export default function AdminViajesPage() {
  const [rows, setRows] = useState<ViajeRow[]>([])
  const [loading, setLoading] = useState(true)

  const [estado, setEstado] = useState<(typeof ESTADOS)[number]>('todos')
  const [qTrans, setQTrans] = useState('')
  const [qDestino, setQDestino] = useState('')

  const load = async () => {
    setLoading(true)

    let query = supabase
      .from('viajes_listado')
      .select(
        `
        viaje_id,
        estado,
        transportista_nombre,
        destino,
        tipo_unidad,
        fecha_viaje,
        numero_remito
      `
      )
      .order('fecha_viaje', { ascending: false, nullsFirst: false })

    if (estado !== 'todos') query = query.eq('estado', estado)
    if (qTrans.trim()) query = query.ilike('transportista_nombre', `%${qTrans.trim()}%`)
    if (qDestino.trim()) query = query.ilike('destino', `%${qDestino.trim()}%`)

    const { data, error } = await query

    if (error) {
      alert(error.message)
      setRows([])
      setLoading(false)
      return
    }

    setRows((data ?? []) as ViajeRow[])
    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado, qTrans, qDestino])

  const total = useMemo(() => rows.length, [rows])

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Viajes</h1>
          <p className="text-sm text-gray-500">Listado general (solo admin)</p>
          <div className="text-xs text-gray-400 mt-1">Total: {total}</div>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={estado}
            onChange={e => setEstado(e.target.value as any)}
            className="border rounded-xl p-2 text-sm bg-white hover:bg-gray-50 transition"
          >
            {ESTADOS.map(s => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <button
            onClick={load}
            className="border rounded-xl px-3 py-2 text-sm hover:bg-gray-50 active:scale-[0.98] transition"
          >
            Actualizar
          </button>
        </div>
      </div>

      {/* Filters */}
      <motion.div
        layout
        className="bg-white border rounded-2xl p-4 space-y-3 shadow-sm"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <input
            className="border rounded-xl p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 transition"
            placeholder="Buscar transportista…"
            value={qTrans}
            onChange={e => setQTrans(e.target.value)}
          />

          <input
            className="border rounded-xl p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200 transition"
            placeholder="Buscar destino…"
            value={qDestino}
            onChange={e => setQDestino(e.target.value)}
          />
        </div>

        <button
          onClick={() => {
            setEstado('todos')
            setQTrans('')
            setQDestino('')
          }}
          className="border rounded-xl px-3 py-2 text-sm hover:bg-gray-50 active:scale-[0.98] transition"
        >
          Limpiar filtros
        </button>
      </motion.div>

      {/* Table */}
      <div className="bg-white border rounded-2xl overflow-hidden shadow-sm">
        {loading ? (
          <div className="p-4">
            <div className="text-sm mb-3 text-gray-500">Cargando…</div>
            <table className="w-full text-sm">
              <tbody>
                <SkeletonRow />
                <SkeletonRow />
                <SkeletonRow />
              </tbody>
            </table>
          </div>
        ) : rows.length === 0 ? (
          <div className="p-6 text-sm text-gray-600">No hay viajes para esos filtros.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left p-3">Estado</th>
                <th className="text-left p-3">Transportista</th>
                <th className="text-left p-3">Destino</th>
                <th className="text-left p-3">Unidad</th>
                <th className="text-left p-3">N° Remito</th>
                <th className="text-left p-3">Fecha</th>
                <th className="text-right p-3"></th>
              </tr>
            </thead>

            <tbody>
              <AnimatePresence initial={false}>
                {rows.map(r => {
                  const fecha = r.fecha_viaje ? new Date(r.fecha_viaje).toLocaleDateString() : '-'
                  const remito = r.numero_remito ?? '—'

                  return (
                    <motion.tr
                      key={r.viaje_id}
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.18 }}
                      className="border-b last:border-b-0 hover:bg-gray-50/60 transition"
                    >
                      <td className="p-3">
                        <EstadoBadge estado={r.estado} />
                      </td>

                      <td className="p-3 font-medium">{r.transportista_nombre ?? '-'}</td>
                      <td className="p-3">{r.destino ?? '-'}</td>
                      <td className="p-3">{r.tipo_unidad ?? '-'}</td>
                      <td className="p-3">{remito}</td>
                      <td className="p-3">{fecha}</td>

                      <td className="p-3 text-right">
                        <Link
                          href={`/admin/viajes/${r.viaje_id}`}
                          className="text-blue-600 hover:text-blue-800 underline underline-offset-4"
                        >
                          Ver
                        </Link>
                      </td>
                    </motion.tr>
                  )
                })}
              </AnimatePresence>
            </tbody>
          </table>
        )}
      </div>
    </motion.div>
  )
}
