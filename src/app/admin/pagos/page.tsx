'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'
import Link from 'next/link'

type ChoferEmbed = { nombre: string | null; email: string | null }
type ViajeEmbed = { origen: string | null; destino: string | null; tipo_unidad: string | null }

type ViajeRow = {
  id: string
  creado_en: string | null
  estado: string
  origen: string | null
  destino: string | null
  tipo_unidad: string | null
  chofer_id: string
  valor_chofer_snapshot: number | null
  valor_cliente_snapshot: number | null

  // joins pueden venir objeto o array o null (depende tu schema/relación)
  chofer: ChoferEmbed | ChoferEmbed[] | null
  remitos: { numero_remito: string | null; archivo_url: string | null; fecha_viaje: string | null }[] | null
}

type PagoRow = {
  id: string
  creado_en: string | null
  fecha_pago: string | null
  metodo: string | null
  referencia: string | null
  monto: number
  viaje_id: string
  chofer_id: string | null

  chofer: ChoferEmbed | ChoferEmbed[] | null
  viaje: ViajeEmbed | ViajeEmbed[] | null
}

const METODOS = ['efectivo', 'transferencia', 'mercadopago', 'cheque', 'otro'] as const

function money(n: number) {
  return `$${Math.round(n).toLocaleString('es-AR')}`
}

function firstObj<T>(x: T | T[] | null | undefined): T | null {
  if (!x) return null
  return Array.isArray(x) ? (x[0] ?? null) : x
}

function Badge({
  children,
  tone = 'gray',
}: {
  children: React.ReactNode
  tone?: 'gray' | 'yellow' | 'green' | 'blue' | 'red'
}) {
  const map: Record<string, string> = {
    gray: 'bg-gray-100 text-gray-700 border-gray-200',
    yellow: 'bg-yellow-50 text-yellow-800 border-yellow-200',
    green: 'bg-green-50 text-green-800 border-green-200',
    blue: 'bg-blue-50 text-blue-800 border-blue-200',
    red: 'bg-red-50 text-red-800 border-red-200',
  }
  return (
    <span className={`inline-flex items-center px-2 py-1 text-xs border rounded-full ${map[tone] ?? map.gray}`}>
      {children}
    </span>
  )
}

