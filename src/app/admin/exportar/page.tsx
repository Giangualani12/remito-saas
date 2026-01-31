'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { motion } from 'framer-motion'
import {
  Download,
  RefreshCw,
  Filter,
  FileSpreadsheet,
  FileText,
  Users,
  Building2,
  Truck,
  Calendar,
  Search
} from 'lucide-react'

type EstadoViaje = 'pendiente' | 'aprobado' | 'facturado' | 'pagado' | 'rechazado'
const ESTADOS: Array<'todos' | EstadoViaje> = ['todos', 'pendiente', 'aprobado', 'facturado', 'pagado', 'rechazado']

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
  archivo_url: string | null
  remito_creado_en: string | null
}

type Cliente = { id: string; nombre: string }

function fmtMoneyARS(value: number | null | undefined) {
  if (value === null || value === undefined) return ''
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0
  }).format(value)
}

function fmtDate(value: string | null | undefined) {
  if (!value) return ''
  const d = new Date(value)
  if (isNaN(d.getTime())) return value
  return d.toLocaleDateString('es-AR')
}

async function downloadFromAPI(payload: any) {
  const res = await fetch('/api/admin/exportar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  })

  if (!res.ok) {
    const err = await res.json().catch(() => ({}))
    alert(err?.error ?? 'Error exportando')
    return
  }

  const blob = await res.blob()

  const cd = res.headers.get('content-disposition') || ''
  const match = cd.match(/filename="(.+?)"/)
  const filename = match?.[1] ?? 'export.csv'

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

export default function AdminExportarPage() {
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const [clientes, setClientes] = useState<Cliente[]>([])
  const clientesMap = useMemo(() => {
    const m = new Map<string, string>()
    clientes.forEach(c => m.set(c.id, c.nombre))
    return m
  }, [clientes])

  const [rows, setRows] = useState<ViajeListado[]>([])
  const total = rows.length

  // Filtros
  const [estado, setEstado] = useState<(typeof ESTADOS)[number]>('todos')
  const [tipoUnidad, setTipoUnidad] = useState<string>('todos')
  const [clienteId, setClienteId] = useState<string>('todos')
  const [qTransportista, setQTransportista] = useState('')
  const [qDestino, setQDestino] = useState('')
  const [qRemito, setQRemito] = useState('')

  // Fechas
  const [modoFecha, setModoFecha] = useState<'fecha_viaje' | 'remito_creado_en'>('remito_creado_en')
  const [desde, setDesde] = useState<string>('') // YYYY-MM-DD
  const [hasta, setHasta] = useState<string>('') // YYYY-MM-DD

  // export config
  const [tipoExport, setTipoExport] = useState<'general' | 'liquidacion' | 'facturacion'>('general')
  const [incluirLinkFirmado, setIncluirLinkFirmado] = useState(true)

  // Preview paging
  const [page, setPage] = useState(1)
  const pageSize = 30
  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize))
  const pageRows = useMemo(() => {
    const start = (page - 1) * pageSize
    return rows.slice(start, start + pageSize)
  }, [rows, page])

  const loadClientes = async () => {
    const { data, error } = await supabase.from('clientes').select('id,nombre').order('nombre', { ascending: true })
    if (error) throw error
    setClientes((data || []) as Cliente[])
  }

  const loadViajes = async () => {
    setLoading(true)

    let query = supabase
      .from('viajes_listado')
      .select(
        `
        viaje_id,
        estado,
        origen,
        destino,
        tipo_unidad,
        creado_en,
        actualizado_en,
        chofer_id,
        cliente_id,
        tarifa_id,
        valor_cliente_snapshot,
        valor_chofer_snapshot,
        transportista_nombre,
        transportista_email,
        remito_id,
        numero_remito,
        fecha_viaje,
        archivo_url,
        remito_creado_en
      `
      )
      .order('remito_creado_en', { ascending: false, nullsFirst: false })
      .order('creado_en', { ascending: false, nullsFirst: false })

    if (estado !== 'todos') query = query.eq('estado', estado)
    if (tipoUnidad !== 'todos') query = query.eq('tipo_unidad', tipoUnidad)
    if (clienteId !== 'todos') query = query.eq('cliente_id', clienteId)

    if (qTransportista.trim()) query = query.ilike('transportista_nombre', `%${qTransportista.trim()}%`)
    if (qDestino.trim()) query = query.ilike('destino', `%${qDestino.trim()}%`)
    if (qRemito.trim()) query = query.ilike('numero_remito', `%${qRemito.trim()}%`)

    if (desde) {
      if (modoFecha === 'fecha_viaje') query = query.gte('fecha_viaje', desde)
      else query = query.gte('remito_creado_en', `${desde}T00:00:00`)
    }
    if (hasta) {
      if (modoFecha === 'fecha_viaje') query = query.lte('fecha_viaje', hasta)
      else query = query.lte('remito_creado_en', `${hasta}T23:59:59`)
    }

    const { data, error } = await query

    if (error) {
      console.error(error)
      alert(error.message)
      setRows([])
      setLoading(false)
      return
    }

    setRows((data || []) as ViajeListado[])
    setPage(1)
    setLoading(false)
  }

  const cargarTodo = async () => {
    try {
      setBusy(true)
      await Promise.all([loadClientes(), loadViajes()])
    } catch (e: any) {
      console.error(e)
      alert(e?.message || 'Error cargando datos')
    } finally {
      setBusy(false)
    }
  }

  useEffect(() => {
    cargarTodo()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const unidadesDisponibles = useMemo(() => {
    const set = new Set<string>()
    rows.forEach(r => {
      if (r.tipo_unidad) set.add(r.tipo_unidad)
    })
    return Array.from(set).sort((a, b) => a.localeCompare(b))
  }, [rows])

  const resumenKPIs = useMemo(() => {
    const facturado = rows.reduce((acc, r) => acc + (r.valor_cliente_snapshot || 0), 0)
    const aPagar = rows.reduce((acc, r) => acc + (r.valor_chofer_snapshot || 0), 0)
    const margen = facturado - aPagar
    return { facturado, aPagar, margen }
  }, [rows])

  const limpiarFiltros = () => {
    setEstado('todos')
    setTipoUnidad('todos')
    setClienteId('todos')
    setQTransportista('')
    setQDestino('')
    setQRemito('')
    setModoFecha('remito_creado_en')
    setDesde('')
    setHasta('')
  }

  // ✅ EXPORTA VIA API (server arma CSV y lo baja)
  const exportar = async () => {
    if (rows.length === 0) return alert('No hay datos para exportar con estos filtros.')

    setBusy(true)
    try {
      await downloadFromAPI({
        tipoExport,
        incluirLinkFirmado,

        estado,
        tipoUnidad,
        clienteId,
        qTransportista,
        qDestino,
        qRemito,

        modoFecha,
        desde,
        hasta,

        maxSigned: 500
      })
    } finally {
      setBusy(false)
    }
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
              <FileSpreadsheet className="w-5 h-5 text-blue-600" />
              <h1 className="text-2xl font-bold tracking-tight">Exportar</h1>
            </div>
            <p className="text-sm text-gray-600 mt-1">
              Filtrá viajes y exportá a <b>CSV</b> (Excel compatible) desde el servidor.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={cargarTodo}
              disabled={busy}
              className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 hover:bg-gray-50 transition disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${busy ? 'animate-spin' : ''}`} />
              {busy ? 'Actualizando…' : 'Actualizar'}
            </button>

            <button
              onClick={exportar}
              disabled={busy || loading || rows.length === 0}
              className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2 text-white font-semibold hover:bg-blue-700 transition disabled:opacity-50"
            >
              <Download className="w-4 h-4" />
              Exportar CSV
            </button>
          </div>
        </div>
      </motion.div>

      {/* KPIs */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, delay: 0.05 }}
        className="grid gap-4 md:grid-cols-3"
      >
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">Total viajes</span>
            <Truck className="w-4 h-4 text-gray-400" />
          </div>
          <div className="mt-2 text-2xl font-bold">{total}</div>
        </div>

        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">Facturado</span>
            <Building2 className="w-4 h-4 text-gray-400" />
          </div>
          <div className="mt-2 text-2xl font-bold">{fmtMoneyARS(resumenKPIs.facturado)}</div>
        </div>

        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-500">Margen</span>
            <Users className="w-4 h-4 text-gray-400" />
          </div>
          <div className="mt-2 text-2xl font-bold">{fmtMoneyARS(resumenKPIs.margen)}</div>
        </div>
      </motion.div>

      {/* FILTROS */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, delay: 0.08 }}
        className="rounded-2xl border bg-white shadow-sm p-5 space-y-4"
      >
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-500" />
          <h2 className="text-lg font-semibold">Filtros</h2>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div>
            <label className="text-xs text-gray-500">Estado</label>
            <select
              className="mt-1 w-full rounded-xl border px-3 py-2 text-sm bg-white"
              value={estado}
              onChange={(e) => setEstado(e.target.value as any)}
            >
              {ESTADOS.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-gray-500">Tipo unidad</label>
            <select
              className="mt-1 w-full rounded-xl border px-3 py-2 text-sm bg-white"
              value={tipoUnidad}
              onChange={(e) => setTipoUnidad(e.target.value)}
            >
              <option value="todos">todos</option>
              {unidadesDisponibles.map(u => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-xs text-gray-500">Cliente</label>
            <select
              className="mt-1 w-full rounded-xl border px-3 py-2 text-sm bg-white"
              value={clienteId}
              onChange={(e) => setClienteId(e.target.value)}
            >
              <option value="todos">todos</option>
              {clientes.map(c => (
                <option key={c.id} value={c.id}>{c.nombre}</option>
              ))}
            </select>
          </div>
        </div>

        <div className="grid gap-3 md:grid-cols-3">
          <div className="relative">
            <label className="text-xs text-gray-500">Buscar transportista</label>
            <div className="relative">
              <Search className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                className="mt-1 w-full rounded-xl border pl-9 pr-3 py-2 text-sm"
                placeholder="Ej: Juan..."
                value={qTransportista}
                onChange={(e) => setQTransportista(e.target.value)}
              />
            </div>
          </div>

          <div className="relative">
            <label className="text-xs text-gray-500">Buscar destino</label>
            <input
              className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
              placeholder="Ej: Rosario..."
              value={qDestino}
              onChange={(e) => setQDestino(e.target.value)}
            />
          </div>

          <div className="relative">
            <label className="text-xs text-gray-500">Buscar N° remito</label>
            <input
              className="mt-1 w-full rounded-xl border px-3 py-2 text-sm"
              placeholder="Ej: 1234..."
              value={qRemito}
              onChange={(e) => setQRemito(e.target.value)}
            />
          </div>
        </div>

        {/* Fechas */}
        <div className="grid gap-3 md:grid-cols-4">
          <div>
            <label className="text-xs text-gray-500">Filtrar por</label>
            <select
              className="mt-1 w-full rounded-xl border px-3 py-2 text-sm bg-white"
              value={modoFecha}
              onChange={(e) => setModoFecha(e.target.value as any)}
            >
              <option value="remito_creado_en">fecha de carga</option>
              <option value="fecha_viaje">fecha del viaje</option>
            </select>
          </div>

          <div>
            <label className="text-xs text-gray-500">Desde</label>
            <div className="relative">
              <Calendar className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="date"
                className="mt-1 w-full rounded-xl border pl-9 pr-3 py-2 text-sm"
                value={desde}
                onChange={(e) => setDesde(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-500">Hasta</label>
            <div className="relative">
              <Calendar className="w-4 h-4 text-gray-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="date"
                className="mt-1 w-full rounded-xl border pl-9 pr-3 py-2 text-sm"
                value={hasta}
                onChange={(e) => setHasta(e.target.value)}
              />
            </div>
          </div>

          <div className="flex items-end gap-2">
            <button
              onClick={loadViajes}
              disabled={busy}
              className="w-full rounded-xl border px-4 py-2 hover:bg-gray-50 transition disabled:opacity-50"
            >
              Aplicar
            </button>
            <button
              onClick={() => {
                limpiarFiltros()
                setTimeout(() => loadViajes(), 0)
              }}
              disabled={busy}
              className="w-full rounded-xl border px-4 py-2 hover:bg-gray-50 transition disabled:opacity-50"
            >
              Limpiar
            </button>
          </div>
        </div>

        {/* Tipo export */}
        <div className="rounded-2xl border bg-gray-50 p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-2">
              <FileText className="w-4 h-4 text-gray-500" />
              <div>
                <p className="text-sm font-semibold">Tipo de exportación</p>
                <p className="text-xs text-gray-600">Elegí qué querés descargar.</p>
              </div>
            </div>

            <div className="flex flex-col gap-2 md:flex-row md:items-center">
              <select
                className="rounded-xl border px-3 py-2 text-sm bg-white"
                value={tipoExport}
                onChange={(e) => setTipoExport(e.target.value as any)}
              >
                <option value="general">General (viajes)</option>
                <option value="liquidacion">Liquidación (transportistas)</option>
                <option value="facturacion">Facturación (clientes)</option>
              </select>

              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={incluirLinkFirmado}
                  onChange={(e) => setIncluirLinkFirmado(e.target.checked)}
                  className="rounded"
                />
                Incluir link remito (firmado)
              </label>
            </div>
          </div>

          <div className="mt-3 text-xs text-gray-600">
            ✅ Link firmado evita <b>404</b>. Expira en ~30 min.
          </div>
        </div>
      </motion.div>

      {/* PREVIEW TABLA */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, delay: 0.1 }}
        className="rounded-2xl border bg-white shadow-sm overflow-hidden"
      >
        <div className="p-4 flex flex-col gap-2 md:flex-row md:items-center md:justify-between border-b bg-gray-50">
          <div>
            <p className="font-semibold">Preview</p>
            <p className="text-xs text-gray-600">
              Mostrando {Math.min(pageSize, pageRows.length)} de {total} (página {page}/{pageCount})
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="rounded-xl border px-3 py-2 text-sm hover:bg-white disabled:opacity-50"
            >
              ←
            </button>
            <button
              onClick={() => setPage(p => Math.min(pageCount, p + 1))}
              disabled={page >= pageCount}
              className="rounded-xl border px-3 py-2 text-sm hover:bg-white disabled:opacity-50"
            >
              →
            </button>
          </div>
        </div>

        {loading ? (
          <div className="p-5 text-sm">Cargando…</div>
        ) : total === 0 ? (
          <div className="p-5 text-sm text-gray-600">No hay viajes para estos filtros.</div>
        ) : (
          <div className="overflow-auto">
            <table className="min-w-[1100px] w-full text-sm">
              <thead className="sticky top-0 bg-white border-b">
                <tr className="text-left">
                  <th className="p-3">Carga</th>
                  <th className="p-3">Fecha viaje</th>
                  <th className="p-3">Remito</th>
                  <th className="p-3">Destino</th>
                  <th className="p-3">Unidad</th>
                  <th className="p-3">Transportista</th>
                  <th className="p-3">Estado</th>
                  <th className="p-3 text-right">Cliente</th>
                  <th className="p-3 text-right">Monto Cliente</th>
                  <th className="p-3 text-right">Monto Chofer</th>
                  <th className="p-3 text-right">Margen</th>
                </tr>
              </thead>

              <tbody>
                {pageRows.map((r) => {
                  const margen = (r.valor_cliente_snapshot ?? 0) - (r.valor_chofer_snapshot ?? 0)
                  const clienteNombre = r.cliente_id ? (clientesMap.get(r.cliente_id) || '—') : '—'

                  return (
                    <tr key={r.viaje_id} className="border-b last:border-b-0 hover:bg-gray-50 transition">
                      <td className="p-3">{fmtDate(r.remito_creado_en)}</td>
                      <td className="p-3">{fmtDate(r.fecha_viaje) || '—'}</td>
                      <td className="p-3 font-medium">{r.numero_remito || '—'}</td>
                      <td className="p-3">{r.destino || '—'}</td>
                      <td className="p-3">{r.tipo_unidad || '—'}</td>
                      <td className="p-3">{r.transportista_nombre || '—'}</td>
                      <td className="p-3">{r.estado}</td>
                      <td className="p-3 text-right">{clienteNombre}</td>
                      <td className="p-3 text-right">{fmtMoneyARS(r.valor_cliente_snapshot)}</td>
                      <td className="p-3 text-right">{fmtMoneyARS(r.valor_chofer_snapshot)}</td>
                      <td className="p-3 text-right">{fmtMoneyARS(margen)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </motion.div>
    </div>
  )
}
