'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type EstadoViaje = 'pendiente' | 'aprobado' | 'facturado' | 'pagado' | 'rechazado'

type ViajeRaw = {
  id: string
  estado: EstadoViaje
  origen: string | null
  destino: string | null
  tipo_unidad: string | null
  creado_en: string
  cliente_id: string | null
  tarifa_id: string | null
  valor_cliente_snapshot: number | null
  valor_chofer_snapshot: number | null
  usuarios: any // puede venir objeto o array
  remitos: any[] // array
}

type Viaje = {
  id: string
  estado: EstadoViaje
  origen: string | null
  destino: string | null
  tipo_unidad: string | null
  creado_en: string
  cliente_id: string | null
  tarifa_id: string | null
  valor_cliente_snapshot: number | null
  valor_chofer_snapshot: number | null
  chofer_nombre: string | null
  remito_numero: string | null
  remito_archivo_url: string | null
  remito_fecha: string | null
}

type Cliente = { id: string; nombre: string }

type Tarifa = {
  id: string
  origen: string | null
  destino: string | null
  tipo_unidad: string
  valor_cliente: number
  valor_chofer: number
}

function EstadoBadge({ estado }: { estado: EstadoViaje }) {
  const map: Record<EstadoViaje, string> = {
    pendiente: 'bg-yellow-100 text-yellow-800',
    aprobado: 'bg-blue-100 text-blue-800',
    facturado: 'bg-purple-100 text-purple-800',
    pagado: 'bg-green-100 text-green-800',
    rechazado: 'bg-red-100 text-red-800',
  }
  return <span className={`px-2 py-1 rounded text-xs font-medium ${map[estado]}`}>{estado}</span>
}

function normalizeViaje(data: ViajeRaw): Viaje {
  const u = Array.isArray(data.usuarios) ? data.usuarios[0] : data.usuarios
  const r = Array.isArray(data.remitos) ? data.remitos[0] : null

  return {
    id: data.id,
    estado: data.estado,
    origen: data.origen ?? null,
    destino: data.destino ?? null,
    tipo_unidad: data.tipo_unidad ?? null,
    creado_en: data.creado_en,
    cliente_id: data.cliente_id ?? null,
    tarifa_id: data.tarifa_id ?? null,
    valor_cliente_snapshot: data.valor_cliente_snapshot ?? null,
    valor_chofer_snapshot: data.valor_chofer_snapshot ?? null,
    chofer_nombre: u?.nombre ?? null,
    remito_numero: r?.numero_remito ?? null,
    remito_archivo_url: r?.archivo_url ?? null,
    remito_fecha: r?.fecha_viaje ?? null,
  }
}

