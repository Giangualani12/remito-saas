'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { supabase } from '@/lib/supabase'

type EstadoViaje = 'pendiente' | 'aprobado' | 'facturado' | 'pagado' | 'rechazado'

type ViajeRaw = {
  id: string
  estado: EstadoViaje
  destino: string | null
  tipo_unidad: string | null
  creado_en: string
  valor_chofer_snapshot: number | null
  chofer_nombre: string | null
  usuarios: { nombre: string | null } | { nombre: string | null }[] | null
  remitos: { numero_remito: string | null; archivo_url: string | null; fecha_viaje: string | null }[] | null
}

type PagoRow = {
  viaje_id: string
  estado: EstadoViaje
  transportista: string
  chofer_real: string
  destino: string
  unidad: string
  remito: string
  archivo_url: string | null
  fecha_viaje: string | null
  a_pagar: number
  creado_en: string
}

function money(n: number | null | undefined) {
  const v = Number(n ?? 0)
  return `$${v.toLocaleString('es-AR')}`
}

function normalizeViaje(v: ViajeRaw): PagoRow {
  const u = Array.isArray(v.usuarios) ? v.usuarios[0] : v.usuarios
  const r = Array.isArray(v.remitos) ? v.remitos[0] : null

  return {
    viaje_id: v.id,
    estado: v.estado,
    transportista: u?.nombre ?? '-',
    chofer_real: v.chofer_nombre ?? '-',
    destino: v.destino ?? '-',
    unidad: v.tipo_unidad ?? '-',
    remito: r?.numero_remito ?? '—',
    archivo_url: r?.archivo_url ?? null,
    fecha_viaje: r?.fecha_viaje ?? null,
    a_pagar: Number(v.valor_chofer_snapshot ?? 0),
    creado_en: v.creado_en,
  }
}

function EstadoBadge({ estado }: { estado: EstadoViaje }) {
  const map: Record<EstadoViaje, string> = {
    pendiente: 'bg-yellow-50 text-yellow-700 ring-yellow-200',
    aprobado: 'bg-blue-50 text-blue-700 ring-blue-200',
    facturado: 'bg-purple-50 text-purple-700 ring-purple-200',
    pagado: 'bg-green-50 text-green-700 ring-green-200',
    rechazado: 'bg-red-50 text-red-700 ring-red-200',
  }

  return (
    <span className={`inline-flex items-center px-2 py-1 text-xs font-semibold rounded-full ring-1 ${map[estado]}`}>
      {estado}
    </span>
  )
}

