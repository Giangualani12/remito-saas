'use client'

import { useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  LineChart,
  Line,
  Legend,
} from 'recharts'
import { Download, RefreshCw, TrendingUp, AlertCircle } from 'lucide-react'

type ReporteCliente = {
  cliente: string
  viajes: number
  facturado: number
  pagado: number
  ganancia: number
}

type ReporteTransportista = {
  chofer: string // lo llamamos transportista en UI
  viajes: number
  facturado: number
  pagado: number
  deuda: number
}

type Proyecciones = {
  mes: string
  dias_del_mes: number
  dias_transcurridos: number
  es_mes_actual: boolean

  facturado_actual: number
  pagado_actual: number
  ganancia_actual: number

  facturado_promedio_diario: number
  pagado_promedio_diario: number
  ganancia_promedio_diario: number

  facturado_proyectado: number
  pagado_proyectado: number
  ganancia_proyectada: number
}

type SerieDia = {
  day: number
  label: string
  facturado: number
  costo: number
  ganancia: number
}

const COLORS = {
  facturado: '#3b82f6',
  costo: '#ef4444',
  ganancia: '#22c55e',
  violeta: '#8b5cf6',
  grisGrid: '#e5e7eb',
  grisTick: '#9ca3af',
}

function moneyARS(n: number) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(Number(n ?? 0))
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

