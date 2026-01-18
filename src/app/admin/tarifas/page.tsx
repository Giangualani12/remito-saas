'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Cliente = {
  id: string
  nombre: string
}

type Tarifa = {
  id: string
  cliente_id: string | null
  destino: string | null
  tipo_unidad: string | null
  valor_cliente: number | null
  valor_chofer: number | null
  vigente: boolean
  creado_en: string
  // ⬇️ puede venir objeto o array según relación
  cliente?: { nombre: string } | { nombre: string }[] | null
}

const TIPOS = ['camioneta', 'chasis', 'balancines', 'semis'] as const
type TipoUnidad = (typeof TIPOS)[number]

function money(n: number | null | undefined) {
  const v = Number(n ?? 0)
  return `$${v.toLocaleString('es-AR')}`
}

function clienteNombre(t: Tarifa) {
  const c: any = t.cliente
  if (!c) return '—'
  if (Array.isArray(c)) return c[0]?.nombre ?? '—'
  return c.nombre ?? '—'
}

function Badge({ children, tone = 'gray' }: { children: React.ReactNode; tone?: 'green' | 'red' | 'blue' | 'yellow' | 'gray' | 'purple' }) {
  const map: Record<string, string> = {
    green: 'bg-green-50 text-green-700 ring-green-200',
    red: 'bg-red-50 text-red-700 ring-red-200',
    blue: 'bg-blue-50 text-blue-700 ring-blue-200',
    yellow: 'bg-yellow-50 text-yellow-700 ring-yellow-200',
    purple: 'bg-purple-50 text-purple-700 ring-purple-200',
    gray: 'bg-gray-50 text-gray-700 ring-gray-200',
  }
  return (
    <span className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-full ring-1 ${map[tone]}`}>
      {children}
    </span>
  )
}

export default function AdminTarifasPage() {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [tarifas, setTarifas] = useState<Tarifa[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // form
  const [clienteId, setClienteId] = useState<string>('')
  const [destino, setDestino] = useState('')
  const [tipoUnidad, setTipoUnidad] = useState<TipoUnidad>('chasis')
  const [valorCliente, setValorCliente] = useState('')
  const [valorChofer, setValorChofer] = useState('')

  // filtros
  const [q, setQ] = useState('')
  const [soloVigentes, setSoloVigentes] = useState(true)

  const load = async () => {
    setLoading(true)

    const [{ data: c, error: eC }, { data: t, error: eT }] = await Promise.all([
      supabase.from('clientes').select('id, nombre').order('nombre'),
      supabase
        .from('tarifas')
        .select(
          `
          id,
          cliente_id,
          destino,
          tipo_unidad,
          valor_cliente,
          valor_chofer,
          vigente,
          creado_en,
          cliente:cliente_id ( nombre )
        `
        )
        .order('creado_en', { ascending: false }),
    ])

    if (eC) alert(eC.message)
    if (eT) alert(eT.message)

    setClientes((c as Cliente[]) ?? [])
    setTarifas(((t ?? []) as unknown) as Tarifa[])
    setLoading(false)
  }

  useEffect(() => {
    load()
  }, [])

  const filtradas = useMemo(() => {
    const qq = q.trim().toLowerCase()
    return tarifas.filter(t => {
      if (soloVigentes && !t.vigente) return false

      if (!qq) return true

      const cn = clienteNombre(t).toLowerCase()
      const d = (t.destino ?? '').toLowerCase()
      const u = (t.tipo_unidad ?? '').toLowerCase()

      return cn.includes(qq) || d.includes(qq) || u.includes(qq) || String(t.valor_cliente ?? '').includes(qq)
    })
  }, [tarifas, q, soloVigentes])

  const resumen = useMemo(() => {
    const total = filtradas.length
    const sumCliente = filtradas.reduce((a, x) => a + (x.valor_cliente ?? 0), 0)
    const sumChofer = filtradas.reduce((a, x) => a + (x.valor_chofer ?? 0), 0)
    const gan = sumCliente - sumChofer
    return { total, sumCliente, sumChofer, gan }
  }, [filtradas])

  const crearTarifa = async () => {
    if (!clienteId) return alert('Elegí un cliente')
    if (!destino.trim()) return alert('Completá destino')
    if (!tipoUnidad) return alert('Completá unidad')

    const vc = Number(valorCliente)
    const vch = Number(valorChofer)

    if (!Number.isFinite(vc) || vc <= 0) return alert('Valor cliente inválido')
    if (!Number.isFinite(vch) || vch < 0) return alert('Valor chofer inválido')

    setSaving(true)

    const { data, error } = await supabase
      .from('tarifas')
      .insert({
        cliente_id: clienteId,
        destino: destino.trim(),
        tipo_unidad: tipoUnidad,
        valor_cliente: vc,
        valor_chofer: vch,
        vigente: true,
      })
      .select(
        `
        id,
        cliente_id,
        destino,
        tipo_unidad,
        valor_cliente,
        valor_chofer,
        vigente,
        creado_en,
        cliente:cliente_id ( nombre )
      `
      )
      .single()

    if (error) {
      alert(error.message)
      setSaving(false)
      return
    }

    setTarifas(prev => [data as unknown as Tarifa, ...prev])
    setDestino('')
    setValorCliente('')
    setValorChofer('')
    setSaving(false)
  }

  const toggleVigente = async (t: Tarifa) => {
    const next = !t.vigente
    const { error } = await supabase.from('tarifas').update({ vigente: next }).eq('id', t.id)
    if (error) return alert(error.message)

    setTarifas(prev => prev.map(x => (x.id === t.id ? { ...x, vigente: next } : x)))
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tarifas</h1>
          <p className="text-sm text-gray-500">Valores por cliente, destino y tipo de unidad</p>
        </div>

        <div className="flex gap-2">
          <button
            onClick={load}
            className="px-3 py-2 text-sm rounded-xl border bg-white hover:bg-gray-50 transition active:scale-[0.99]"
          >
            Actualizar
          </button>
        </div>
      </div>

      {/* Resumen */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-xs text-gray-500">Tarifas (según filtros)</div>
          <div className="text-2xl font-bold">{resumen.total}</div>
        </div>
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-xs text-gray-500">Suma valor cliente</div>
          <div className="text-2xl font-bold">{money(resumen.sumCliente)}</div>
        </div>
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="text-xs text-gray-500">Suma valor chofer</div>
          <div className="text-2xl font-bold">{money(resumen.sumChofer)}</div>
        </div>
        <div className="rounded-2xl border bg-green-50 border-green-200 p-4 shadow-sm">
          <div className="text-xs text-green-700">Ganancia (cliente - chofer)</div>
          <div className="text-2xl font-bold text-green-800">{money(resumen.gan)}</div>
        </div>
      </div>

      {/* Crear + Filtros */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Crear */}
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="font-semibold">Nueva tarifa</div>
            <Badge tone="blue">Vigente</Badge>
          </div>

          <div className="mt-4 space-y-3">
            <div>
              <label className="text-sm font-medium">Cliente</label>
              <select
                className="mt-1 w-full border rounded-xl p-2 text-sm bg-white"
                value={clienteId}
                onChange={e => setClienteId(e.target.value)}
              >
                <option value="">Seleccionar…</option>
                {clientes.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-sm font-medium">Destino</label>
              <input
                className="mt-1 w-full border rounded-xl p-2 text-sm"
                placeholder="Ej: Rosario"
                value={destino}
                onChange={e => setDestino(e.target.value)}
              />
            </div>

            <div>
              <label className="text-sm font-medium">Tipo de unidad</label>
              <select
                className="mt-1 w-full border rounded-xl p-2 text-sm bg-white"
                value={tipoUnidad}
                onChange={e => setTipoUnidad(e.target.value as TipoUnidad)}
              >
                {TIPOS.map(t => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-sm font-medium">Valor cliente</label>
                <input
                  className="mt-1 w-full border rounded-xl p-2 text-sm"
                  inputMode="numeric"
                  placeholder="Ej: 600000"
                  value={valorCliente}
                  onChange={e => setValorCliente(e.target.value)}
                />
              </div>

              <div>
                <label className="text-sm font-medium">Valor chofer</label>
                <input
                  className="mt-1 w-full border rounded-xl p-2 text-sm"
                  inputMode="numeric"
                  placeholder="Ej: 200000"
                  value={valorChofer}
                  onChange={e => setValorChofer(e.target.value)}
                />
              </div>
            </div>

            <button
              onClick={crearTarifa}
              disabled={saving}
              className="w-full rounded-xl bg-blue-600 text-white py-2 text-sm font-medium hover:bg-blue-700 transition active:scale-[0.99] disabled:opacity-50"
            >
              {saving ? 'Guardando…' : 'Crear tarifa'}
            </button>

            <div className="text-xs text-gray-500">
              Tip: la ganancia por tarifa es <b>valor cliente - valor chofer</b>.
            </div>
          </div>
        </div>

        {/* Filtros */}
        <div className="rounded-2xl border bg-white p-4 shadow-sm lg:col-span-2">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="font-semibold">Listado</div>

            <div className="flex items-center gap-2">
              <label className="text-sm text-gray-600 flex items-center gap-2">
                <input
                  type="checkbox"
                  className="accent-blue-600"
                  checked={soloVigentes}
                  onChange={e => setSoloVigentes(e.target.checked)}
                />
                Solo vigentes
              </label>

              <button
                onClick={() => {
                  setQ('')
                  setSoloVigentes(true)
                }}
                className="px-3 py-2 text-sm rounded-xl border bg-white hover:bg-gray-50 transition active:scale-[0.99]"
              >
                Limpiar
              </button>
            </div>
          </div>

          <div className="mt-3">
            <input
              className="w-full border rounded-xl p-2 text-sm"
              placeholder="Buscar por cliente / destino / unidad / valor…"
              value={q}
              onChange={e => setQ(e.target.value)}
            />
          </div>

          <div className="mt-4 overflow-hidden rounded-2xl border">
            {loading ? (
              <div className="p-4 text-sm text-gray-600">Cargando tarifas…</div>
            ) : filtradas.length === 0 ? (
              <div className="p-4 text-sm text-gray-600">No hay tarifas para esos filtros.</div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-600">
                  <tr className="border-b">
                    <th className="text-left p-3 font-medium">Cliente</th>
                    <th className="text-left p-3 font-medium">Destino</th>
                    <th className="text-left p-3 font-medium">Unidad</th>
                    <th className="text-left p-3 font-medium">Cliente $</th>
                    <th className="text-left p-3 font-medium">Chofer $</th>
                    <th className="text-left p-3 font-medium">Ganancia</th>
                    <th className="text-left p-3 font-medium">Estado</th>
                    <th className="text-right p-3 font-medium">Acción</th>
                  </tr>
                </thead>

                <tbody className="divide-y">
                  {filtradas.map(t => {
                    const gan = (t.valor_cliente ?? 0) - (t.valor_chofer ?? 0)

                    return (
                      <tr key={t.id} className="hover:bg-gray-50 transition">
                        <td className="p-3 font-medium">{clienteNombre(t)}</td>
                        <td className="p-3">{t.destino ?? '—'}</td>
                        <td className="p-3">{t.tipo_unidad ?? '—'}</td>
                        <td className="p-3">{money(t.valor_cliente)}</td>
                        <td className="p-3">{money(t.valor_chofer)}</td>
                        <td className="p-3">
                          <span className={gan >= 0 ? 'text-green-700 font-semibold' : 'text-red-700 font-semibold'}>
                            {money(gan)}
                          </span>
                        </td>
                        <td className="p-3">
                          {t.vigente ? <Badge tone="green">Vigente</Badge> : <Badge tone="gray">Inactiva</Badge>}
                        </td>
                        <td className="p-3 text-right">
                          <button
                            onClick={() => toggleVigente(t)}
                            className="px-3 py-2 text-xs rounded-xl border bg-white hover:bg-gray-50 transition active:scale-[0.99]"
                          >
                            {t.vigente ? 'Desactivar' : 'Activar'}
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </div>

          <div className="mt-3 text-xs text-gray-500">
            Se muestran {filtradas.length} tarifa(s). (Hover suave + bordes finitos.)
          </div>
        </div>
      </div>
    </div>
  )
}
