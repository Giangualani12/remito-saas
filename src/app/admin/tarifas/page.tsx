'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Tarifa = {
  id: string
  destino: string | null
  valor_cliente: number | null
  valor_chofer: number | null
  vigente: boolean
  creado_en: string
}

function money(n: number | null | undefined) {
  const v = Number(n ?? 0)
  return `$${v.toLocaleString('es-AR')}`
}

function Badge({
  children,
  tone = 'gray',
}: {
  children: React.ReactNode
  tone?: 'green' | 'gray'
}) {
  const map: Record<string, string> = {
    green: 'bg-green-50 text-green-700 ring-green-200',
    gray: 'bg-gray-50 text-gray-700 ring-gray-200',
  }

  return (
    <span
      className={`inline-flex items-center px-2 py-1 text-xs font-medium rounded-full ring-1 ${map[tone]}`}
    >
      {children}
    </span>
  )
}

export default function AdminTarifasPage() {
  const [tarifas, setTarifas] = useState<Tarifa[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // form (solo 3 campos)
  const [destino, setDestino] = useState('')
  const [valorCliente, setValorCliente] = useState('')
  const [valorChofer, setValorChofer] = useState('')

  // filtros
  const [q, setQ] = useState('')
  const [soloVigentes, setSoloVigentes] = useState(true)

  const load = async () => {
    setLoading(true)

    const { data, error } = await supabase
      .from('tarifas')
      .select('id, destino, valor_cliente, valor_chofer, vigente, creado_en')
      .order('creado_en', { ascending: false })

    if (error) {
      alert(error.message)
      setTarifas([])
      setLoading(false)
      return
    }

    setTarifas((data ?? []) as Tarifa[])
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

      const d = (t.destino ?? 'general').toLowerCase()
      return (
        d.includes(qq) ||
        String(t.valor_cliente ?? '').includes(qq) ||
        String(t.valor_chofer ?? '').includes(qq)
      )
    })
  }, [tarifas, q, soloVigentes])

  const total = useMemo(() => filtradas.length, [filtradas])

  const crearTarifa = async () => {
    const vc = Number(valorCliente)
    const vch = Number(valorChofer)

    if (!Number.isFinite(vc) || vc <= 0) return alert('Valor cliente inválido')
    if (!Number.isFinite(vch) || vch < 0) return alert('Valor chofer inválido')

    setSaving(true)

    const { data, error } = await supabase
      .from('tarifas')
      .insert({
        destino: destino.trim() || null, // ✅ opcional (null = general)
        tipo_unidad: null, // ✅ ya no se usa
        cliente_id: null, // ✅ ya no se usa
        valor_cliente: vc,
        valor_chofer: vch,
        vigente: true,
      })
      .select('id, destino, valor_cliente, valor_chofer, vigente, creado_en')
      .single()

    if (error) {
      alert(error.message)
      setSaving(false)
      return
    }

    setTarifas(prev => [data as Tarifa, ...prev])
    setDestino('')
    setValorCliente('')
    setValorChofer('')
    setSaving(false)
  }

  const toggleVigente = async (t: Tarifa) => {
    const next = !t.vigente

    const { error } = await supabase
      .from('tarifas')
      .update({ vigente: next })
      .eq('id', t.id)

    if (error) return alert(error.message)

    setTarifas(prev =>
      prev.map(x => (x.id === t.id ? { ...x, vigente: next } : x))
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tarifas</h1>
          <p className="text-sm text-gray-500">
            Cargás destino (opcional) + valores (cliente / transportista)
          </p>
          <div className="text-xs text-gray-400 mt-1">
            Total (según filtros): {total}
          </div>
        </div>

        <button
          onClick={load}
          className="px-3 py-2 text-sm rounded-xl border bg-white hover:bg-gray-50 transition active:scale-[0.99]"
        >
          Actualizar
        </button>
      </div>

      {/* Crear + Listado */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Crear */}
        <div className="rounded-2xl border bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between">
            <div className="font-semibold">Nueva tarifa</div>
            <Badge tone="green">Vigente</Badge>
          </div>

          <div className="mt-4 space-y-3">
            <div>
              <label className="text-sm font-medium">
                Destino <span className="text-gray-400">(opcional)</span>
              </label>
              <input
                className="mt-1 w-full border rounded-xl p-2 text-sm"
                placeholder="Ej: Rosario (o vacío = General)"
                value={destino}
                onChange={e => setDestino(e.target.value)}
              />
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
              Tip: si dejás destino vacío, es una tarifa <b>General</b>.
            </div>
          </div>
        </div>

        {/* Listado */}
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
              placeholder="Buscar por destino o valor…"
              value={q}
              onChange={e => setQ(e.target.value)}
            />
          </div>

          <div className="mt-4 overflow-hidden rounded-2xl border">
            {loading ? (
              <div className="p-4 text-sm text-gray-600">Cargando tarifas…</div>
            ) : filtradas.length === 0 ? (
              <div className="p-4 text-sm text-gray-600">
                No hay tarifas para esos filtros.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="bg-gray-50 text-gray-600">
                  <tr className="border-b">
                    <th className="text-left p-3 font-medium">Destino</th>
                    <th className="text-left p-3 font-medium">Cliente $</th>
                    <th className="text-left p-3 font-medium">Transportista  $</th>
                    <th className="text-left p-3 font-medium">Estado</th>
                    <th className="text-right p-3 font-medium">Acción</th>
                  </tr>
                </thead>

                <tbody className="divide-y">
                  {filtradas.map(t => (
                    <tr key={t.id} className="hover:bg-gray-50 transition">
                      <td className="p-3 font-medium">
                        {t.destino ?? 'General'}
                      </td>
                      <td className="p-3">{money(t.valor_cliente)}</td>
                      <td className="p-3">{money(t.valor_chofer)}</td>
                      <td className="p-3">
                        {t.vigente ? (
                          <Badge tone="green">Vigente</Badge>
                        ) : (
                          <Badge tone="gray">Inactiva</Badge>
                        )}
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
                  ))}
                </tbody>
              </table>
            )}
          </div>

          <div className="mt-3 text-xs text-gray-500">
            Se muestran {filtradas.length} tarifa(s).
          </div>
        </div>
      </div>
    </div>
  )
}
