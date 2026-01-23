'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

type EstadoViaje = 'pendiente' | 'aprobado' | 'facturado' | 'pagado' | 'rechazado'

type ViajeRow = {
  viaje_id: string
  estado: EstadoViaje
  transportista_nombre: string | null
  destino: string | null
  tipo_unidad: string | null

  numero_remito: string | null
  fecha_viaje: string | null

  remito_creado_en: string | null
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
    <span className={`px-2 py-1 rounded-full text-xs font-medium inline-block ${map[estado]}`}>
      {estado}
    </span>
  )
}

export default function AdminViajesPage() {
  const [rows, setRows] = useState<ViajeRow[]>([])
  const [loading, setLoading] = useState(true)

  const [estado, setEstado] = useState<(typeof ESTADOS)[number]>('todos')
  const [qTrans, setQTrans] = useState('')
  const [qDestino, setQDestino] = useState('')
  const [qRemito, setQRemito] = useState('')

  const total = useMemo(() => rows.length, [rows])

  const load = async () => {
    setLoading(true)

    let query = supabase
      .from('viajes_listado')
      .select(`
        viaje_id,
        estado,
        transportista_nombre,
        destino,
        tipo_unidad,
        numero_remito,
        fecha_viaje,
        remito_creado_en
      `)
      // ✅ el último remito subido siempre arriba
      .order('remito_creado_en', { ascending: false, nullsFirst: false })

    if (estado !== 'todos') query = query.eq('estado', estado)
    if (qTrans.trim()) query = query.ilike('transportista_nombre', `%${qTrans.trim()}%`)
    if (qDestino.trim()) query = query.ilike('destino', `%${qDestino.trim()}%`)
    if (qRemito.trim()) query = query.ilike('numero_remito', `%${qRemito.trim()}%`)

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
  }, [estado, qTrans, qDestino, qRemito])

  const limpiar = () => {
    setEstado('todos')
    setQTrans('')
    setQDestino('')
    setQRemito('')
  }

  return (
    <div className="space-y-6 fade-up">
      {/* HEADER */}
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
            className="border rounded-xl p-2 text-sm bg-white"
          >
            {ESTADOS.map(s => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>

          <button onClick={load} className="border rounded-xl px-3 py-2 text-sm hover:bg-gray-50 transition">
            Actualizar
          </button>
        </div>
      </div>

      {/* FILTROS */}
      <div className="bg-white border rounded-2xl p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
          <input
            className="border rounded-xl p-2 text-sm"
            placeholder="Buscar transportista…"
            value={qTrans}
            onChange={e => setQTrans(e.target.value)}
          />

          <input
            className="border rounded-xl p-2 text-sm"
            placeholder="Buscar destino…"
            value={qDestino}
            onChange={e => setQDestino(e.target.value)}
          />

          <input
            className="border rounded-xl p-2 text-sm"
            placeholder="Buscar Nº remito…"
            value={qRemito}
            onChange={e => setQRemito(e.target.value)}
          />
        </div>

        <button onClick={limpiar} className="border rounded-xl px-3 py-2 text-sm hover:bg-gray-50 transition">
          Limpiar filtros
        </button>
      </div>

      {/* TABLA */}
      <div className="bg-white border rounded-2xl overflow-hidden">
        {loading ? (
          <div className="p-4 text-sm animate-pulse">Cargando…</div>
        ) : rows.length === 0 ? (
          <div className="p-4 text-sm text-gray-600">No hay viajes para esos filtros.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left p-3">Estado</th>
                <th className="text-left p-3">Transportista</th>
                <th className="text-left p-3">Destino</th>
                <th className="text-left p-3">Unidad</th>
                <th className="text-left p-3">N° Remito</th>
                <th className="text-left p-3">Fecha viaje</th>
                <th className="text-right p-3"></th>
              </tr>
            </thead>

            <tbody>
              {rows.map(r => {
                const fecha = r.fecha_viaje ? new Date(r.fecha_viaje).toLocaleDateString() : '-'
                const nro = r.numero_remito ?? '-'

                return (
                  <tr
                    key={r.viaje_id}
                    className="border-b last:border-b-0 hover:bg-gray-50 transition"
                    style={{ animation: 'rowIn 0.25s ease both' }}
                  >
                    <td className="p-3">
                      <EstadoBadge estado={r.estado} />
                    </td>

                    <td className="p-3 font-medium">{r.transportista_nombre ?? '-'}</td>
                    <td className="p-3">{r.destino ?? '-'}</td>
                    <td className="p-3">{r.tipo_unidad ?? '-'}</td>
                    <td className="p-3 font-semibold">{nro}</td>
                    <td className="p-3">{fecha}</td>

                    <td className="p-3 text-right">
                      <Link href={`/admin/viajes/${r.viaje_id}`} className="text-blue-600 underline">
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

      {/* Animaciones suaves */}
      <style jsx global>{`
        .fade-up {
          animation: fadeUp 0.25s ease both;
        }
        @keyframes fadeUp {
          from {
            opacity: 0;
            transform: translateY(6px);
          }
          to {
            opacity: 1;
            transform: translateY(0px);
          }
        }

        @keyframes rowIn {
          from {
            opacity: 0;
            transform: translateY(4px);
          }
          to {
            opacity: 1;
            transform: translateY(0px);
          }
        }
      `}</style>
    </div>
  )
}
