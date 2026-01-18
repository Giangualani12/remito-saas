'use client'

import { useEffect, useMemo, useState } from 'react'
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

type ReporteCliente = {
  cliente: string
  viajes: number
  facturado: number
  pagado: number
  ganancia: number
}

type ReporteChofer = {
  chofer: string // (en la UI lo vas a llamar Transportista si querés)
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
  facturado: '#3b82f6', // azul
  costo: '#ef4444', // rojo
  ganancia: '#22c55e', // verde
  violeta: '#8b5cf6',
  grisGrid: '#e5e7eb',
  grisTick: '#9ca3af',
}

function money(n: number) {
  return `$${Number(n ?? 0).toLocaleString()}`
}

export default function AdminReportesPage() {
  const [mes, setMes] = useState('2026-01')

  const [clientes, setClientes] = useState<ReporteCliente[]>([])
  const [transportistas, setTransportistas] = useState<ReporteChofer[]>([])
  const [proy, setProy] = useState<Proyecciones | null>(null)
  const [serie, setSerie] = useState<SerieDia[]>([])

  const [loading, setLoading] = useState(false)

  const cargarTodo = async (mesActual: string) => {
    setLoading(true)

    try {
      // REPORTE CLIENTES
      const resClientes = await fetch('/api/reportes/clientes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mes: mesActual }),
      })
      const dataClientes = (await resClientes.json()) as ReporteCliente[]
      setClientes(Array.isArray(dataClientes) ? dataClientes : [])

      // REPORTE TRANSPORTISTAS (choferes)
      const resChoferes = await fetch('/api/reportes/chofer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mes: mesActual }),
      })
      const dataChoferes = (await resChoferes.json()) as ReporteChofer[]
      setTransportistas(Array.isArray(dataChoferes) ? dataChoferes : [])

      // PROYECCIÓN
      const resProy = await fetch('/api/reportes/proyecciones', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mes: mesActual }),
      })
      const dataProy = (await resProy.json()) as Proyecciones
      setProy(dataProy && !('error' in (dataProy as any)) ? dataProy : null)

      // SERIE DIARIA (PRO)
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
  // KPIs base
  // =========================
  const kpi = useMemo(() => {
    const facturado = clientes.reduce((acc, c) => acc + (c.facturado ?? 0), 0)
    const costo = clientes.reduce((acc, c) => acc + (c.pagado ?? 0), 0)
    const viajes = clientes.reduce((acc, c) => acc + (c.viajes ?? 0), 0)
    const ganancia = facturado - costo

    return { facturado, costo, ganancia, viajes }
  }, [clientes])

  // =========================
  // KPIs PRO (insights)
  // =========================
  const insight = useMemo(() => {
    const gananciaPromedio =
      kpi.viajes > 0 ? Math.round(kpi.ganancia / kpi.viajes) : 0

    const margen =
      kpi.facturado > 0 ? Math.round((kpi.ganancia / kpi.facturado) * 100) : 0

    const topCliente = [...clientes]
      .sort((a, b) => b.facturado - a.facturado)
      .slice(0, 1)[0]

    const topTransportista = [...transportistas]
      .sort((a, b) => b.viajes - a.viajes)
      .slice(0, 1)[0]

    return {
      gananciaPromedio,
      margen,
      topCliente,
      topTransportista,
    }
  }, [clientes, transportistas, kpi])

  // =========================
  // Chart data (TOPS)
  // =========================
  const chartTopClientes = useMemo(() => {
    return [...clientes]
      .sort((a, b) => b.facturado - a.facturado)
      .slice(0, 6)
      .map(c => ({ name: c.cliente, value: c.facturado }))
  }, [clientes])

  const chartTopTransportistas = useMemo(() => {
    return [...transportistas]
      .sort((a, b) => b.viajes - a.viajes)
      .slice(0, 6)
      .map(t => ({ name: t.chofer, value: t.viajes }))
  }, [transportistas])

  // Donut = costo vs ganancia
  const chartDona = useMemo(() => {
    const costo = Math.max(kpi.costo, 0)
    const ganancia = Math.max(kpi.ganancia, 0)

    return [
      { name: 'Costo', value: costo },
      { name: 'Ganancia', value: ganancia },
    ]
  }, [kpi])

  // =========================
  // UI
  // =========================
  return (
    <div className="space-y-8">
      {/* Header + filtro */}
      <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Reportes</h1>
          <p className="text-sm text-gray-500">
            Resumen del mes, proyección, gráficos y detalle por cliente/transportista.
          </p>
        </div>

        <div className="bg-white border rounded-xl p-3 flex items-center gap-3 w-fit">
          <div className="text-sm text-gray-600">Mes</div>
          <input
            type="month"
            value={mes}
            onChange={e => setMes(e.target.value)}
            className="border rounded-lg px-3 py-2 text-sm"
          />
          <button
            onClick={() => cargarTodo(mes)}
            className="px-4 py-2 rounded-lg border hover:bg-gray-50 text-sm"
          >
            Actualizar
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <KPI titulo="Facturado (mes)" valor={kpi.facturado} icon="💰" />
        <KPI titulo="Costo (mes)" valor={kpi.costo} icon="🚚" />
        <KPI titulo="Ganancia (mes)" valor={kpi.ganancia} verde icon="📈" />
        <KPI titulo="Viajes (mes)" valor={kpi.viajes} simple icon="📦" />
      </div>

      {/* Insights */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <MiniCard
          titulo="Ganancia promedio por viaje"
          big={money(insight.gananciaPromedio)}
          small={`Margen estimado: ${insight.margen}%`}
        />
        <MiniCard
          titulo="Top cliente (facturación)"
          big={insight.topCliente?.cliente ?? '—'}
          small={
            insight.topCliente ? `Facturado: ${money(insight.topCliente.facturado)}` : 'Sin datos'
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
      <div className="bg-white border rounded-xl overflow-hidden">
        <div className="p-4 border-b font-semibold">Proyección de cierre</div>

        {loading ? (
          <SkeletonBlock />
        ) : !proy ? (
          <div className="p-4 text-sm text-gray-500">
            No hay datos de proyección para este período.
          </div>
        ) : (
          <div className="p-4 space-y-4">
            <div className="text-xs text-gray-500">
              {proy.es_mes_actual ? (
                <>
                  Estimación basada en promedio diario del mes ({proy.dias_transcurridos}/
                  {proy.dias_del_mes} días).
                </>
              ) : (
                <>Mes cerrado: proyección = actual.</>
              )}
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

      {/* GRAFICOS PRO */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Dona */}
        <div className="bg-white border rounded-xl overflow-hidden">
          <div className="p-4 border-b font-semibold">Distribución del mes (dona)</div>
          {loading ? (
            <SkeletonChart />
          ) : (
            <div className="p-4 h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Tooltip
                    formatter={(v: any) => money(v)}
                    contentStyle={{
                      background: 'white',
                      borderRadius: 12,
                      border: '1px solid #e5e7eb',
                      boxShadow: '0 10px 20px rgba(0,0,0,0.08)',
                    }}
                    labelStyle={{ fontWeight: 600 }}
                  />
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
        <div className="bg-white border rounded-xl overflow-hidden">
          <div className="p-4 border-b font-semibold">Top clientes (facturación)</div>
          {loading ? (
            <SkeletonChart />
          ) : chartTopClientes.length === 0 ? (
            <div className="p-4 text-sm text-gray-500">Sin datos.</div>
          ) : (
            <div className="p-4 h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartTopClientes}>
                  <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grisGrid} />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} stroke={COLORS.grisTick} />
                  <YAxis tick={{ fontSize: 11 }} stroke={COLORS.grisTick} />
                  <Tooltip
                    formatter={(v: any) => money(v)}
                    contentStyle={{
                      background: 'white',
                      borderRadius: 12,
                      border: '1px solid #e5e7eb',
                      boxShadow: '0 10px 20px rgba(0,0,0,0.08)',
                    }}
                  />
                  <Bar dataKey="value" fill={COLORS.facturado} radius={[10, 10, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        {/* Serie diaria */}
        <div className="bg-white border rounded-xl overflow-hidden md:col-span-2">
          <div className="p-4 border-b font-semibold">Evolución diaria (facturado vs costo vs ganancia)</div>

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
                  <Tooltip
                    formatter={(v: any) => money(v)}
                    contentStyle={{
                      background: 'white',
                      borderRadius: 12,
                      border: '1px solid #e5e7eb',
                      boxShadow: '0 10px 20px rgba(0,0,0,0.08)',
                    }}
                  />
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
        <div className="bg-white border rounded-xl overflow-hidden md:col-span-2">
          <div className="p-4 border-b font-semibold">Top transportistas (viajes)</div>
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
                  <Tooltip
                    contentStyle={{
                      background: 'white',
                      borderRadius: 12,
                      border: '1px solid #e5e7eb',
                      boxShadow: '0 10px 20px rgba(0,0,0,0.08)',
                    }}
                  />
                  <Bar dataKey="value" fill={COLORS.violeta} radius={[10, 10, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      </div>

      {/* TABLAS */}
      <TablaClientes clientes={clientes} loading={loading} />
      <TablaTransportistas transportistas={transportistas} loading={loading} />
    </div>
  )
}

/* ========================= */
/* COMPONENTES UI            */
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
    <div className="bg-white border rounded-xl p-4 flex items-start justify-between gap-4">
      <div>
        <div className="text-sm text-gray-500">{titulo}</div>
        <div className={`text-2xl font-bold ${verde ? 'text-green-600' : ''}`}>
          {simple ? valor : money(valor)}
        </div>
      </div>
      {icon ? (
        <div className="text-lg opacity-80">{icon}</div>
      ) : null}
    </div>
  )
}

function MiniCard({ titulo, big, small }: { titulo: string; big: string; small: string }) {
  return (
    <div className="bg-white border rounded-xl p-4">
      <div className="text-xs text-gray-500">{titulo}</div>
      <div className="text-xl font-bold mt-1">{big}</div>
      <div className="text-xs text-gray-500 mt-1">{small}</div>
    </div>
  )
}

function Mini({ titulo, valor }: { titulo: string; valor: number }) {
  return (
    <div className="border rounded-xl p-3">
      <div className="text-xs text-gray-500">{titulo}</div>
      <div className="text-lg font-semibold">{money(valor)}</div>
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
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="h-14 bg-gray-200 rounded-xl animate-pulse" />
        <div className="h-14 bg-gray-200 rounded-xl animate-pulse" />
        <div className="h-14 bg-gray-200 rounded-xl animate-pulse" />
      </div>
    </div>
  )
}

function SkeletonChart({ tall }: { tall?: boolean }) {
  return (
    <div className={`p-4 ${tall ? 'h-[320px]' : 'h-[280px]'}`}>
      <div className="w-full h-full bg-gray-200 rounded-xl animate-pulse" />
    </div>
  )
}

/* ========================= */
/* TABLAS                    */
/* ========================= */

function TablaClientes({ clientes, loading }: { clientes: ReporteCliente[]; loading: boolean }) {
  return (
    <div className="bg-white border rounded-xl overflow-hidden">
      <div className="p-4 border-b font-semibold">Detalle por cliente</div>

      {loading ? (
        <div className="p-4 text-sm">Cargando…</div>
      ) : clientes.length === 0 ? (
        <div className="p-4 text-sm text-gray-500">No hay datos para el período seleccionado.</div>
      ) : (
        <table className="w-full text-sm">
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
              <tr key={i} className="border-b last:border-b-0">
                <td className="p-3 font-medium">{c.cliente}</td>
                <td className="p-3 text-right">{c.viajes}</td>
                <td className="p-3 text-right">{money(c.facturado)}</td>
                <td className="p-3 text-right">{money(c.pagado)}</td>
                <td className="p-3 text-right font-semibold text-green-600">{money(c.ganancia)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}

function TablaTransportistas({
  transportistas,
  loading,
}: {
  transportistas: ReporteChofer[]
  loading: boolean
}) {
  return (
    <div className="bg-white border rounded-xl overflow-hidden">
      <div className="p-4 border-b font-semibold">Detalle por transportista</div>

      {loading ? (
        <div className="p-4 text-sm">Cargando…</div>
      ) : transportistas.length === 0 ? (
        <div className="p-4 text-sm text-gray-500">No hay datos para el período seleccionado.</div>
      ) : (
        <table className="w-full text-sm">
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
            {transportistas.map((c, i) => (
              <tr key={i} className="border-b last:border-b-0">
                <td className="p-3 font-medium">{c.chofer}</td>
                <td className="p-3 text-right">{c.viajes}</td>
                <td className="p-3 text-right">{money(c.facturado)}</td>
                <td className="p-3 text-right">{money(c.pagado)}</td>
                <td className="p-3 text-right font-semibold text-red-600">{money(c.deuda)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