export default function AdminPagosPage() {
  const [rows, setRows] = useState<PagoRow[]>([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState<'pendientes' | 'historial'>('pendientes')
  const [q, setQ] = useState('')
  const [markingId, setMarkingId] = useState<string | null>(null)

  const load = async () => {
    setLoading(true)

    const { data, error } = await supabase
      .from('viajes')
      .select(
        `
        id,
        estado,
        destino,
        tipo_unidad,
        creado_en,
        valor_chofer_snapshot,
        chofer_nombre,
        usuarios:chofer_id ( nombre ),
        remitos ( numero_remito, archivo_url, fecha_viaje )
      `
      )
      .in('estado', ['facturado', 'pagado'])
      .order('creado_en', { ascending: false })

    if (error) {
      alert(error.message)
      setRows([])
      setLoading(false)
      return
    }

    const mapped = ((data ?? []) as ViajeRaw[]).map(normalizeViaje)
    setRows(mapped)
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const filtradas = useMemo(() => {
    const qq = q.trim().toLowerCase()

    return rows.filter(r => {
      // tabs
      if (tab === 'pendientes' && r.estado !== 'facturado') return false
      if (tab === 'historial' && r.estado !== 'pagado') return false

      if (!qq) return true

      return (
        r.transportista.toLowerCase().includes(qq) ||
        r.chofer_real.toLowerCase().includes(qq) ||
        r.destino.toLowerCase().includes(qq) ||
        r.unidad.toLowerCase().includes(qq) ||
        r.remito.toLowerCase().includes(qq) ||
        r.viaje_id.toLowerCase().includes(qq)
      )
    })
  }, [rows, tab, q])

  const resumen = useMemo(() => {
    const pendientes = rows.filter(r => r.estado === 'facturado')
    const totalPendientes = pendientes.reduce((acc, x) => acc + (x.a_pagar ?? 0), 0)
    return {
      pendientesCount: pendientes.length,
      totalPendientes,
    }
  }, [rows])

  const verArchivo = async (archivo_url: string) => {
    if (!archivo_url) return

    if (/^https?:\/\//i.test(archivo_url)) {
      window.open(archivo_url, '_blank')
      return
    }

    const { data, error } = await supabase.storage.from('remitos').createSignedUrl(archivo_url, 300)
    if (error) return alert(error.message)
    window.open(data.signedUrl, '_blank')
  }

  const marcarPagado = async (viajeId: string) => {
    setMarkingId(viajeId)

    // ✅ acá NO se paga: solo marcamos estado
    const { error } = await supabase.rpc('cambiar_estado_viaje', {
      p_viaje_id: viajeId,
      p_estado: 'pagado',
    })

    if (error) {
      alert(error.message)
      setMarkingId(null)
      return
    }

    setRows(prev => prev.map(r => (r.viaje_id === viajeId ? { ...r, estado: 'pagado' } : r)))
    setMarkingId(null)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pagos a transportistas</h1>
          <p className="text-sm text-gray-500">
            Acá no se paga de verdad: solo marcás como <b>pagado</b> cuando ya lo pagaste afuera.
          </p>
        </div>

        <button
          onClick={load}
          className="px-3 py-2 text-sm rounded-xl border bg-white hover:bg-gray-50 transition active:scale-[0.99]"
        >
          Actualizar
        </button>
      </div>

      {/* Resumen simple */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-xs text-gray-500">Pendientes (facturados)</div>
          <div className="text-2xl font-bold">{resumen.pendientesCount}</div>
        </div>

        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-xs text-gray-500">Total a pagar (pendientes)</div>
          <div className="text-2xl font-bold">{money(resumen.totalPendientes)}</div>
        </div>
      </div>

      {/* Tabs + buscador */}
      <div className="rounded-2xl border bg-white p-4 shadow-sm">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="inline-flex rounded-xl border overflow-hidden">
            <button
              onClick={() => setTab('pendientes')}
              className={[
                'px-4 py-2 text-sm font-medium transition',
                tab === 'pendientes' ? 'bg-blue-600 text-white' : 'bg-white hover:bg-gray-50',
              ].join(' ')}
            >
              Pendientes
            </button>
            <button
              onClick={() => setTab('historial')}
              className={[
                'px-4 py-2 text-sm font-medium transition',
                tab === 'historial' ? 'bg-blue-600 text-white' : 'bg-white hover:bg-gray-50',
              ].join(' ')}
            >
              Historial
            </button>
          </div>

          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            placeholder="Buscar (transportista, chofer, destino, remito, id)…"
            className="w-[420px] max-w-full border rounded-xl px-3 py-2 text-sm"
          />
        </div>

        {/* Tabla */}
        <div className="mt-4 overflow-hidden rounded-2xl border">
          {loading ? (
            <div className="p-4 text-sm text-gray-600">Cargando…</div>
          ) : filtradas.length === 0 ? (
            <div className="p-4 text-sm text-gray-600">No hay resultados.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="bg-gray-50 text-gray-600">
                <tr className="border-b">
                  <th className="text-left p-3 font-medium">Transportista</th>
                  <th className="text-left p-3 font-medium">Chofer real</th>
                  <th className="text-left p-3 font-medium">Destino</th>
                  <th className="text-left p-3 font-medium">Unidad</th>
                  <th className="text-left p-3 font-medium">Remito</th>
                  <th className="text-left p-3 font-medium">A pagar</th>
                  <th className="text-left p-3 font-medium">Estado</th>
                  <th className="text-right p-3 font-medium">Acciones</th>
                </tr>
              </thead>

              <tbody className="divide-y">
                {filtradas.map(r => (
                  <tr key={r.viaje_id} className="hover:bg-gray-50 transition">
                    <td className="p-3">
                      <div className="font-semibold">{r.transportista}</div>
                      <div className="text-xs text-gray-500 font-mono">{r.viaje_id.slice(0, 8)}…</div>
                    </td>

                    <td className="p-3">{r.chofer_real}</td>
                    <td className="p-3">{r.destino}</td>
                    <td className="p-3">{r.unidad}</td>

                    <td className="p-3">
                      <div className="font-medium">{r.remito}</div>
                      {r.archivo_url ? (
                        <button
                          onClick={() => verArchivo(r.archivo_url!)}
                          className="text-xs text-blue-600 underline"
                        >
                          Ver archivo
                        </button>
                      ) : (
                        <div className="text-xs text-gray-400">Sin archivo</div>
                      )}
                    </td>

                    <td className="p-3 font-semibold">{money(r.a_pagar)}</td>

                    <td className="p-3">
                      <EstadoBadge estado={r.estado} />
                    </td>

                    <td className="p-3 text-right">
                      <div className="inline-flex gap-2">
                        <Link
                          href={`/admin/viajes/${r.viaje_id}`}
                          className="px-3 py-2 text-xs rounded-xl border bg-white hover:bg-gray-50 transition"
                        >
                          Ver viaje
                        </Link>

                        {r.estado === 'facturado' ? (
                          <button
                            onClick={() => marcarPagado(r.viaje_id)}
                            disabled={markingId === r.viaje_id}
                            className="px-3 py-2 text-xs rounded-xl bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 transition"
                          >
                            {markingId === r.viaje_id ? 'Marcando…' : 'Marcar pagado'}
                          </button>
                        ) : (
                          <span className="px-3 py-2 text-xs rounded-xl bg-green-50 text-green-700 ring-1 ring-green-200">
                            OK
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="mt-3 text-xs text-gray-500">
          Se muestran {filtradas.length} viaje(s) según filtros.
        </div>
      </div>
    </div>
  )
}