export default function AdminReportesPage() {
  const [mes, setMes] = useState('2026-01')

  const [clientes, setClientes] = useState<ReporteCliente[]>([])
  const [transportistas, setTransportistas] = useState<ReporteTransportista[]>([])
  const [proy, setProy] = useState<Proyecciones | null>(null)
  const [serie, setSerie] = useState<SerieDia[]>([])

  const [loading, setLoading] = useState(false)
  const [advanced, setAdvanced] = useState(false)

  const cargarTodo = async (mesActual: string) => {
    setLoading(true)
    try {
      const resClientes = await fetch('/api/reportes/clientes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mes: mesActual }),
      })
      const dataClientes = (await resClientes.json()) as ReporteCliente[]
      setClientes(Array.isArray(dataClientes) ? dataClientes : [])

      const resTransportistas = await fetch('/api/reportes/chofer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mes: mesActual }),
      })
      const dataTransportistas = (await resTransportistas.json()) as ReporteTransportista[]
      setTransportistas(Array.isArray(dataTransportistas) ? dataTransportistas : [])

      const resProy = await fetch('/api/reportes/proyecciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mes: mesActual }),
      })
      const dataProy = (await resProy.json()) as Proyecciones
      setProy(dataProy && !('error' in (dataProy as any)) ? dataProy : null)

      const resSerie = await fetch('/api/reportes/series', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mes: mesActual }),
      })
      const dataSerie = (await resSerie.json()) as SerieDia[]
      setSerie(Array.isArray(dataSerie) ? dataSerie : [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    cargarTodo(mes)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mes])

  // =========================
  // KPIs base (claros)
  // =========================
  const kpi = useMemo(() => {
    const facturado = clientes.reduce((acc, c) => acc + (c.facturado ?? 0), 0)
    const costo = clientes.reduce((acc, c) => acc + (c.pagado ?? 0), 0)
    const viajes = clientes.reduce((acc, c) => acc + (c.viajes ?? 0), 0)
    const ganancia = facturado - costo

    return { facturado, costo, ganancia, viajes }
  }, [clientes])

  const insight = useMemo(() => {
    const gananciaPromedio = kpi.viajes > 0 ? Math.round(kpi.ganancia / kpi.viajes) : 0
    const margen = kpi.facturado > 0 ? Math.round((kpi.ganancia / kpi.facturado) * 100) : 0

    const topCliente = [...clientes].sort((a, b) => b.facturado - a.facturado)[0]
    const topTransportista = [...transportistas].sort((a, b) => b.viajes - a.viajes)[0]

    return { gananciaPromedio, margen, topCliente, topTransportista }
  }, [clientes, transportistas, kpi])

  // =========================
  // Charts (solo los útiles en modo normal)
  // =========================
  const chartDona = useMemo(() => {
    return [
      { name: 'Costo', value: Math.max(kpi.costo, 0) },
      { name: 'Ganancia', value: Math.max(kpi.ganancia, 0) },
    ]
  }, [kpi])

  const chartTopClientes = useMemo(() => {
    return [...clientes]
      .sort((a, b) => b.facturado - a.facturado)
      .slice(0, 7)
      .map(c => ({ name: c.cliente, value: c.facturado }))
  }, [clientes])

  const chartTopTransportistas = useMemo(() => {
    return [...transportistas]
      .sort((a, b) => b.viajes - a.viajes)
      .slice(0, 7)
      .map(t => ({ name: t.chofer, value: t.viajes }))
  }, [transportistas])

  // =========================
  // Export (CSV - Excel friendly)
  // =========================
  const exportClientes = () => {
    const headers = ['Cliente', 'Viajes', 'Facturado', 'Costo', 'Ganancia']
    const rows = clientes.map(c => [c.cliente, c.viajes, c.facturado, c.pagado, c.ganancia])
    const csv = buildCSV(headers, rows)
    downloadFile(`reporte_clientes_${mes}.csv`, csv)
  }

  const exportTransportistas = () => {
    const headers = ['Transportista', 'Viajes', 'Facturado', 'Pagado', 'Deuda']
    const rows = transportistas.map(t => [t.chofer, t.viajes, t.facturado, t.pagado, t.deuda])
    const csv = buildCSV(headers, rows)
    downloadFile(`reporte_transportistas_${mes}.csv`, csv)
  }

  return (
    <div className="space-y-6">
      {/* HEADER */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25 }}
        className="rounded-2xl border bg-white shadow-sm p-5"
      >
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Reportes</h1>
            <p className="text-sm text-gray-600 mt-1">
              Resumen claro del mes: cuánto facturaste, cuánto debés pagar y cuánto ganaste.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
            <div className="bg-gray-50 border rounded-xl p-3 flex items-center gap-3 w-fit">
              <div className="text-sm text-gray-600">Mes</div>
              <input
                type="month"
                value={mes}
                onChange={e => setMes(e.target.value)}
                className="border rounded-lg px-3 py-2 text-sm bg-white"
              />
            </div>

            <button
              onClick={() => cargarTodo(mes)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border hover:bg-gray-50 text-sm"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Actualizar
            </button>

            <button
              onClick={() => setAdvanced(v => !v)}
              className={`px-4 py-2 rounded-xl text-sm font-semibold border transition ${
                advanced ? 'bg-gray-900 text-white border-gray-900' : 'hover:bg-gray-50'
              }`}
            >
              {advanced ? 'Ocultar avanzados' : 'Ver gráficos avanzados'}
            </button>
          </div>
        </div>
      </motion.div>

      {/* KPI */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <KPI titulo="Facturado (mes)" valor={kpi.facturado} icon="💰" />
        <KPI titulo="Costo (mes)" valor={kpi.costo} icon="🚚" />
        <KPI titulo="Ganancia (mes)" valor={kpi.ganancia} verde icon="📈" />
        <KPI titulo="Viajes (mes)" valor={kpi.viajes} simple icon="📦" />
      </div>

      {/* INSIGHTS (se entienden) */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MiniCard
          titulo="Ganancia promedio por viaje"
          big={moneyARS(insight.gananciaPromedio)}
          small={`Margen estimado: ${insight.margen}%`}
        />
        <MiniCard
          titulo="Top cliente (facturación)"
          big={insight.topCliente?.cliente ?? '—'}
          small={
            insight.topCliente ? `Facturado: ${moneyARS(insight.topCliente.facturado)}` : 'Sin datos'
          }
        />
        <MiniCard
          titulo="Transportista con más viajes"
          big={insight.topTransportista?.chofer ?? '—'}
          small={
            insight.topTransportista ? `${insight.topTransportista.viajes} viaje(s)` : 'Sin datos'
          }
        />
      </div>

      {/* PROYECCIÓN */}
      <div className="rounded-2xl border bg-white shadow-sm overflow-hidden">
        <div className="p-4 border-b font-semibold flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-gray-500" />
          Proyección de cierre
        </div>

        {loading ? (
          <SkeletonBlock />
        ) : !proy ? (
          <div className="p-4 text-sm text-gray-500">
            No hay datos de proyección para este período.
          </div>
        ) : (
          <div className="p-4 space-y-4">
            <div className="text-xs text-gray-500 flex items-start gap-2">
              <AlertCircle className="w-4 h-4 mt-0.5" />
              <div>
                {proy.es_mes_actual ? (
                  <>
                    Estimación según promedio diario ({proy.dias_transcurridos}/{proy.dias_del_mes} días).
                  </>
                ) : (
                  <>Mes cerrado: proyección = actual.</>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <KPI titulo="Facturado proyectado" valor={proy.facturado_proyectado} icon="💰" />
              <KPI titulo="Costo proyectado" valor={proy.pagado_proyectado} icon="🚚" />
              <KPI titulo="Ganancia proyectada" valor={proy.ganancia_proyectada} verde icon="📈" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Mini titulo="Prom. diario facturado" valor={proy.facturado_promedio_diario} />
              <Mini titulo="Prom. diario costo" valor={proy.pagado_promedio_diario} />
              <Mini titulo="Prom. diario ganancia" valor={proy.ganancia_promedio_diario} />
            </div>
          </div>
        )}
      </div>

      {/* GRAFICOS (modo normal: solo 2) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Dona */}
        <div className="rounded-2xl border bg-white shadow-sm overflow-hidden">
          <div className="p-4 border-b font-semibold">Costo vs Ganancia</div>

          {loading ? (
            <SkeletonChart />
          ) : (
            <div className="p-4 h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Tooltip formatter={(v: any) => moneyARS(v)} />
                  <Pie
                    data={chartDona}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={60}
                    outerRadius={95}
                    paddingAngle={3}
                  >
                    <Cell fill={COLORS.costo} />
                    <Cell fill={COLORS.ganancia} />
                  </Pie>
                </PieChart>
              </ResponsiveContainer>

              <div className="mt-2 text-xs text-gray-500 flex gap-4">
                <span className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full" style={{ background: COLORS.costo }} />
                  Costo
                </span>
                <span className="flex items-center gap-2">
                  <span className="w-3 h-3 rounded-full" style={{ background: COLORS.ganancia }} />
                  Ganancia
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Top clientes */}
        <div className="rounded-2xl border bg-white shadow-sm overflow-hidden">
          <div className="p-4 border-b font-semibold">Top clientes por facturación</div>

          {loading ? (
            <SkeletonChart />
          ) : chartTopClientes.length === 0 ? (
            <div className="p-4 text-sm text-gray-500">Sin datos.</div>
          ) : (
            <div className="p-4 h-[260px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartTopClientes}>
                  <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grisGrid} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke={COLORS.grisTick} />
                  <YAxis tick={{ fontSize: 11 }} stroke={COLORS.grisTick} />
                  <Tooltip formatter={(v: any) => moneyARS(v)} />
                  <Bar dataKey="value" fill={COLORS.facturado} radius={[10, 10, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* AVANZADOS */}
      {advanced && (
        <div className="grid grid-cols-1 gap-4">
          {/* Serie diaria */}
          <div className="rounded-2xl border bg-white shadow-sm overflow-hidden">
            <div className="p-4 border-b font-semibold">Evolución diaria (Facturado / Costo / Ganancia)</div>

            {loading ? (
              <SkeletonChart tall />
            ) : serie.length === 0 ? (
              <div className="p-4 text-sm text-gray-500">Sin datos diarios para este mes.</div>
            ) : (
              <div className="p-4 h-[320px]">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={serie}>
                    <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grisGrid} />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} stroke={COLORS.grisTick} />
                    <YAxis tick={{ fontSize: 11 }} stroke={COLORS.grisTick} />
                    <Tooltip formatter={(v: any) => moneyARS(v)} />
                    <Legend />
                    <Line type="monotone" dataKey="facturado" stroke={COLORS.facturado} strokeWidth={3} dot={false} />
                    <Line type="monotone" dataKey="costo" stroke={COLORS.costo} strokeWidth={3} dot={false} />
                    <Line type="monotone" dataKey="ganancia" stroke={COLORS.ganancia} strokeWidth={3} dot={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          {/* Top transportistas */}
          <div className="rounded-2xl border bg-white shadow-sm overflow-hidden">
            <div className="p-4 border-b font-semibold">Top transportistas (por viajes)</div>

            {loading ? (
              <SkeletonChart />
            ) : chartTopTransportistas.length === 0 ? (
              <div className="p-4 text-sm text-gray-500">Sin datos.</div>
            ) : (
              <div className="p-4 h-[260px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartTopTransportistas}>
                    <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grisGrid} />
                    <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke={COLORS.grisTick} />
                    <YAxis tick={{ fontSize: 11 }} stroke={COLORS.grisTick} />
                    <Tooltip />
                    <Bar dataKey="value" fill={COLORS.violeta} radius={[10, 10, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>
      )}

      {/* EXPORT + TABLAS */}
      <div className="flex flex-col md:flex-row gap-3">
        <button
          onClick={exportClientes}
          className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 hover:bg-gray-50 transition text-sm"
          disabled={loading || clientes.length === 0}
        >
          <Download className="w-4 h-4" />
          Export clientes (CSV)
        </button>

        <button
          onClick={exportTransportistas}
          className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 hover:bg-gray-50 transition text-sm"
          disabled={loading || transportistas.length === 0}
        >
          <Download className="w-4 h-4" />
          Export transportistas (CSV)
        </button>
      </div>

      <TablaClientes clientes={clientes} loading={loading} moneyARS={moneyARS} />
      <TablaTransportistas transportistas={transportistas} loading={loading} moneyARS={moneyARS} />
    </div>
  )
}

/* ========================= */
/* UI COMPONENTS             */
/* ========================= */

function KPI({
  titulo,
  valor,
  verde,
  simple,
  icon,
}: {
  titulo: string
  valor: number
  verde?: boolean
  simple?: boolean
  icon?: string
}) {
  return (
    <div className="bg-white border rounded-2xl p-4 shadow-sm flex items-start justify-between gap-4">
      <div>
        <div className="text-sm text-gray-500">{titulo}</div>
        <div className={`text-2xl font-bold ${verde ? 'text-emerald-600' : ''}`}>
          {simple ? valor : new Intl.NumberFormat('es-AR').format(valor)}
        </div>
      </div>
      {icon ? <div className="text-lg opacity-80">{icon}</div> : null}
    </div>
  )
}

function MiniCard({ titulo, big, small }: { titulo: string; big: string; small: string }) {
  return (
    <div className="bg-white border rounded-2xl p-4 shadow-sm">
      <div className="text-xs text-gray-500">{titulo}</div>
      <div className="text-xl font-bold mt-1">{big}</div>
      <div className="text-xs text-gray-500 mt-1">{small}</div>
    </div>
  )
}

function Mini({ titulo, valor }: { titulo: string; valor: number }) {
  const v = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(valor)
  return (
    <div className="border rounded-2xl p-3 bg-gray-50">
      <div className="text-xs text-gray-500">{titulo}</div>
      <div className="text-lg font-semibold">{v}</div>
    </div>
  )
}

function SkeletonBlock() {
  return (
    <div className="p-4 space-y-4">
      <div className="h-3 w-56 bg-gray-200 rounded animate-pulse" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="h-20 bg-gray-200 rounded-xl animate-pulse" />
        <div className="h-20 bg-gray-200 rounded-xl animate-pulse" />
        <div className="h-20 bg-gray-200 rounded-xl animate-pulse" />
      </div>
    </div>
  )
}

function SkeletonChart({ tall }: { tall?: boolean }) {
  return (
    <div className={`p-4 ${tall ? 'h-[320px]' : 'h-[260px]'}`}>
      <div className="w-full h-full bg-gray-200 rounded-xl animate-pulse" />
    </div>
  )
}

/* ========================= */
/* TABLAS                    */
/* ========================= */

function TablaClientes({
  clientes,
  loading,
  moneyARS,
}: {
  clientes: ReporteCliente[]
  loading: boolean
  moneyARS: (n: number) => string
}) {
  return (
    <div className="bg-white border rounded-2xl overflow-hidden shadow-sm">
      <div className="p-4 border-b font-semibold">Detalle por cliente</div>

      {loading ? (
        <div className="p-4 text-sm">Cargando…</div>
      ) : clientes.length === 0 ? (
        <div className="p-4 text-sm text-gray-500">No hay datos para el período seleccionado.</div>
      ) : (
        <div className="overflow-auto">
          <table className="min-w-[900px] w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left p-3">Cliente</th>
                <th className="text-right p-3">Viajes</th>
                <th className="text-right p-3">Facturado</th>
                <th className="text-right p-3">Costo</th>
                <th className="text-right p-3">Ganancia</th>
              </tr>
            </thead>
            <tbody>
              {clientes.map((c, i) => (
                <tr key={i} className="border-b last:border-b-0 hover:bg-gray-50 transition">
                  <td className="p-3 font-medium">{c.cliente}</td>
                  <td className="p-3 text-right">{c.viajes}</td>
                  <td className="p-3 text-right">{moneyARS(c.facturado)}</td>
                  <td className="p-3 text-right">{moneyARS(c.pagado)}</td>
                  <td className="p-3 text-right font-semibold text-emerald-600">{moneyARS(c.ganancia)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function TablaTransportistas({
  transportistas,
  loading,
  moneyARS,
}: {
  transportistas: ReporteTransportista[]
  loading: boolean
  moneyARS: (n: number) => string
}) {
  return (
    <div className="bg-white border rounded-2xl overflow-hidden shadow-sm">
      <div className="p-4 border-b font-semibold">Detalle por transportista</div>

      {loading ? (
        <div className="p-4 text-sm">Cargando…</div>
      ) : transportistas.length === 0 ? (
        <div className="p-4 text-sm text-gray-500">No hay datos para el período seleccionado.</div>
      ) : (
        <div className="overflow-auto">
          <table className="min-w-[900px] w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left p-3">Transportista</th>
                <th className="text-right p-3">Viajes</th>
                <th className="text-right p-3">Facturado</th>
                <th className="text-right p-3">Pagado</th>
                <th className="text-right p-3">Deuda</th>
              </tr>
            </thead>
            <tbody>
              {transportistas.map((t, i) => (
                <tr key={i} className="border-b last:border-b-0 hover:bg-gray-50 transition">
                  <td className="p-3 font-medium">{t.chofer}</td>
                  <td className="p-3 text-right">{t.viajes}</td>
                  <td className="p-3 text-right">{moneyARS(t.facturado)}</td>
                  <td className="p-3 text-right">{moneyARS(t.pagado)}</td>
                  <td className="p-3 text-right font-semibold text-rose-600">{moneyARS(t.deuda)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
