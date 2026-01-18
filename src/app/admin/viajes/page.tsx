'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

type EstadoViaje = 'pendiente' | 'aprobado' | 'facturado' | 'pagado' | 'rechazado'

type ViajeRow = {
  viaje_id: string
  estado: EstadoViaje

  // remito
  numero_remito: string | null
  fecha_viaje: string | null

  // chofer
  chofer_nombre: string | null

  // ruta
  origen: string | null
  destino: string | null

  // unidad
  tipo_unidad: string | null
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
    <span className={`px-2 py-1 rounded text-xs font-medium ${map[estado]}`}>
      {estado}
    </span>
  )
}

export default function AdminViajesPage() {
  const [rows, setRows] = useState<ViajeRow[]>([])
  const [loading, setLoading] = useState(true)

  // filtros
  const [estado, setEstado] = useState<(typeof ESTADOS)[number]>('todos')
  const [qRemito, setQRemito] = useState('')
  const [qChofer, setQChofer] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')

  const load = async () => {
    setLoading(true)

    // ✅ OJO: view
    let query = supabase
      .from('viajes_listado')
      .select(
        `
        viaje_id,
        estado,
        numero_remito,
        fecha_viaje,
        chofer_nombre,
        origen,
        destino,
        tipo_unidad
      `
      )
      .order('fecha_viaje', { ascending: false, nullsFirst: false })

    // estado
    if (estado !== 'todos') query = query.eq('estado', estado)

    // buscar remito
    if (qRemito.trim()) query = query.ilike('numero_remito', `%${qRemito.trim()}%`)

    // buscar chofer
    if (qChofer.trim()) query = query.ilike('chofer_nombre', `%${qChofer.trim()}%`)

    // fechas
    if (desde) query = query.gte('fecha_viaje', desde)
    if (hasta) query = query.lte('fecha_viaje', hasta)

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

  // si querés auto-refresco por filtros, descomentá:
  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado, qRemito, qChofer, desde, hasta])

  const total = useMemo(() => rows.length, [rows])

  return (
    <div className="space-y-6">
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
            className="border rounded p-2 text-sm"
          >
            {ESTADOS.map(s => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <button
            onClick={load}
            className="border rounded px-3 py-2 text-sm hover:bg-gray-50"
          >
            Actualizar
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white border rounded p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <input
            className="border rounded p-2 text-sm"
            placeholder="Buscar remito…"
            value={qRemito}
            onChange={e => setQRemito(e.target.value)}
          />

          <input
            className="border rounded p-2 text-sm"
            placeholder="Buscar chofer…"
            value={qChofer}
            onChange={e => setQChofer(e.target.value)}
          />

          <input
            type="date"
            className="border rounded p-2 text-sm"
            value={desde}
            onChange={e => setDesde(e.target.value)}
          />

          <input
            type="date"
            className="border rounded p-2 text-sm"
            value={hasta}
            onChange={e => setHasta(e.target.value)}
          />
        </div>

        <button
          onClick={() => {
            setEstado('todos')
            setQRemito('')
            setQChofer('')
            setDesde('')
            setHasta('')
          }}
          className="border rounded px-3 py-2 text-sm hover:bg-gray-50"
        >
          Limpiar filtros
        </button>
      </div>

      {/* Tabla */}
      <div className="bg-white border rounded overflow-hidden">
        {loading ? (
          <div className="p-4 text-sm">Cargando…</div>
        ) : rows.length === 0 ? (
          <div className="p-4 text-sm text-gray-600">
            No hay viajes para esos filtros.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left p-3">Estado</th>
                <th className="text-left p-3">Remito</th>
                <th className="text-left p-3">Chofer</th>
                <th className="text-left p-3">Ruta</th>
                <th className="text-left p-3">Unidad</th>
                <th className="text-left p-3">Fecha</th>
                <th className="text-right p-3"></th>
              </tr>
            </thead>

            <tbody>
              {rows.map(r => {
                const ruta = `${r.origen ?? '-'} → ${r.destino ?? '-'}`
                const fecha = r.fecha_viaje
                  ? new Date(r.fecha_viaje).toLocaleDateString()
                  : '-'

                return (
                  <tr key={r.viaje_id} className="border-b last:border-b-0">
                    <td className="p-3">
                      <EstadoBadge estado={r.estado} />
                    </td>

                    <td className="p-3">{r.numero_remito ?? '-'}</td>

                    <td className="p-3">{r.chofer_nombre ?? '-'}</td>

                    <td className="p-3">{ruta}</td>

                    <td className="p-3">{r.tipo_unidad ?? '-'}</td>

                    <td className="p-3">{fecha}</td>

                    <td className="p-3 text-right">
                      <Link
                        href={`/admin/viajes/${r.viaje_id}`}
                        className="text-blue-600 underline"
                      >
                        Ver
                      </Link>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