export default function AdminViajeDetallePage() {
  const { id } = useParams()
  const viajeId = id as string

  const [viaje, setViaje] = useState<Viaje | null>(null)
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [tarifas, setTarifas] = useState<Tarifa[]>([])
  const [loading, setLoading] = useState(true)

  const load = async () => {
    setLoading(true)

    const { data, error } = await supabase
      .from('viajes')
      .select(
        `
        id,
        estado,
        origen,
        destino,
        tipo_unidad,
        creado_en,
        cliente_id,
        tarifa_id,
        valor_cliente_snapshot,
        valor_chofer_snapshot,
        usuarios:chofer_id ( nombre ),
        remitos ( numero_remito, archivo_url, fecha_viaje )
      `
      )
      .eq('id', viajeId)
      .single()

    if (error) {
      alert(error.message)
      setLoading(false)
      return
    }

    setViaje(normalizeViaje(data as ViajeRaw))

    const { data: clientesData, error: e2 } = await supabase
      .from('clientes')
      .select('id, nombre')
      .order('nombre')

    if (e2) alert(e2.message)
    setClientes((clientesData ?? []) as Cliente[])

    setLoading(false)
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viajeId])

  // tarifas por cliente
  useEffect(() => {
    if (!viaje?.cliente_id) {
      setTarifas([])
      return
    }

    supabase
      .from('tarifas')
      .select('id, origen, destino, tipo_unidad, valor_cliente, valor_chofer')
      .eq('cliente_id', viaje.cliente_id)
      .eq('vigente', true)
      .order('creado_en', { ascending: false })
      .then(({ data, error }) => {
        if (error) alert(error.message)
        setTarifas((data ?? []) as Tarifa[])
      })
  }, [viaje?.cliente_id])

  const verArchivo = async (archivo_url: string) => {
    // si ya es URL completa, abrimos directo
    if (/^https?:\/\//i.test(archivo_url)) {
      window.open(archivo_url, '_blank')
      return
    }

    // si es path del bucket
    const { data, error } = await supabase.storage.from('remitos').createSignedUrl(archivo_url, 300)
    if (error) {
      alert(error.message)
      return
    }
    window.open(data.signedUrl, '_blank')
  }

  const asignarCliente = async (clienteId: string) => {
    const { error } = await supabase
      .from('viajes')
      .update({
        cliente_id: clienteId || null,
        tarifa_id: null,
        valor_cliente_snapshot: null,
        valor_chofer_snapshot: null,
      })
      .eq('id', viajeId)

    if (error) {
      alert(error.message)
      return
    }

    setViaje(v =>
      v
        ? {
            ...v,
            cliente_id: clienteId || null,
            tarifa_id: null,
            valor_cliente_snapshot: null,
            valor_chofer_snapshot: null,
          }
        : v
    )
  }

  const asignarTarifa = async (t: Tarifa) => {
    const { error } = await supabase.rpc('aplicar_tarifa_a_viaje', {
      p_viaje_id: viajeId,
      p_tarifa_id: t.id,
    })

    if (error) {
      alert(error.message)
      return
    }

    setViaje(v =>
      v
        ? {
            ...v,
            tarifa_id: t.id,
            valor_cliente_snapshot: t.valor_cliente,
            valor_chofer_snapshot: t.valor_chofer,
          }
        : v
    )
  }

  const cambiarEstado = async (nuevoEstado: EstadoViaje) => {
    const { error } = await supabase.rpc('cambiar_estado_viaje', {
      p_viaje_id: viajeId,
      p_estado: nuevoEstado,
    })

    if (error) {
      alert(error.message) // muestra el error real (permiso/validación)
      return
    }

    setViaje(v => (v ? { ...v, estado: nuevoEstado } : v))
  }

  if (loading) return <div>Cargando…</div>
  if (!viaje) return <div>Viaje no encontrado</div>

  const puedeFacturar =
    viaje.estado === 'aprobado' &&
    viaje.cliente_id &&
    viaje.valor_cliente_snapshot != null &&
    viaje.valor_chofer_snapshot != null

  const puedePagar = viaje.estado === 'facturado'
  const puedeAprobar = viaje.estado === 'pendiente'
  const puedeRechazar = viaje.estado === 'pendiente' || viaje.estado === 'aprobado'

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <h1 className="text-2xl font-bold">Detalle del viaje</h1>
        <button onClick={load} className="border rounded px-3 py-2 text-sm hover:bg-gray-50">
          Actualizar
        </button>
      </div>

      {/* INFO */}
      <div className="bg-white border rounded p-4 space-y-2">
        <div><b>Chofer:</b> {viaje.chofer_nombre ?? '-'}</div>
        <div><b>Ruta:</b> {(viaje.origen ?? '-') + ' → ' + (viaje.destino ?? '-')}</div>
        <div><b>Unidad:</b> {viaje.tipo_unidad ?? '-'}</div>
        <div className="flex items-center gap-2">
          <b>Estado:</b> <EstadoBadge estado={viaje.estado} />
        </div>
        <div><b>Creado:</b> {new Date(viaje.creado_en).toLocaleString()}</div>
      </div>

      {/* REMITO */}
      <div className="bg-white border rounded p-4">
        <b>Remito</b>

        {viaje.remito_numero ? (
          <div className="mt-2 space-y-1">
            <div className="text-sm">
              <b>Número:</b> {viaje.remito_numero}
            </div>
            <div className="text-sm text-gray-600">
              {viaje.remito_fecha ? new Date(viaje.remito_fecha).toLocaleDateString() : ''}
            </div>

            {viaje.remito_archivo_url ? (
              <button
                onClick={() => verArchivo(viaje.remito_archivo_url!)}
                className="text-blue-600 underline text-sm"
              >
                Ver archivo
              </button>
            ) : (
              <div className="text-sm text-gray-500">Sin archivo</div>
            )}
          </div>
        ) : (
          <div className="text-sm text-gray-500 mt-1">Sin remito</div>
        )}
      </div>

      {/* CLIENTE */}
      <div className="bg-white border rounded p-4">
        <b>Cliente</b>
        <select
          value={viaje.cliente_id ?? ''}
          onChange={e => asignarCliente(e.target.value)}
          className="block mt-2 border rounded p-2 text-sm"
        >
          <option value="">Seleccionar cliente</option>
          {clientes.map(c => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
      </div>

      {/* TARIFA */}
      <div className="bg-white border rounded p-4">
        <b>Tarifa</b>

        {!viaje.cliente_id ? (
          <div className="text-sm text-gray-500 mt-1">Seleccioná un cliente primero</div>
        ) : tarifas.length === 0 ? (
          <div className="text-sm text-gray-500 mt-1">No hay tarifas vigentes para este cliente</div>
        ) : (
          <div className="space-y-2 mt-2">
            {tarifas.map(t => (
              <button
                key={t.id}
                onClick={() => asignarTarifa(t)}
                className="block w-full text-left border rounded p-2 text-sm hover:bg-gray-50"
              >
                {(t.origen ?? '-') + ' → ' + (t.destino ?? '-')}{' '}
                · {t.tipo_unidad} — Cliente ${t.valor_cliente.toLocaleString()} / Chofer $
                {t.valor_chofer.toLocaleString()}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ACCIONES */}
      <div className="bg-white border rounded p-4 space-y-2">
        <b>Acciones</b>

        <div className="flex gap-2 flex-wrap">
          <button
            disabled={!puedeAprobar}
            onClick={() => cambiarEstado('aprobado')}
            className="border px-3 py-2 rounded text-sm disabled:opacity-50"
          >
            Aprobar
          </button>

          <button
            disabled={!puedeFacturar}
            onClick={() => cambiarEstado('facturado')}
            className="bg-blue-600 text-white px-3 py-2 rounded text-sm disabled:opacity-50"
          >
            Facturar
          </button>

          <button
            disabled={!puedePagar}
            onClick={() => cambiarEstado('pagado')}
            className="border px-3 py-2 rounded text-sm disabled:opacity-50"
          >
            Marcar pagado
          </button>

          <button
            disabled={!puedeRechazar}
            onClick={() => cambiarEstado('rechazado')}
            className="border px-3 py-2 rounded text-sm text-red-600 disabled:opacity-50"
          >
            Rechazar
          </button>
        </div>

        {!puedeFacturar && viaje.estado === 'aprobado' && (
          <div className="text-xs text-red-600">Para facturar necesitás cliente y tarifa.</div>
        )}
      </div>
    </div>
  )
}

