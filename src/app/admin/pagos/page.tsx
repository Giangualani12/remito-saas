'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { motion } from 'framer-motion'
import {
  BadgeCheck,
  CreditCard,
  Download,
  Eye,
  RefreshCw,
  Search,
  Wallet,
  Calendar,
  Truck,
  ArrowRight
} from 'lucide-react'
import { useRouter } from 'next/navigation'

type EstadoViaje = 'pendiente' | 'aprobado' | 'facturado' | 'pagado' | 'rechazado'

type ViajeListado = {
  viaje_id: string
  estado: EstadoViaje
  origen: string | null
  destino: string | null
  tipo_unidad: string | null

  creado_en: string | null
  actualizado_en: string | null
  chofer_id: string

  cliente_id: string | null
  tarifa_id: string | null
  valor_cliente_snapshot: number | null
  valor_chofer_snapshot: number | null

  transportista_nombre: string | null
  transportista_email: string | null

  remito_id: string | null
  numero_remito: string | null
  fecha_viaje: string | null
  archivo_url: string | null // (path storage)
  remito_creado_en: string | null
}

type PagoRow = {
  id: string
  viaje_id: string
  transportista_id: string
  monto: number
  pagado_en: string
}

function fmtMoneyARS(value: number | null | undefined) {
  if (value === null || value === undefined) return '—'
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0
  }).format(value)
}

function fmtDate(value: string | null | undefined) {
  if (!value) return '—'
  const d = new Date(value)
  if (isNaN(d.getTime())) return value
  return d.toLocaleDateString('es-AR')
}

