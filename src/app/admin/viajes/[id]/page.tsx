'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import { supabase } from '@/lib/supabase'

type EstadoViaje = 'pendiente' | 'aprobado' | 'facturado' | 'pagado' | 'rechazado'

type ViajeDetalle = {
  viaje_id: string
  estado: EstadoViaje

  chofer_id: string | null
  transportista_nombre: string | null
  transportista_email: string | null

  origen: string | null
  destino: string | null
  tipo_unidad: string | null

  creado_en: string | null

  // Chofer real (desde view)
  chofer_real_id: string | null
  chofer_real_nombre: string | null

  // Remito (desde view)
  numero_remito: string | null
  fecha_viaje: string | null
  archivo_url: string | null

  // Cliente/Tarifa
  cliente_id: string | null
  tarifa_id: string | null
  valor_cliente_snapshot: number | null
  valor_chofer_snapshot: number | null
}

type Cliente = {
  id: string
  nombre: string
}

type Tarifa = {
  id: string
  cliente_id: string | null
  origen: string | null
  destino: string | null
  tipo_unidad: string | null
  valor_cliente: number
  valor_chofer: number
}

type ChoferReal = {
  id: string
  nombre: string
  transportista_id: string
  activo: boolean
}

function Badge({ estado }: { estado: EstadoViaje }) {
  const map: Record<EstadoViaje, string> = {
    pendiente: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    aprobado: 'bg-blue-100 text-blue-800 border-blue-200',
    facturado: 'bg-purple-100 text-purple-800 border-purple-200',
    pagado: 'bg-green-100 text-green-800 border-green-200',
    rechazado: 'bg-red-100 text-red-800 border-red-200',
  }

  return (
    <span className={`px-3 py-1 rounded-full text-xs font-medium border ${map[estado]}`}>
      {estado}
    </span>
  )
}

function Card({
  title,
  subtitle,
  right,
  children,
}: {
  title: string
  subtitle?: string
  right?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <motion.div
      layout
      className="bg-white border rounded-2xl p-5 shadow-sm"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <div className="text-base font-semibold">{title}</div>
          {subtitle && <div className="text-xs text-gray-500 mt-0.5">{subtitle}</div>}
        </div>
        {right}
      </div>
      {children}
    </motion.div>
  )
}

