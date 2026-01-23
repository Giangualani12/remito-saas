'use client'

import { useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Cliente = { id: string; nombre: string }

type Tarifa = {
  id: string
  cliente_id: string | null
  destino: string | null
  tipo_unidad: string | null
  valor_cliente: number
  valor_chofer: number
  segundo_viaje_pct: number | null
  activo: boolean
  creado_en: string | null
}

const UNIDADES = ['chasis', 'balancines', 'semis', 'camioneta'] as const

function ars(n: number) {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(n)
}

function cls(...a: (string | false | null | undefined)[]) {
  return a.filter(Boolean).join(' ')
}

function BadgeEstado({ activo }: { activo: boolean }) {
  return (
    <span
      className={cls(
        'text-xs px-2 py-1 rounded-full border font-medium',
        activo ? 'bg-green-50 text-green-700 border-green-200' : 'bg-gray-50 text-gray-700 border-gray-200'
      )}
    >
      {activo ? 'Vigente' : 'Inactiva'}
    </span>
  )
}

export default function AdminTarifasPage() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [clientes, setClientes] = useState<Cliente[]>([])
  const [tarifas, setTarifas] = useState<Tarifa[]>([])

  // Form
  const [clienteId, setClienteId] = useState('')
  const [destino, setDestino] = useState('')
  const [tipoUnidad, setTipoUnidad] = useState('')
  const [valorCliente, setValorCliente] = useState('')
  const [valorChofer, setValorChofer] = useState('')
  const [segundoPct, setSegundoPct] = useState('')

  // Filters
  const [soloVigentes, setSoloVigentes] = useState(true)
  const [q, setQ] = useState('')

  const load = async () => {
    setLoading(true)

    const { data: c, error: ec } = await supabase
      .from('clientes')
      .select('id,nombre')
      .order('nombre', { ascending: true })

    if (!ec) setClientes((c ?? []) as Cliente[])

    let query = supabase
      .from('tarifas')
      .select(
        `
        id,
        cliente_id,
        destino,
        tipo_unidad,
        valor_cliente,
        valor_chofer,
        segundo_viaje_pct,
        activo,
        creado_en
      `
      )
      .order('activo', { ascending: false })
      .order('creado_en', { ascending: false })

    if (soloVigentes) query = query.eq('activo', true)

    const { data, error } = await query

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [soloVigentes])

  const tarifasFiltradas = useMemo(() => {
    if (!q.trim()) return tarifas
    const s = q.trim().toLowerCase()

    return tarifas.filter(t => {
      const cli = clientes.find(c => c.id === t.cliente_id)?.nombre ?? 'General'
      const dest = t.destino ?? 'General'
      const uni = t.tipo_unidad ?? 'General'

      return (
        cli.toLowerCase().includes(s) ||
        dest.toLowerCase().includes(s) ||
        uni.toLowerCase().includes(s) ||
        String(t.valor_cliente).includes(s) ||
        String(t.valor_chofer).includes(s) ||
        String(t.segundo_viaje_pct ?? '').includes(s)
      )
    })
  }, [q, tarifas, clientes])

  const crearTarifa = async () => {
    const vc = Number(valorCliente)
    const vch = Number(valorChofer)

    if (!vc || vc <= 0) return alert('Valor cliente inválido')
    if (!vch || vch <= 0) return alert('Valor chofer inválido')

    setSaving(true)

    const payload: any = {
      cliente_id: clienteId || null,
      destino: destino.trim() ? destino.trim() : null,
      tipo_unidad: tipoUnidad || null,
      valor_cliente: vc,
      valor_chofer: vch,
      segundo_viaje_pct: segundoPct.trim() ? Number(segundoPct) : null,
      activo: true,
    }

    const { error } = await supabase.from('tarifas').insert(payload)

    if (error) {
      alert(error.message)
      setSaving(false)
      return
    }

    setClienteId('')
    setDestino('')
    setTipoUnidad('')
    setValorCliente('')
    setValorChofer('')
    setSegundoPct('')

    await load()
    setSaving(false)
  }

  const toggleActiva = async (t: Tarifa) => {
    const { error } = await supabase.from('tarifas').update({ activo: !t.activo }).eq('id', t.id)

    if (error) {
      alert(error.message)
      return
    }

    await load()
  }

  const limpiar = () => {
    setQ('')
    setSoloVigentes(true)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Tarifas</h1>
          <p className="text-sm text-gray-500">
            Creá tarifas por <b>Cliente / Destino / Unidad</b>. Lo vacío se toma como “General”.
          </p>
          <div className="text-xs text-gray-400 mt-1">Total (según filtro): {tarifasFiltradas.length}</div>
        </div>

        <button
          onClick={load}
          className="border rounded-xl px-4 py-2 text-sm hover:bg-gray-50 active:scale-[0.98] transition"
        >
          Actualizar
        </button>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Crear */}
        <div className="bg-white border rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-semibold">Nueva tarifa</h2>
              <p className="text-xs text-gray-500">Prioridad recomendada: Cliente+Destino+Unidad → Cliente+Destino → General</p>
            </div>
            <span className="text-xs px-2 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
              Alta rápida
            </span>
          </div>

          <div className="mt-4 space-y-3">
            <div>
              <label className="text-xs text-gray-500">Cliente (opcional)</label>
              <select
                value={clienteId}
                onChange={e => setClienteId(e.target.value)}
                className="w-full border rounded-xl p-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
              >
                <option value="">General (sin cliente)</option>
                {clientes.map(c => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-gray-500">Destino (opcional)</label>
              <input
                value={destino}
                onChange={e => setDestino(e.target.value)}
                placeholder="Ej: Rosario (vacío = General)"
                className="w-full border rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
            </div>

            <div>
              <label className="text-xs text-gray-500">Tipo de unidad (opcional)</label>
              <select
                value={tipoUnidad}
                onChange={e => setTipoUnidad(e.target.value)}
                className="w-full border rounded-xl p-3 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-200"
              >
                <option value="">General (sin unidad)</option>
                {UNIDADES.map(u => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <div>
                <label className="text-xs text-gray-500">Valor cliente</label>
                <input
                  value={valorCliente}
                  onChange={e => setValorCliente(e.target.value)}
                  placeholder="Ej: 600000"
                  inputMode="numeric"
                  className="w-full border rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
              </div>

              <div>
                <label className="text-xs text-gray-500">Valor chofer</label>
                <input
                  value={valorChofer}
                  onChange={e => setValorChofer(e.target.value)}
                  placeholder="Ej: 200000"
                  inputMode="numeric"
                  className="w-full border rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
                />
              </div>
            </div>

            <div>
              <label className="text-xs text-gray-500">% Segundo viaje (opcional)</label>
              <input
                value={segundoPct}
                onChange={e => setSegundoPct(e.target.value)}
                placeholder="Ej: 10 (sumar 10%) o -10 (descuento)"
                inputMode="numeric"
                className="w-full border rounded-xl p-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-200"
              />
              <p className="text-xs text-gray-400 mt-1">
                Ejemplo: si ponés <b>10</b> → el 2° viaje suma +10%. Si ponés <b>-10</b> → descuenta 10%.
              </p>
            </div>

            <button
              onClick={crearTarifa}
              disabled={saving}
              className="w-full bg-blue-600 text-white rounded-xl py-3 text-sm font-semibold hover:bg-blue-700 active:scale-[0.98] transition disabled:opacity-60"
            >
              {saving ? 'Creando…' : 'Crear tarifa'}
            </button>
          </div>
        </div>

        {/* Listado */}
        <div className="bg-white border rounded-2xl p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Listado</h2>
              <p className="text-xs text-gray-500">Buscá por cliente, destino, unidad o valores</p>
            </div>

            <div className="flex items-center gap-3">
              <label className="text-sm flex items-center gap-2 select-none">
                <input
                  type="checkbox"
                  checked={soloVigentes}
                  onChange={e => setSoloVigentes(e.target.checked)}
                />
                Solo vigentes
              </label>

              <button
                onClick={limpiar}
                className="border rounded-xl px-3 py-2 text-sm hover:bg-gray-50 active:scale-[0.98] transition"
              >
                Limpiar
              </button>
            </div>
          </div>

          <input
            value={q}
            onChange={e => setQ(e.target.value)}
            className="w-full border rounded-xl p-3 text-sm mt-4 focus:outline-none focus:ring-2 focus:ring-blue-200"
            placeholder="Buscar… (cliente, destino, unidad, valores)"
          />

          <div className="mt-4 border rounded-2xl overflow-hidden">
            {loading ? (
              <div className="p-4 text-sm text-gray-600">Cargando…</div>
            ) : tarifasFiltradas.length === 0 ? (
              <div className="p-4 text-sm text-gray-600">No hay tarifas para ese filtro.</div>
            ) : (
              <div className="overflow-auto">
                <table className="w-full text-sm min-w-[900px]">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="text-left p-3">Cliente</th>
                      <th className="text-left p-3">Destino</th>
                      <th className="text-left p-3">Unidad</th>
                      <th className="text-left p-3">Cliente $</th>
                      <th className="text-left p-3">Chofer $</th>
                      <th className="text-left p-3">% 2°</th>
                      <th className="text-left p-3">Estado</th>
                      <th className="text-right p-3">Acción</th>
                    </tr>
                  </thead>

                  <tbody>
                    {tarifasFiltradas.map(t => {
                      const cli = clientes.find(c => c.id === t.cliente_id)?.nombre ?? 'General'
                      const dest = t.destino ?? 'General'
                      const uni = t.tipo_unidad ?? 'General'

                      return (
                        <tr
                          key={t.id}
                          className="border-b last:border-b-0 hover:bg-gray-50 transition"
                        >
                          <td className="p-3 font-medium">{cli}</td>
                          <td className="p-3">{dest}</td>
                          <td className="p-3">{uni}</td>
                          <td className="p-3">{ars(t.valor_cliente)}</td>
                          <td className="p-3">{ars(t.valor_chofer)}</td>
                          <td className="p-3">{t.segundo_viaje_pct ?? '-'}</td>

                          <td className="p-3">
                            <BadgeEstado activo={t.activo} />
                          </td>

                          <td className="p-3 text-right">
                            <button
                              onClick={() => toggleActiva(t)}
                              className="border rounded-xl px-3 py-2 text-sm hover:bg-gray-50 active:scale-[0.98] transition"
                            >
                              {t.activo ? 'Desactivar' : 'Activar'}
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="text-xs text-gray-400 mt-3">
            Se muestran {tarifasFiltradas.length} tarifa(s).
          </div>
        </div>
      </div>
    </div>
  )
}