export default function AdminPagosPage() {
  const [tab, setTab] = useState<'pendientes' | 'historial'>('pendientes')
  const [loading, setLoading] = useState(true)

  const [pendientes, setPendientes] = useState<ViajeRow[]>([])
  const [historial, setHistorial] = useState<PagoRow[]>([])
  const [q, setQ] = useState('')

  // modal
  const [open, setOpen] = useState(false)
  const [sel, setSel] = useState<ViajeRow | null>(null)
  const [metodo, setMetodo] = useState<(typeof METODOS)[number]>('transferencia')
  const [referencia, setReferencia] = useState('')
  const [fechaPago, setFechaPago] = useState(() => new Date().toISOString().slice(0, 10))
  const [saving, setSaving] = useState(false)

  const load = async () => {
    setLoading(true)

    // =======================
    // 1) PENDIENTES
    // =======================
    const { data: vData, error: vErr } = await supabase
      .from('viajes')
      .select(
        `
        id, creado_en, estado, origen, destino, tipo_unidad,
        chofer_id, valor_chofer_snapshot, valor_cliente_snapshot,
        chofer:chofer_id ( nombre, email ),
        remitos:remitos ( numero_remito, archivo_url, fecha_viaje )
      `
      )
      .eq('estado', 'facturado')
      .order('creado_en', { ascending: false })

    if (vErr) {
      alert(vErr.message)
      setPendientes([])
    } else {
      // ✅ cast seguro vía unknown
      setPendientes(((vData ?? []) as unknown) as ViajeRow[])
    }

    // =======================
    // 2) HISTORIAL
    // =======================
    const { data: pData, error: pErr } = await supabase
      .from('pagos_choferes')
      .select(
        `
        id, creado_en, fecha_pago, metodo, referencia, monto, viaje_id, chofer_id,
        chofer:chofer_id ( nombre, email ),
        viaje:viaje_id ( origen, destino, tipo_unidad )
      `
      )
      .order('creado_en', { ascending: false })
      .limit(50)

    if (pErr) {
      console.log('pagos_choferes error:', pErr)
      setHistorial([])
    } else {
      setHistorial(((pData ?? []) as unknown) as PagoRow[])
    }

    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const kpis = useMemo(() => {
    const totalPend = pendientes.length
    const totalAPagar = pendientes.reduce((acc, v) => acc + (v.valor_chofer_snapshot ?? 0), 0)

    const pagadoMes = historial
      .filter(p => {
        const d = p.fecha_pago ? new Date(p.fecha_pago) : p.creado_en ? new Date(p.creado_en) : null
        if (!d) return false
        const now = new Date()
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
      })
      .reduce((acc, p) => acc + (p.monto ?? 0), 0)

    return { totalPend, totalAPagar, pagadoMes }
  }, [pendientes, historial])

  const pendientesFiltrados = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return pendientes

    return pendientes.filter(v => {
      const chofer = firstObj(v.chofer)
      const choferTxt = (chofer?.nombre ?? chofer?.email ?? '').toLowerCase()
      const rutaTxt = `${v.origen ?? ''} ${v.destino ?? ''}`.toLowerCase()
      const rem = (v.remitos?.[0]?.numero_remito ?? '').toLowerCase()
      return choferTxt.includes(s) || rutaTxt.includes(s) || rem.includes(s) || v.id.toLowerCase().includes(s)
    })
  }, [pendientes, q])

  const abrirPagar = (v: ViajeRow) => {
    setSel(v)
    setMetodo('transferencia')
    setReferencia('')
    setFechaPago(new Date().toISOString().slice(0, 10))
    setOpen(true)
  }

  const cerrarModal = () => {
    if (saving) return
    setOpen(false)
    setSel(null)
  }

  const marcarPagado = async () => {
    if (!sel) return

    const monto = sel.valor_chofer_snapshot ?? 0
    if (!monto || monto <= 0) {
      alert('Este viaje no tiene “valor_chofer_snapshot”. Primero asigná tarifa/snapshot.')
      return
    }

    setSaving(true)

    // 1) Insert pago
    const { error: ePago } = await supabase.from('pagos_choferes').insert({
      viaje_id: sel.id,
      chofer_id: sel.chofer_id,
      monto,
      metodo,
      referencia: referencia.trim() || null,
      fecha_pago: fechaPago || null,
    })

    if (ePago) {
      alert(ePago.message)
      setSaving(false)
      return
    }

    // 2) Update viaje a pagado
    const { error: eUp } = await supabase.from('viajes').update({ estado: 'pagado' }).eq('id', sel.id)

    if (eUp) {
      alert(eUp.message)
      setSaving(false)
      return
    }

    setSaving(false)
    setOpen(false)
    setSel(null)
    await load()
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Pagos a choferes</h1>
          <p className="text-sm text-gray-500">Registrá pagos y mantené historial (método + referencia).</p>
        </div>

        <button
          onClick={load}
          className="px-3 py-2 text-sm border rounded-lg bg-white hover:bg-gray-50 active:scale-[0.99] transition"
        >
          Actualizar
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-white border rounded-xl p-4">
          <div className="text-sm text-gray-500">Pendientes</div>
          <div className="text-2xl font-bold">{kpis.totalPend}</div>
        </div>
        <div className="bg-white border rounded-xl p-4">
          <div className="text-sm text-gray-500">Total a pagar (pendientes)</div>
          <div className="text-2xl font-bold">{money(kpis.totalAPagar)}</div>
        </div>
        <div className="bg-white border rounded-xl p-4">
          <div className="text-sm text-gray-500">Pagado este mes</div>
          <div className="text-2xl font-bold">{money(kpis.pagadoMes)}</div>
        </div>
      </div>

      <div className="bg-white border rounded-xl p-3 flex flex-col md:flex-row md:items-center gap-3 justify-between">
        <div className="flex gap-2">
          <button
            onClick={() => setTab('pendientes')}
            className={`px-3 py-2 text-sm rounded-lg border transition ${
              tab === 'pendientes' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white hover:bg-gray-50'
            }`}
          >
            Pendientes
          </button>
          <button
            onClick={() => setTab('historial')}
            className={`px-3 py-2 text-sm rounded-lg border transition ${
              tab === 'historial' ? 'bg-blue-600 text-white border-blue-600' : 'bg-white hover:bg-gray-50'
            }`}
          >
            Historial
          </button>
        </div>

        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          placeholder="Buscar (chofer, ruta, remito, id)..."
          className="w-full md:w-[420px] border rounded-lg px-3 py-2 text-sm"
        />
      </div>

      <div className="bg-white border rounded-xl overflow-hidden">
        {loading ? (
          <div className="p-4 text-sm">Cargando…</div>
        ) : tab === 'pendientes' ? (
          pendientesFiltrados.length === 0 ? (
            <div className="p-4 text-sm text-gray-600">
              No hay pagos pendientes. <Badge tone="green">Todo al día</Badge>
            </div>
          ) : (
            <div className="overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 border-b">
                  <tr>
                    <th className="text-left p-3">Chofer</th>
                    <th className="text-left p-3">Ruta</th>
                    <th className="text-left p-3">Remito</th>
                    <th className="text-left p-3">Unidad</th>
                    <th className="text-left p-3">A pagar</th>
                    <th className="text-left p-3">Estado</th>
                    <th className="text-right p-3">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {pendientesFiltrados.map(v => {
                    const rem = v.remitos?.[0]
                    const ruta = `${v.origen ?? '-'} → ${v.destino ?? '-'}`
                    const chofer = firstObj(v.chofer)
                    const choferTxt = chofer?.nombre ?? chofer?.email ?? '—'
                    const monto = v.valor_chofer_snapshot ?? 0

                    return (
                      <tr key={v.id} className="border-b last:border-b-0 hover:bg-gray-50 transition">
                        <td className="p-3">
                          <div className="font-medium">{choferTxt}</div>
                          <div className="text-xs text-gray-500">{chofer?.email ?? ''}</div>
                        </td>
                        <td className="p-3">{ruta}</td>
                        <td className="p-3">{rem?.numero_remito ?? '—'}</td>
                        <td className="p-3">{v.tipo_unidad ?? '—'}</td>
                        <td className="p-3 font-semibold">{money(monto)}</td>
                        <td className="p-3">
                          <Badge tone="yellow">{v.estado}</Badge>
                        </td>
                        <td className="p-3">
                          <div className="flex justify-end gap-2">
                            <Link
                              href={`/admin/viajes/${v.id}`}
                              className="px-3 py-2 text-xs border rounded-lg hover:bg-white bg-gray-50"
                            >
                              Ver viaje
                            </Link>
                            <button
                              onClick={() => abrirPagar(v)}
                              className="px-3 py-2 text-xs rounded-lg bg-green-600 text-white hover:bg-green-700 active:scale-[0.99] transition"
                            >
                              Marcar pagado
                            </button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )
        ) : historial.length === 0 ? (
          <div className="p-4 text-sm text-gray-600">No hay historial todavía.</div>
        ) : (
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left p-3">Fecha</th>
                  <th className="text-left p-3">Chofer</th>
                  <th className="text-left p-3">Ruta</th>
                  <th className="text-left p-3">Método</th>
                  <th className="text-left p-3">Referencia</th>
                  <th className="text-left p-3">Monto</th>
                </tr>
              </thead>
              <tbody>
                {historial
                  .filter(p => {
                    const s = q.trim().toLowerCase()
                    if (!s) return true
                    const chofer = firstObj(p.chofer)
                    const choferTxt = (chofer?.nombre ?? chofer?.email ?? '').toLowerCase()
                    const viaje = firstObj(p.viaje)
                    const ruta = `${viaje?.origen ?? ''} ${viaje?.destino ?? ''}`.toLowerCase()
                    const ref = (p.referencia ?? '').toLowerCase()
                    return choferTxt.includes(s) || ruta.includes(s) || ref.includes(s) || p.viaje_id.toLowerCase().includes(s)
                  })
                  .map(p => {
                    const d = p.fecha_pago ? new Date(p.fecha_pago) : p.creado_en ? new Date(p.creado_en) : null
                    const fecha = d ? d.toLocaleDateString('es-AR') : '—'

                    const chofer = firstObj(p.chofer)
                    const choferTxt = chofer?.nombre ?? chofer?.email ?? '—'

                    const viaje = firstObj(p.viaje)
                    const ruta = `${viaje?.origen ?? '-'} → ${viaje?.destino ?? '-'}`

                    return (
                      <tr key={p.id} className="border-b last:border-b-0 hover:bg-gray-50 transition">
                        <td className="p-3">{fecha}</td>
                        <td className="p-3">{choferTxt}</td>
                        <td className="p-3">{ruta}</td>
                        <td className="p-3">
                          <Badge tone="blue">{p.metodo ?? '—'}</Badge>
                        </td>
                        <td className="p-3">{p.referencia ?? '—'}</td>
                        <td className="p-3 font-semibold">{money(p.monto ?? 0)}</td>
                      </tr>
                    )
                  })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal */}
      {open && sel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/30" onClick={cerrarModal} />
          <div className="relative w-full max-w-lg bg-white border rounded-2xl shadow-xl p-4 md:p-5 animate-[fadeIn_.18s_ease-out]">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="text-lg font-bold">Registrar pago</div>
                <div className="text-sm text-gray-500">
                  {(firstObj(sel.chofer)?.nombre ?? firstObj(sel.chofer)?.email ?? 'Chofer')} · {sel.origen ?? '-'} →{' '}
                  {sel.destino ?? '-'}
                </div>
              </div>
              <button className="text-sm px-3 py-2 border rounded-lg hover:bg-gray-50" onClick={cerrarModal}>
                Cerrar
              </button>
            </div>

            <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="bg-gray-50 border rounded-xl p-3">
                <div className="text-xs text-gray-500">Monto a pagar</div>
                <div className="text-xl font-bold">{money(sel.valor_chofer_snapshot ?? 0)}</div>
              </div>

              <div className="bg-gray-50 border rounded-xl p-3">
                <div className="text-xs text-gray-500">Estado actual</div>
                <div className="mt-1">
                  <Badge tone="yellow">{sel.estado}</Badge>
                </div>
              </div>

              <div>
                <label className="text-sm font-medium">Método</label>
                <select
                  className="mt-1 w-full border rounded-lg p-2 text-sm"
                  value={metodo}
                  onChange={e => setMetodo(e.target.value as any)}
                >
                  {METODOS.map(m => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-sm font-medium">Fecha de pago</label>
                <input
                  type="date"
                  className="mt-1 w-full border rounded-lg p-2 text-sm"
                  value={fechaPago}
                  onChange={e => setFechaPago(e.target.value)}
                />
              </div>

              <div className="md:col-span-2">
                <label className="text-sm font-medium">Referencia (opcional)</label>
                <input
                  className="mt-1 w-full border rounded-lg p-2 text-sm"
                  placeholder="Ej: Transferencia #A123 / Alias / Comprobante…"
                  value={referencia}
                  onChange={e => setReferencia(e.target.value)}
                />
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button onClick={cerrarModal} disabled={saving} className="px-4 py-2 border rounded-lg hover:bg-gray-50 disabled:opacity-50">
                Cancelar
              </button>
              <button
                onClick={marcarPagado}
                disabled={saving}
                className="px-4 py-2 rounded-lg bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 active:scale-[0.99] transition"
              >
                {saving ? 'Guardando…' : 'Confirmar pago'}
              </button>
            </div>
          </div>

          <style jsx global>{`
            @keyframes fadeIn {
              from {
                opacity: 0;
                transform: translateY(6px);
              }
              to {
                opacity: 1;
                transform: translateY(0);
              }
            }
          `}</style>
        </div>
      )}
    </div>
  )
}
