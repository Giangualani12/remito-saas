'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import ChoferHeader from '@/components/chofer/ChoferHeader'

type ViajeEmbed = {
  id: string
  estado: string
  origen: string | null
  destino: string | null
  tipo_unidad: string | null
}

type RemitoRow = {
  id: string
  numero_remito: string
  fecha_viaje: string
  archivo_url: string
  viaje: any // puede venir objeto o array
}

const ESTADOS = [
  'todos',
  'pendiente',
  'aprobado',
  'facturado',
  'pagado',
  'rechazado',
] as const

function EstadoBadge({ estado }: { estado: string }) {
  const map: Record<string, string> = {
    pendiente: 'bg-yellow-100 text-yellow-800',
    aprobado: 'bg-blue-100 text-blue-800',
    facturado: 'bg-purple-100 text-purple-800',
    pagado: 'bg-green-100 text-green-800',
    rechazado: 'bg-red-100 text-red-800',
  }

  return (
    <span
      className={`px-2 py-1 rounded-full text-xs font-medium ${
        map[estado] ?? 'bg-gray-100 text-gray-700'
      }`}
    >
      {estado}
    </span>
  )
}

function normalizeViaje(v: any): ViajeEmbed | null {
  const x = Array.isArray(v) ? v[0] : v
  if (!x) return null
  return {
    id: x.id,
    estado: x.estado,
    origen: x.origen ?? null,
    destino: x.destino ?? null,
    tipo_unidad: x.tipo_unidad ?? null,
  }
}