function safeCSV(value: any) {
  if (value === null || value === undefined) return ''
  const s = String(value)
  if (s.includes('"') || s.includes(',') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`
  return s
}

function buildCSV(headers: string[], rows: any[][]) {
  const lines = []
  lines.push(headers.map(safeCSV).join(','))
  for (const r of rows) lines.push(r.map(safeCSV).join(','))
  return lines.join('\n')
}

function downloadFile(filename: string, content: string, mime = 'text/csv;charset=utf-8;') {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

async function getSignedUrl(path: string, expiresInSec = 60 * 30) {
  const { data, error } = await supabase.storage.from('remitos').createSignedUrl(path, expiresInSec)
  if (error) throw error
  return data.signedUrl
}

function estadoChip(estado: EstadoViaje) {
  switch (estado) {
    case 'facturado':
      return 'bg-violet-50 text-violet-700 border-violet-200'
    case 'pagado':
      return 'bg-emerald-50 text-emerald-700 border-emerald-200'
    case 'pendiente':
      return 'bg-amber-50 text-amber-700 border-amber-200'
    case 'aprobado':
      return 'bg-blue-50 text-blue-700 border-blue-200'
    case 'rechazado':
      return 'bg-rose-50 text-rose-700 border-rose-200'
    default:
      return 'bg-gray-50 text-gray-700 border-gray-200'
  }
}

export default function AdminPagosPage() {
  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const [role, setRole] = useState<'admin' | 'finanzas' | 'chofer' | 'desconocido'>('desconocido')
  const canPay = role === 'admin' // finanzas ve, admin paga

  const [tab, setTab] = useState<'pendientes' | 'pagados'>('pendientes')

  const [qTransportista, setQTransportista] = useState('')
  const [qDestino, setQDestino] = useState('')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')

  const [rows, setRows] = useState<ViajeListado[]>([])
  const [pagos, setPagos] = useState<PagoRow[]>([])

  const pagosMap = useMemo(() => {
    const m = new Map<string, PagoRow>()
    pagos.forEach(p => m.set(p.viaje_id, p))
    return m
  }, [pagos])

  const pendientes = useMemo(() => rows.filter(r => r.estado === 'facturado'), [rows])
  const pagados = useMemo(() => rows.filter(r => r.estado === 'pagado'), [rows])

  const current = tab === 'pendientes' ? pendientes : pagados

  const currentFiltrado = useMemo(() => {
    return current.filter((r) => {
      const okT = qTransportista.trim()
        ? (r.transportista_nombre || '').toLowerCase().includes(qTransportista.trim().toLowerCase())
        : true

      const okD = qDestino.trim()
        ? (r.destino || '').toLowerCase().includes(qDestino.trim().toLowerCase())
        : true

      return okT && okD
    })
  }, [current, qTransportista, qDestino])

  const kpis = useMemo(() => {
    const totalPendiente = pendientes.reduce((acc, r) => acc + (r.valor_chofer_snapshot || 0), 0)
    const totalPagado = pagados.reduce((acc, r) => acc + (r.valor_chofer_snapshot || 0), 0)
    const totalViajesPend = pendientes.length
    const totalViajesPag = pagados.length
    return { totalPendiente, totalPagado, totalViajesPend, totalViajesPag }
  }, [pendientes, pagados])

  const loadRole = async () => {
    // intentamos primero current_user_role()
    try {
      const { data, error } = await supabase.rpc('current_user_role')
      if (!error && data) {
        setRole(data as any)
        return
      }
    } catch {}
    setRole('desconocido')
  }

  const loadData = async () => {
    setLoading(true)
    try {
      await loadRole()

      let query = supabase
        .from('viajes_listado')
        .select(
          `
          viaje_id, estado, origen, destino, tipo_unidad,
          creado_en, actualizado_en, chofer_id,
          cliente_id, tarifa_id, valor_cliente_snapshot, valor_chofer_snapshot,
          transportista_nombre, transportista_email,
          remito_id, numero_remito, fecha_viaje, archivo_url, remito_creado_en
        `
        )
        .in('estado', ['facturado', 'pagado'])
        .order('remito_creado_en', { ascending: false, nullsFirst: false })

      // filtros por fecha sobre remito_creado_en (carga)
      if (desde) query = query.gte('remito_creado_en', `${desde}T00:00:00`)
      if (hasta) query = query.lte('remito_creado_en', `${hasta}T23:59:59`)

      const { data, error } = await query
      if (error) throw error

      const lista = (data || []) as ViajeListado[]
      setRows(lista)

      // Traemos pagos reales para mostrar fecha pagado_en
      const { data: pagosData, error: pagosErr } = await supabase
        .from('pagos_transportistas')
        .select('id,viaje_id,transportista_id,monto,pagado_en')
        .order('pagado_en', { ascending: false })

      if (pagosErr) {
        // no frenamos la pantalla
        console.warn('No pude cargar pagos_transportistas:', pagosErr.message)
        setPagos([])
      } else {
        setPagos((pagosData || []) as PagoRow[])
      }
    } catch (e: any) {
      console.error(e)
      alert(e?.message || 'Error cargando pagos')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const verRemito = async (path: string | null) => {
    try {
      if (!path) return alert('Este viaje no tiene remito cargado.')
      setBusy(true)
      const url = await getSignedUrl(path, 60 * 30)
      window.open(url, '_blank')
    } catch (e: any) {
      alert(e?.message || 'No pude abrir el remito')
    } finally {
      setBusy(false)
    }
  }

  const marcarPagado = async (viajeId: string) => {
    if (!canPay) {
      alert('Solo ADMIN puede marcar pagos.')
      return
    }

    const ok = confirm('¿Confirmás marcar este viaje como PAGADO?')
    if (!ok) return

    try {
      setBusy(true)
      const { error } = await supabase.rpc('registrar_pago_transportista', {
        p_viaje_id: viajeId
      })
      if (error) throw error
      await loadData()
    } catch (e: any) {
      alert(e?.message || 'Error marcando pago')
    } finally {
      setBusy(false)
    }
  }

  const exportCSV = async () => {
    if (currentFiltrado.length === 0) return alert('No hay datos para exportar.')

    const headers = [
      'Estado',
      'Carga',
      'Fecha viaje',
      'Remito N°',
      'Destino',
      'Unidad',
      'Transportista',
      'Email',
      'Monto a pagar (ARS)',
      'Pagado en'
    ]

    const rowsCSV = currentFiltrado.map(r => {
      const pago = pagosMap.get(r.viaje_id)
      return [
        r.estado,
        fmtDate(r.remito_creado_en),
        fmtDate(r.fecha_viaje),
        r.numero_remito || '',
        r.destino || '',
        r.tipo_unidad || '',
        r.transportista_nombre || '',
        r.transportista_email || '',
        r.valor_chofer_snapshot ?? '',
        pago?.pagado_en ? fmtDate(pago.pagado_en) : ''
      ]
    })

    const csv = buildCSV(headers, rowsCSV)
    const today = new Date().toISOString().slice(0, 10)
    downloadFile(`pagos_${tab}_${today}.csv`, csv)
  }

  // Totales por transportista (para liquidación rápida)
  const resumenPorTransportista = useMemo(() => {
    const m = new Map<string, { nombre: string; email: string; viajes: number; total: number }>()
    currentFiltrado.forEach(r => {
      const key = r.chofer_id
      const prev = m.get(key) || {
        nombre: r.transportista_nombre || 'Sin nombre',
        email: r.transportista_email || '',
        viajes: 0,
        total: 0
      }
      prev.viajes += 1
      prev.total += (r.valor_chofer_snapshot || 0)
      m.set(key, prev)
    })
    return Array.from(m.values()).sort((a, b) => b.total - a.total)
  }, [currentFiltrado])

  const exportLiquidacion = async () => {
    if (resumenPorTransportista.length === 0) return alert('No hay datos para exportar.')

    const headers = ['Transportista', 'Email', 'Cantidad viajes', 'Total (ARS)', 'Tipo']
    const rowsCSV = resumenPorTransportista.map(x => [x.nombre, x.email, x.viajes, x.total, tab])

    const csv = buildCSV(headers, rowsCSV)
    const today = new Date().toISOString().slice(0, 10)
    downloadFile(`liquidacion_${tab}_${today}.csv`, csv)
  }

  return (
    <div className="p-6 space-y-6">
      {/* HEADER */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="rounded-2xl border bg-white shadow-sm p-5"
      >
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <Wallet className="w-5 h-5 text-emerald-600" />
              <h1 className="text-2xl font-bold tracking-tight">Pagos</h1>
            </div>
            <p className="text-sm text-gray-600 mt-1">
              Control de <b>pendientes</b> y <b>pagados</b>. Export simple a Excel (CSV).
            </p>
            <p className="text-xs text-gray-500 mt-1">
              Rol: <b>{role}</b> {canPay ? '✅ puede pagar' : '👁️ solo lectura'}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={loadData}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 hover:bg-gray-50 transition disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${busy ? 'animate-spin' : ''}`} />
              {busy ? 'Actualizando…' : 'Actualizar'}
            </button>

            <button
              onClick={exportCSV}
              disabled={busy || loading || currentFiltrado.length === 0}
              className="inline-flex items-center gap-2 rounded-xl bg-gray-900 px-4 py-2 text-white font-semibold hover:bg-black transition disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              Export pagos
            </button>

            <button
              onClick={exportLiquidacion}
              disabled={busy || loading || resumenPorTransportista.length === 0}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-white font-semibold hover:bg-emerald-700 transition disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              Export liquidación
            </button>
          </div>
        </div>
      </motion.div>

      {/* KPIs */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, delay: 0.05 }}
        className="grid gap-4 md:grid-cols-4"
      >
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">Pendientes</span>
            <CreditCard className="w-4 h-4 text-gray-400" />
          </div>
          <div className="mt-2 text-2xl font-bold">{kpis.totalViajesPend}</div>
          <div className="text-xs text-gray-500 mt-1">Viajes facturados</div>
        </div>

        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">Total pendiente</span>
            <Wallet className="w-4 h-4 text-gray-400" />
          </div>
          <div className="mt-2 text-2xl font-bold">{fmtMoneyARS(kpis.totalPendiente)}</div>
          <div className="text-xs text-gray-500 mt-1">A pagar</div>
        </div>

        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">Pagados</span>
            <BadgeCheck className="w-4 h-4 text-gray-400" />
          </div>
          <div className="mt-2 text-2xl font-bold">{kpis.totalViajesPag}</div>
          <div className="text-xs text-gray-500 mt-1">Viajes pagados</div>
        </div>

        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">Total pagado</span>
            <BadgeCheck className="w-4 h-4 text-gray-400" />
          </div>
          <div className="mt-2 text-2xl font-bold">{fmtMoneyARS(kpis.totalPagado)}</div>
          <div className="text-xs text-gray-500 mt-1">Histórico</div>
        </div>
      </motion.div>

      {/* Tabs + filtros */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, delay: 0.08 }}
        className="rounded-2xl border bg-white shadow-sm p-5 space-y-4"
      >
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setTab('pendientes')}
              className={`rounded-xl px-4 py-2 text-sm font-semibold border transition ${
                tab === 'pendientes' ? 'bg-violet-600 text-white border-violet-600' : 'hover:bg-gray-50'
              }`}
            >
              Pendientes (Facturados)
            </button>
            <button
              onClick={() => setTab('pagados')}
              className={`rounded-xl px-4 py-2 text-sm font-semibold border transition ${
                tab === 'pagados' ? 'bg-emerald-600 text-white border-emerald-600' : 'hover:bg-gray-50'
              }`}
            >
              Pagados
            </button>
          </div>

          <div className="text-xs text-gray-500">
            Mostrando: <b>{currentFiltrado.length}</b> registros
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-4">
          <div className="relative">
            <label className="text-xs text-gray-500">Buscar transportista</label>
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 mt-3" />
            <input
              className="mt-1 w-full rounded-xl border pl-9 pr-3 py-2 text-sm"
              placeholder="Ej: Juan..."
              value={qTransportista}
              onChange={(e) => setQTransportista(e.target.value)}
            />
          </div>

          <div>
            <label className="text-xs text-gray-500">Destino</label>
            <input
              className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
              placeholder="Ej: Rosario..."
              value={qDestino}
              onChange={(e) => setQDestino(e.target.value)}
            />
          </div>

          <div>
            <label className="text-xs text-gray-500">Desde (carga)</label>
            <div className="relative">
              <Calendar className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 mt-3" />
              <input
                type="date"
                className="mt-1 w-full rounded-xl border pl-9 pr-3 py-2 text-sm"
                value={desde}
                onChange={(e) => setDesde(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-500">Hasta (carga)</label>
            <div className="relative">
              <Calendar className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2 mt-3" />
              <input
                type="date"
                className="mt-1 w-full rounded-xl border pl-9 pr-3 py-2 text-sm"
                value={hasta}
                onChange={(e) => setHasta(e.target.value)}
              />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadData}
            disabled={busy}
            className="rounded-xl border px-4 py-2 hover:bg-gray-50 transition disabled:opacity-50"
          >
            Aplicar fechas
          </button>
          <button
            onClick={() => {
              setDesde('')
              setHasta('')
              setTimeout(() => loadData(), 0)
            }}
            disabled={busy}
            className="rounded-xl border px-4 py-2 hover:bg-gray-50 transition disabled:opacity-50"
          >
            Limpiar fechas
          </button>
        </div>
      </motion.div>

      {/* TABLE */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, delay: 0.1 }}
        className="rounded-2xl border bg-white shadow-sm overflow-hidden"
      >
        <div className="p-4 border-b bg-gray-50">
          <p className="font-semibold">Listado</p>
          <p className="text-xs text-gray-600">
            {tab === 'pendientes'
              ? 'Estos viajes están FACTURADOS y listos para pagar.'
              : 'Estos viajes ya fueron marcados como PAGADOS.'}
          </p>
        </div>

        {loading ? (
          <div className="p-5 text-sm">Cargando…</div>
        ) : currentFiltrado.length === 0 ? (
          <div className="p-5 text-sm text-gray-600">No hay registros con estos filtros.</div>
        ) : (
          <div className="overflow-auto">
            <table className="min-w-[1200px] w-full text-sm">
              <thead className="sticky top-0 bg-white border-b">
                <tr className="text-left">
                  <th className="p-3">Estado</th>
                  <th className="p-3">Transportista</th>
                  <th className="p-3">Destino</th>
                  <th className="p-3">Unidad</th>
                  <th className="p-3">Remito</th>
                  <th className="p-3">Carga</th>
                  <th className="p-3 text-right">Monto</th>
                  <th className="p-3">Pagado</th>
                  <th className="p-3 text-right">Acciones</th>
                </tr>
              </thead>

              <tbody>
                {currentFiltrado.map((r) => {
                  const pago = pagosMap.get(r.viaje_id)

                  return (
                    <tr key={r.viaje_id} className="border-b last:border-b-0 hover:bg-gray-50 transition">
                      <td className="p-3">
                        <span className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${estadoChip(r.estado)}`}>
                          {r.estado}
                        </span>
                      </td>

                      <td className="p-3">
                        <div className="font-semibold">{r.transportista_nombre || '—'}</div>
                        <div className="text-xs text-gray-500">{r.transportista_email || ''}</div>
                      </td>

                      <td className="p-3">{r.destino || '—'}</td>

                      <td className="p-3">
                        <span className="inline-flex items-center gap-2">
                          <Truck className="w-4 h-4 text-gray-400" />
                          {r.tipo_unidad || '—'}
                        </span>
                      </td>

                      <td className="p-3">
                        <div className="font-semibold">{r.numero_remito || '—'}</div>
                        <div className="text-xs text-gray-500">Viaje: {fmtDate(r.fecha_viaje)}</div>
                      </td>

                      <td className="p-3">{fmtDate(r.remito_creado_en)}</td>

                      <td className="p-3 text-right font-semibold">{fmtMoneyARS(r.valor_chofer_snapshot)}</td>

                      <td className="p-3">
                        {pago?.pagado_en ? (
                          <span className="text-emerald-700 font-semibold">{fmtDate(pago.pagado_en)}</span>
                        ) : (
                          <span className="text-gray-400">—</span>
                        )}
                      </td>

                      <td className="p-3">
                        <div className="flex items-center justify-end gap-2">
                          <button
                            onClick={() => verRemito(r.archivo_url)}
                            disabled={busy}
                            className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 hover:bg-gray-50 transition disabled:opacity-50"
                          >
                            <Eye className="w-4 h-4" />
                            Ver remito
                          </button>

                          <button
                            onClick={() => router.push(`/admin/viajes/${r.viaje_id}`)}
                            className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 hover:bg-gray-50 transition"
                          >
                            <ArrowRight className="w-4 h-4" />
                            Detalle
                          </button>

                          {tab === 'pendientes' && (
                            <button
                              onClick={() => marcarPagado(r.viaje_id)}
                              disabled={busy || !canPay}
                              className="inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-3 py-2 text-white font-semibold hover:bg-emerald-700 transition disabled:opacity-50"
                            >
                              <BadgeCheck className="w-4 h-4" />
                              Pagar
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>

      {/* RESUMEN LIQUIDACIÓN */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, delay: 0.12 }}
        className="rounded-2xl border bg-white shadow-sm p-5"
      >
        <div className="flex items-center justify-between">
          <div>
            <p className="text-lg font-semibold">Resumen por transportista</p>
            <p className="text-xs text-gray-600">Ideal para liquidar rápido.</p>
          </div>
          <button
            onClick={exportLiquidacion}
            disabled={busy || resumenPorTransportista.length === 0}
            className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 hover:bg-gray-50 transition disabled:opacity-50"
          >
            <Download className="w-4 h-4" />
            Export liquidación
          </button>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {resumenPorTransportista.slice(0, 9).map((x) => (
            <div key={x.email + x.nombre} className="rounded-2xl border bg-gray-50 p-4">
              <div className="font-semibold">{x.nombre}</div>
              <div className="text-xs text-gray-500">{x.email}</div>
              <div className="mt-3 flex items-center justify-between text-sm">
                <span>Viajes</span>
                <b>{x.viajes}</b>
              </div>
              <div className="mt-1 flex items-center justify-between text-sm">
                <span>Total</span>
                <b>{fmtMoneyARS(x.total)}</b>
              </div>
            </div>
          ))}
        </div>

        {resumenPorTransportista.length > 9 && (
          <div className="mt-3 text-xs text-gray-500">
            Mostrando top 9. El export trae todo.
          </div>
        )}
      </motion.div>
    </div>
  )
}
