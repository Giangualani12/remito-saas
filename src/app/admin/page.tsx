'use client'

import Link from 'next/link'
import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useRouter } from 'next/navigation'

type Totales = {
  totalViajes: number
  pendiente: number
  aprobado: number
  facturado: number
  pagado: number
  rechazado: number
  totalFacturado: number
  totalChoferes: number
}

type Notificacion = {
  id: string
  creado_en: string
  tipo: string | null
  titulo: string | null
  mensaje: string | null
  viaje_id: string | null
  leido: boolean | null
}

export default function AdminDashboardPage() {
  const router = useRouter()

  const [data, setData] = useState<Totales | null>(null)
  const [loading, setLoading] = useState(true)

  const [notis, setNotis] = useState<Notificacion[]>([])
  const [loadingNotis, setLoadingNotis] = useState(true)

  const loadDashboard = async () => {
    setLoading(true)

    const { data: viajes, error } = await supabase
      .from('viajes')
      .select('estado, valor_cliente_snapshot, valor_chofer_snapshot')

    if (error) {
      console.log('dashboard viajes error:', error.message)
      setLoading(false)
      return
    }

    const v = viajes ?? []

    const totales: Totales = {
      totalViajes: v.length,
      pendiente: v.filter(x => x.estado === 'pendiente').length,
      aprobado: v.filter(x => x.estado === 'aprobado').length,
      facturado: v.filter(x => x.estado === 'facturado').length,
      pagado: v.filter(x => x.estado === 'pagado').length,
      rechazado: v.filter(x => x.estado === 'rechazado').length,
      totalFacturado: v
        .filter(x => x.estado === 'facturado' || x.estado === 'pagado')
        .reduce((acc, x) => acc + (x.valor_cliente_snapshot ?? 0), 0),
      totalChoferes: v
        .filter(x => x.estado === 'facturado' || x.estado === 'pagado')
        .reduce((acc, x) => acc + (x.valor_chofer_snapshot ?? 0), 0),
    }

    setData(totales)
    setLoading(false)
  }

  const loadNotificaciones = async () => {
    setLoadingNotis(true)

    const { data, error } = await supabase
      .from('notificaciones')
      .select('id, creado_en, tipo, titulo, mensaje, viaje_id, leido')
      .order('creado_en', { ascending: false })
      .limit(8)

    if (error) {
      console.log('notificaciones error:', error.message)
      setNotis([])
      setLoadingNotis(false)
      return
    }

    setNotis((data ?? []) as Notificacion[])
    setLoadingNotis(false)
  }

  const actualizarTodo = async () => {
    await Promise.all([loadDashboard(), loadNotificaciones()])
  }

  // opcional: marcar como leída
  const marcarLeida = async (id: string) => {
    setNotis(prev => prev.map(n => (n.id === id ? { ...n, leido: true } : n)))

    const { error } = await supabase
      .from('notificaciones')
      .update({ leido: true })
      .eq('id', id)

    if (error) {
      console.log('marcar leida error:', error.message)
    }
  }

  useEffect(() => {
    actualizarTodo()

    // refresh liviano (para que “aparezcan” cosas sin recargar)
    const t = setInterval(() => {
      loadDashboard()
      loadNotificaciones()
    }, 12000)

    return () => clearInterval(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const ganancia = useMemo(() => {
    if (!data) return 0
    return data.totalFacturado - data.totalChoferes
  }, [data])

  const notisNoLeidas = useMemo(
    () => notis.filter(n => !n.leido).length,
    [notis]
  )

  if (loading || !data) {
    return <div className="p-6 text-sm text-gray-600">Cargando dashboard…</div>
  }

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dashboard</h1>
          <p className="text-sm text-gray-500">
            Resumen rápido de viajes, facturación y pendientes.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={actualizarTodo}
            className="px-4 py-2 rounded-lg text-sm border border-gray-200 bg-white hover:bg-gray-50 transition active:scale-[0.99]"
          >
            Actualizar
          </button>
          <button
            onClick={() => router.push('/admin/viajes')}
            className="px-4 py-2 rounded-lg text-sm bg-blue-600 text-white hover:bg-blue-700 transition active:scale-[0.99]"
          >
            Ver viajes
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Kpi title="Viajes" value={data.totalViajes} />
        <Kpi title="Total facturado" value={`$${data.totalFacturado.toLocaleString()}`} />
        <Kpi title="A pagar choferes" value={`$${data.totalChoferes.toLocaleString()}`} />
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
          <p className="text-sm text-emerald-700">Ganancia</p>
          <p className="text-2xl font-bold text-emerald-800">
            ${ganancia.toLocaleString()}
          </p>
        </div>
      </div>

      {/* Alerta */}
      {data.pendiente > 0 && (
        <div className="flex items-center gap-2 rounded-xl border border-yellow-200 bg-yellow-50 text-yellow-900 p-4 shadow-sm">
          <span className="text-lg">⚠️</span>
          <div className="text-sm">
            Tenés <b>{data.pendiente}</b> viaje(s) pendiente(s). Asigná cliente y tarifa para poder facturarlos.
          </div>
          <button
            onClick={() => router.push('/admin/viajes')}
            className="ml-auto px-3 py-2 rounded-lg text-sm border border-yellow-200 bg-white hover:bg-yellow-100 transition"
          >
            Ir
          </button>
        </div>
      )}

      {/* Estados + Notificaciones */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Estados */}
        <div className="lg:col-span-2 bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Estados de viajes</h2>
            <div className="text-xs text-gray-500">Total: {data.totalViajes}</div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 mt-3">
            <EstadoCard
              label="Pendiente"
              value={data.pendiente}
              className="bg-yellow-50 border-yellow-200 text-yellow-900"
            />
            <EstadoCard label="Aprobado" value={data.aprobado} />
            <EstadoCard label="Facturado" value={data.facturado} />
            <EstadoCard label="Pagado" value={data.pagado} />
            <EstadoCard label="Rechazado" value={data.rechazado} />
          </div>

          <div className="flex gap-2 flex-wrap mt-4">
            <button
              onClick={() => router.push('/admin/viajes')}
              className="px-4 py-2 rounded-lg text-sm border border-gray-200 hover:bg-gray-50 transition active:scale-[0.99]"
            >
              Ver viajes
            </button>

            <button
              onClick={() => router.push('/admin/pagos')}
              className="px-4 py-2 rounded-lg text-sm border border-gray-200 hover:bg-gray-50 transition active:scale-[0.99]"
            >
              Pagos
            </button>

            <button
              onClick={() => router.push('/admin/clientes')}
              className="px-4 py-2 rounded-lg text-sm border border-gray-200 hover:bg-gray-50 transition active:scale-[0.99]"
            >
              Crear cliente
            </button>

            <button
              onClick={() => router.push('/admin/tarifas')}
              className="px-4 py-2 rounded-lg text-sm border border-gray-200 hover:bg-gray-50 transition active:scale-[0.99]"
            >
              Crear tarifa
            </button>
          </div>
        </div>

        {/* Notificaciones */}
        <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">Notificaciones</h2>
            <div className="text-xs text-gray-500">
              {notisNoLeidas > 0 ? (
                <span className="inline-flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
                  {notisNoLeidas} nueva(s)
                </span>
              ) : (
                'Al día'
              )}
            </div>
          </div>

          {loadingNotis ? (
            <div className="mt-3 text-sm text-gray-500">Cargando…</div>
          ) : notis.length === 0 ? (
            <div className="mt-3 text-sm text-gray-500">No hay notificaciones todavía.</div>
          ) : (
            <div className="mt-3 space-y-2">
              {notis.map(n => (
                <div
                  key={n.id}
                  className={`rounded-xl border p-3 transition hover:shadow-sm hover:bg-gray-50 ${
                    n.leido ? 'border-gray-200' : 'border-blue-200 bg-blue-50/40'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate">
                        {n.titulo ?? 'Notificación'}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {new Date(n.creado_en).toLocaleString()}
                      </div>
                    </div>

                    {!n.leido && (
                      <button
                        onClick={() => marcarLeida(n.id)}
                        className="text-xs px-2 py-1 rounded-md border border-blue-200 bg-white hover:bg-blue-50 transition"
                      >
                        Marcar
                      </button>
                    )}
                  </div>

                  {n.mensaje && (
                    <div className="text-sm text-gray-600 mt-2">{n.mensaje}</div>
                  )}

                  {n.viaje_id && (
                    <Link
                      href={`/admin/viajes/${n.viaje_id}`}
                      className="text-sm text-blue-600 hover:underline mt-2 inline-block"
                    >
                      Abrir viaje
                    </Link>
                  )}
                </div>
              ))}
            </div>
          )}

          <button
            onClick={loadNotificaciones}
            className="mt-3 w-full px-3 py-2 rounded-lg text-sm border border-gray-200 hover:bg-gray-50 transition active:scale-[0.99]"
          >
            Actualizar notificaciones
          </button>
        </div>
      </div>
    </div>
  )
}

/* ================= COMPONENTES ================= */

function Kpi({ title, value }: { title: string; value: number | string }) {
  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 shadow-sm hover:shadow transition">
      <p className="text-sm text-gray-600">{title}</p>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  )
}

function EstadoCard({
  label,
  value,
  className,
}: {
  label: string
  value: number
  className?: string
}) {
  return (
    <div
      className={`rounded-xl border p-4 shadow-sm hover:shadow transition ${
        className ?? 'bg-gray-50 border-gray-200 text-gray-700'
      }`}
    >
      <p className="text-sm">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  )
}