export default function MisRemitosPage() {
  const [rows, setRows] = useState<RemitoRow[]>([])
  const [loading, setLoading] = useState(true)

  const [q, setQ] = useState('') // ✅ buscador
  const [estado, setEstado] =
    useState<(typeof ESTADOS)[number]>('todos')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')

  const load = async () => {
    setLoading(true)

    const { data, error } = await supabase
      .from('remitos')
      .select(
        `
        id,
        numero_remito,
        fecha_viaje,
        archivo_url,
        viaje:viaje_id (
          id,
          estado,
          origen,
          destino,
          tipo_unidad
        )
      `
      )
      .order('fecha_viaje', { ascending: false })

    if (error) {
      alert(error.message)
      setRows([])
      setLoading(false)
      return
    }

    setRows((data ?? []) as unknown as RemitoRow[])
    setLoading(false)
  }

  useEffect(() => {
    load()

    // ✅ Auto refresh cada 8s
    const t = setInterval(load, 8000)
    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const filtrados = useMemo(() => {
    const query = q.trim().toLowerCase()

    return rows.filter(r => {
      const viaje = normalizeViaje(r.viaje)
      const estadoViaje = viaje?.estado ?? 'pendiente'

      // filtro estado
      if (estado !== 'todos' && estadoViaje !== estado) return false

      // filtro fechas
      if (desde) {
        const d = new Date(r.fecha_viaje)
        const d0 = new Date(desde)
        d0.setHours(0, 0, 0, 0)
        if (d < d0) return false
      }

      if (hasta) {
        const d = new Date(r.fecha_viaje)
        const d1 = new Date(hasta)
        d1.setHours(23, 59, 59, 999)
        if (d > d1) return false
      }

      // ✅ buscador
      if (query) {
        const origen = (viaje?.origen ?? '').toLowerCase()
        const destino = (viaje?.destino ?? '').toLowerCase()
        const unidad = (viaje?.tipo_unidad ?? '').toLowerCase()
        const nro = (r.numero_remito ?? '').toLowerCase()

        const ok =
          nro.includes(query) ||
          origen.includes(query) ||
          destino.includes(query) ||
          unidad.includes(query)

        if (!ok) return false
      }

      return true
    })
  }, [rows, estado, desde, hasta, q])

  const verArchivo = async (archivo_url: string) => {
    // si ya es link
    if (/^https?:\/\//i.test(archivo_url)) {
      window.open(archivo_url, '_blank')
      return
    }

    const { data, error } = await supabase.storage
      .from('remitos')
      .createSignedUrl(archivo_url, 300)

    if (error) {
      alert(error.message)
      return
    }

    window.open(data.signedUrl, '_blank')
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <ChoferHeader />

      <div className="max-w-md mx-auto p-4 space-y-4">
        {/* Header */}
        <div className="bg-white rounded-2xl border border-gray-200 p-4 flex items-start justify-between gap-3 shadow-sm">
          <div>
            <h1 className="text-xl font-bold">Mis remitos</h1>
            <p className="text-sm text-gray-600">
              Buscá por número, ruta o unidad. El estado se actualiza solo.
            </p>
          </div>

          <button
            onClick={load}
            className="border border-gray-200 rounded-xl px-3 py-2 text-sm hover:bg-gray-50 active:scale-[0.99] transition"
          >
            🔄
          </button>
        </div>

        {/* ✅ Buscador */}
        <div className="bg-white rounded-2xl border border-gray-200 p-4 shadow-sm space-y-3">
          <div>
            <label className="text-sm font-medium">Buscar</label>
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Ej: 1234 / Rosario / Mar del Plata / chasis…"
              className="mt-1 w-full border border-gray-200 rounded-xl p-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
            />
          </div>

          <div>
            <label className="text-sm font-medium">Estado</label>
            <select
              className="mt-1 w-full border border-gray-200 rounded-xl p-2 text-sm"
              value={estado}
              onChange={e => setEstado(e.target.value as any)}
            >
              {ESTADOS.map(s => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-sm font-medium">Desde</label>
              <input
                type="date"
                className="mt-1 w-full border border-gray-200 rounded-xl p-2 text-sm"
                value={desde}
                onChange={e => setDesde(e.target.value)}
              />
            </div>
            <div>
              <label className="text-sm font-medium">Hasta</label>
              <input
                type="date"
                className="mt-1 w-full border border-gray-200 rounded-xl p-2 text-sm"
                value={hasta}
                onChange={e => setHasta(e.target.value)}
              />
            </div>
          </div>

          <button
            onClick={() => {
              setQ('')
              setEstado('todos')
              setDesde('')
              setHasta('')
            }}
            className="w-full border border-gray-200 rounded-xl p-2 text-sm hover:bg-gray-50"
          >
            Limpiar filtros
          </button>
        </div>

        {/* Lista */}
        <div className="bg-white rounded-2xl border border-gray-200 overflow-hidden shadow-sm">
          {loading ? (
            <div className="p-4 text-sm">Cargando…</div>
          ) : filtrados.length === 0 ? (
            <div className="p-4 text-sm text-gray-600">
              No hay remitos para esos filtros.
            </div>
          ) : (
            <div className="divide-y divide-gray-100">
              {filtrados.map(r => {
                const viaje = normalizeViaje(r.viaje)
                const ruta = `${viaje?.origen ?? '-'} → ${viaje?.destino ?? '-'}`

                return (
                  <div key={r.id} className="p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="font-semibold text-sm">
                        Remito #{r.numero_remito}
                      </div>
                      <EstadoBadge estado={viaje?.estado ?? 'pendiente'} />
                    </div>

                    <div className="text-xs text-gray-500 flex items-center justify-between">
                      <span>{new Date(r.fecha_viaje).toLocaleDateString()}</span>
                      {viaje?.id ? (
                        <span className="text-gray-400">
                          Viaje {viaje.id.slice(0, 8)}
                        </span>
                      ) : null}
                    </div>

                    <div className="text-sm text-gray-700">
                      <b>Ruta:</b> {ruta}
                      <span className="text-gray-400"> · </span>
                      <b>Unidad:</b> {viaje?.tipo_unidad ?? '-'}
                    </div>

                    <button
                      onClick={() => verArchivo(r.archivo_url)}
                      className="text-blue-600 underline text-sm"
                    >
                      Ver archivo
                    </button>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="text-xs text-gray-400 text-center">
          Se actualiza automáticamente cada 8 segundos.
        </div>
      </div>
    </div>
  )
}