export default function AdminViajeDetallePage() {
  const params = useParams<{ id: string }>()
  const viajeId = params.id

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [viaje, setViaje] = useState<ViajeDetalle | null>(null)

  const [clientes, setClientes] = useState<Cliente[]>([])
  const [tarifas, setTarifas] = useState<Tarifa[]>([])

  const [choferesReales, setChoferesReales] = useState<ChoferReal[]>([])
  const [choferRealSelected, setChoferRealSelected] = useState<string>('')

  const [clienteSelected, setClienteSelected] = useState<string>('')

  const load = async () => {
    setLoading(true)

    // ✅ 1) Viaje (de la view)
    const { data: vData, error: vErr } = await supabase
      .from('viajes_listado')
      .select(
        `
        viaje_id,
        estado,
        origen,
        destino,
        tipo_unidad,
        creado_en,
        chofer_id,
        transportista_nombre,
        transportista_email,

        chofer_real_id,
        chofer_real_nombre,

        numero_remito,
        fecha_viaje,
        archivo_url,

        cliente_id,
        tarifa_id,
        valor_cliente_snapshot,
        valor_chofer_snapshot
      `
      )
      .eq('viaje_id', viajeId)
      .single()

    if (vErr) {
      alert(vErr.message)
      setViaje(null)
      setLoading(false)
      return
    }

    const vv = vData as ViajeDetalle
    setViaje(vv)

    // ✅ estados iniciales
    setClienteSelected(vv.cliente_id ?? '')
    setChoferRealSelected(vv.chofer_real_id ?? '')

    // ✅ 2) Clientes
    const { data: cData } = await supabase.from('clientes').select('id, nombre').order('creado_en', { ascending: false })
    setClientes((cData ?? []) as Cliente[])

    // ✅ 3) Choferes reales (por transportista dueño del viaje)
    if (vv.chofer_id) {
      const { data: crData } = await supabase
        .from('choferes_transportista')
        .select('id, nombre, transportista_id, activo')
        .eq('transportista_id', vv.chofer_id)
        .eq('activo', true)
        .order('creado_en', { ascending: false })

      setChoferesReales((crData ?? []) as ChoferReal[])
    } else {
      setChoferesReales([])
    }

    // ✅ 4) Tarifas (si ya hay cliente o si elegimos uno después)
    if (vv.cliente_id) {
      const { data: tData } = await supabase
        .from('tarifas')
        .select('id, cliente_id, origen, destino, tipo_unidad, valor_cliente, valor_chofer')
        .eq('cliente_id', vv.cliente_id)
        .eq('vigente', true)
        .order('creado_en', { ascending: false })

      setTarifas((tData ?? []) as Tarifa[])
    } else {
      setTarifas([])
    }

    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viajeId])

  // ✅ cuando cambia cliente, recargar tarifas de ese cliente
  useEffect(() => {
    const run = async () => {
      if (!clienteSelected) {
        setTarifas([])
        return
      }
      const { data: tData, error } = await supabase
        .from('tarifas')
        .select('id, cliente_id, origen, destino, tipo_unidad, valor_cliente, valor_chofer')
        .eq('cliente_id', clienteSelected)
        .eq('vigente', true)
        .order('creado_en', { ascending: false })

      if (error) {
        alert(error.message)
        setTarifas([])
        return
      }
      setTarifas((tData ?? []) as Tarifa[])
    }
    run()
  }, [clienteSelected])

  const fechaCreado = useMemo(() => {
    if (!viaje?.creado_en) return '-'
    return new Date(viaje.creado_en).toLocaleString()
  }, [viaje?.creado_en])

  const archivoOk = Boolean(viaje?.archivo_url)

  const guardarChoferReal = async () => {
    if (!viaje) return

    setSaving(true)
    const { error } = await supabase
      .from('viajes')
      .update({ chofer_real_id: choferRealSelected || null })
      .eq('id', viaje.viaje_id)

    setSaving(false)

    if (error) return alert(error.message)
    await load()
  }

  const guardarCliente = async () => {
    if (!viaje) return

    setSaving(true)
    const { error } = await supabase
      .from('viajes')
      .update({ cliente_id: clienteSelected || null })
      .eq('id', viaje.viaje_id)

    setSaving(false)

    if (error) return alert(error.message)
    await load()
  }

  const aplicarTarifa = async (tarifaId: string) => {
    if (!viaje) return

    setSaving(true)
    const { error } = await supabase.rpc('aplicar_tarifa_a_viaje', {
      p_viaje_id: viaje.viaje_id,
      p_tarifa_id: tarifaId,
    })
    setSaving(false)

    if (error) return alert(error.message)
    await load()
  }

  const cambiarEstado = async (estado: EstadoViaje) => {
    if (!viaje) return

    setSaving(true)
    const { error } = await supabase.rpc('cambiar_estado_viaje', {
      p_viaje_id: viaje.viaje_id,
      p_estado: estado,
    })
    setSaving(false)

    if (error) return alert(error.message)
    await load()
  }

  const marcarPagado = async () => {
    if (!viaje) return

    setSaving(true)
    const { error } = await supabase.rpc('registrar_pago_transportista', {
      p_viaje_id: viaje.viaje_id,
    })
    setSaving(false)

    if (error) return alert(error.message)
    await load()
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-6 w-48 rounded bg-gray-100 animate-pulse" />
        <div className="h-32 rounded-2xl bg-gray-100 animate-pulse" />
        <div className="h-32 rounded-2xl bg-gray-100 animate-pulse" />
        <div className="h-32 rounded-2xl bg-gray-100 animate-pulse" />
      </div>
    )
  }

  if (!viaje) return <div className="text-sm text-gray-600">No se encontró el viaje.</div>

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Detalle del viaje</h1>
          <p className="text-sm text-gray-500">Gestión del viaje, remito, cliente, tarifa y estado</p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={load}
            className="border rounded-xl px-3 py-2 text-sm hover:bg-gray-50 active:scale-[0.98] transition"
          >
            Actualizar
          </button>
        </div>
      </div>

      {/* Top Card */}
      <Card
        title="Resumen"
        subtitle={`ID: ${viaje.viaje_id}`}
        right={<Badge estado={viaje.estado} />}
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Transportista */}
          <div className="border rounded-2xl p-4">
            <div className="text-xs text-gray-500">Transportista</div>
            <div className="text-sm font-semibold mt-1">{viaje.transportista_nombre ?? '-'}</div>
            <div className="text-xs text-gray-500">{viaje.transportista_email ?? '-'}</div>

            <div className="mt-3 border rounded-2xl p-3 bg-gray-50">
              <div className="text-xs text-gray-500 mb-1">Chofer real</div>

              <div className="flex items-center gap-2">
                <select
                  value={choferRealSelected}
                  onChange={e => setChoferRealSelected(e.target.value)}
                  className="flex-1 border rounded-xl p-2 text-sm bg-white"
                >
                  <option value="">— Sin chofer real —</option>
                  {choferesReales.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>

                <button
                  disabled={saving}
                  onClick={guardarChoferReal}
                  className={`border rounded-xl px-3 py-2 text-sm transition active:scale-[0.98] ${
                    saving ? 'opacity-60 cursor-not-allowed' : 'hover:bg-gray-50'
                  }`}
                >
                  Guardar
                </button>
              </div>

              <div className="text-xs text-gray-500 mt-2">
                Actual: <span className="text-gray-700">{viaje.chofer_real_nombre ?? '—'}</span>
              </div>
            </div>
          </div>

          {/* Ruta */}
          <div className="border rounded-2xl p-4">
            <div className="text-xs text-gray-500">Ruta</div>
            <div className="text-sm font-semibold mt-1">
              {(viaje.origen ?? 'General') + ' → ' + (viaje.destino ?? '-')}
            </div>

            <div className="mt-3 text-xs text-gray-500">Unidad</div>
            <div className="text-sm font-medium">{viaje.tipo_unidad ?? '-'}</div>

            <div className="mt-3 text-xs text-gray-500">Creado</div>
            <div className="text-sm">{fechaCreado}</div>
          </div>
        </div>
      </Card>

      {/* Remito */}
      <Card title="Remito" subtitle="Datos del remito asociado al viaje" right={<span className="text-xs text-gray-400">{archivoOk ? 'Archivo disponible' : 'Sin archivo'}</span>}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div className="border rounded-2xl p-3">
            <div className="text-xs text-gray-500">Número</div>
            <div className="text-sm font-semibold mt-1">{viaje.numero_remito ?? '—'}</div>
          </div>

          <div className="border rounded-2xl p-3">
            <div className="text-xs text-gray-500">Fecha del viaje</div>
            <div className="text-sm font-semibold mt-1">{viaje.fecha_viaje ?? '—'}</div>
          </div>

          <div className="border rounded-2xl p-3 flex items-center justify-between gap-2">
            <div>
              <div className="text-xs text-gray-500">Archivo</div>
              <div className="text-sm font-semibold mt-1">
                {archivoOk ? (
                  <span className="text-green-700">Cargado ✅</span>
                ) : (
                  <span className="text-red-600">No cargado ❌</span>
                )}
              </div>
            </div>

            {archivoOk && (
              <button
                onClick={() => window.open(viaje.archivo_url!, '_blank')}
                className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm hover:bg-blue-700 active:scale-[0.98] transition"
              >
                Ver remito
              </button>
            )}
          </div>
        </div>
      </Card>

      {/* Cliente */}
      <Card title="Cliente" subtitle="Seleccioná el cliente para poder asignar tarifas y facturar">
        <div className="flex items-center gap-2">
          <select
            value={clienteSelected}
            onChange={e => setClienteSelected(e.target.value)}
            className="flex-1 border rounded-xl p-2 text-sm bg-white"
          >
            <option value="">Seleccionar cliente…</option>
            {clientes.map(c => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>

          <button
            disabled={saving}
            onClick={guardarCliente}
            className={`border rounded-xl px-3 py-2 text-sm transition active:scale-[0.98] ${
              saving ? 'opacity-60 cursor-not-allowed' : 'hover:bg-gray-50'
            }`}
          >
            Guardar
          </button>
        </div>

        <div className="text-xs text-gray-500 mt-2">
          Tip: si tenés muchos clientes, no te preocupes: esto queda listo para facturar bien.
        </div>
      </Card>

      {/* Tarifa */}
      <Card
        title="Tarifa"
        subtitle={clienteSelected ? 'Elegí una tarifa vigente para ese cliente.' : 'Primero elegí un cliente.'}
        right={
          viaje.tarifa_id ? (
            <span className="text-xs px-3 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-100">
              Tarifa seleccionada
            </span>
          ) : (
            <span className="text-xs text-gray-400">Sin tarifa</span>
          )
        }
      >
        {!clienteSelected ? (
          <div className="text-sm text-gray-600">Elegí un cliente arriba para ver tarifas.</div>
        ) : tarifas.length === 0 ? (
          <div className="text-sm text-gray-600">No hay tarifas vigentes para este cliente.</div>
        ) : (
          <div className="space-y-2">
            {tarifas.map(t => {
              const selected = viaje.tarifa_id === t.id
              return (
                <motion.div
                  key={t.id}
                  layout
                  className={`border rounded-2xl p-4 flex items-center justify-between gap-3 transition ${
                    selected ? 'border-blue-300 bg-blue-50/40' : 'hover:bg-gray-50'
                  }`}
                >
                  <div className="min-w-0">
                    <div className="font-semibold text-sm">
                      {(t.origen ?? 'General') + ' · ' + (t.tipo_unidad ?? '-')}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      Destino: <span className="text-gray-700">{t.destino ?? '-'}</span>
                    </div>

                    <div className="text-xs text-gray-500 mt-1">
                      Cliente paga: <span className="text-gray-700">${t.valor_cliente}</span> · Transportista: <span className="text-gray-700">${t.valor_chofer}</span>
                    </div>
                  </div>

                  <button
                    disabled={saving}
                    onClick={() => aplicarTarifa(t.id)}
                    className={`px-4 py-2 rounded-xl text-sm transition active:scale-[0.98] ${
                      selected
                        ? 'bg-white border border-blue-200 text-blue-700'
                        : 'bg-gray-100 hover:bg-gray-200 text-gray-800'
                    }`}
                  >
                    Elegir
                  </button>
                </motion.div>
              )
            })}
          </div>
        )}
      </Card>

      {/* Acciones */}
      <Card title="Acciones" subtitle="Control de estados del viaje (admin)">
        <div className="flex flex-wrap gap-2">
          <button
            disabled={saving}
            onClick={() => cambiarEstado('aprobado')}
            className="px-4 py-2 rounded-xl text-sm bg-blue-600 text-white hover:bg-blue-700 active:scale-[0.98] transition"
          >
            Aprobar
          </button>

          <button
            disabled={saving}
            onClick={() => cambiarEstado('facturado')}
            className="px-4 py-2 rounded-xl text-sm bg-purple-600 text-white hover:bg-purple-700 active:scale-[0.98] transition"
          >
            Facturar
          </button>

          <button
            disabled={saving}
            onClick={marcarPagado}
            className="px-4 py-2 rounded-xl text-sm bg-gray-900 text-white hover:bg-black active:scale-[0.98] transition"
          >
            Marcar pagado
          </button>

          <button
            disabled={saving}
            onClick={() => cambiarEstado('rechazado')}
            className="px-4 py-2 rounded-xl text-sm bg-red-600 text-white hover:bg-red-700 active:scale-[0.98] transition"
          >
            Rechazar
          </button>

          <AnimatePresence>
            {saving && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6 }}
                className="ml-auto text-sm text-gray-500 flex items-center gap-2"
              >
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500 animate-pulse" />
                Guardando…
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Snapshots */}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="border rounded-2xl p-3">
            <div className="text-xs text-gray-500">Snapshot Cliente</div>
            <div className="text-sm font-semibold mt-1">${viaje.valor_cliente_snapshot ?? '—'}</div>
          </div>

          <div className="border rounded-2xl p-3">
            <div className="text-xs text-gray-500">Snapshot Transportista</div>
            <div className="text-sm font-semibold mt-1">${viaje.valor_chofer_snapshot ?? '—'}</div>
          </div>
        </div>
      </Card>
    </motion.div>
  )
}
