'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'

type EstadoViaje = 'pendiente' | 'aprobado' | 'facturado' | 'pagado' | 'rechazado'

type Viaje = {
  id: string
  estado: EstadoViaje
  origen: string | null
  destino: string | null
  tipo_unidad: string | null
  creado_en: string | null

  // dueño del viaje (transportista)
  chofer_id: string

  // chofer real (texto simple, viene del remito)
  chofer_nombre: string | null

  // para facturar
  cliente_id: string | null
  tarifa_id: string | null

  valor_cliente_snapshot: number | null
  valor_chofer_snapshot: number | null
}

type Usuario = {
  id: string
  nombre: string | null
  email: string | null
}

type Remito = {
  id: string
  viaje_id: string
  numero_remito: string | null
  fecha_viaje: string | null
  archivo_url: string | null // puede ser URL o PATH
}

type Cliente = {
  id: string
  nombre: string
}

type Tarifa = {
  id: string
  destino: string
  tipo_unidad: string
  valor_cliente: number
  valor_chofer: number
  vigente: boolean
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
    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border ${map[estado]} transition`}>
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
    <div className="bg-white border rounded-2xl p-5 shadow-sm hover:shadow-md transition-all duration-200">
      <div className="flex items-start justify-between gap-4 mb-3">
        <div>
          <h3 className="text-base font-bold">{title}</h3>
          {subtitle ? <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p> : null}
        </div>
        {right}
      </div>
      {children}
    </div>
  )
}

function fmtFecha(fechaISO: string | null) {
  if (!fechaISO) return '-'
  try {
    return new Date(fechaISO).toLocaleDateString()
  } catch {
    return fechaISO
  }
}

/**
 * Si guardaste archivo_url como:
 *  - URL completa (https://xxx.supabase.co/storage/v1/object/public/remitos/....)
 *  - o como PATH (userId/viajeId/archivo.jpg)
 * Acá lo normalizamos a PATH para crear Signed URL.
 */
function extractStoragePath(urlOrPath: string): string {
  // si ya es path tipo "uuid/viaje/archivo.pdf"
  if (!urlOrPath.startsWith('http')) return urlOrPath

  // casos típicos:
  // .../object/public/remitos/<PATH>
  // .../object/sign/remitos/<PATH>
  const idx = urlOrPath.indexOf('/remitos/')
  if (idx !== -1) return urlOrPath.slice(idx + '/remitos/'.length)

  // fallback: devuelve todo (no ideal)
  return urlOrPath
}

export default function ViajeDetalleAdminPage() {
  const params = useParams()
  const viajeId = params?.id as string

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  const [viaje, setViaje] = useState<Viaje | null>(null)
  const [transportista, setTransportista] = useState<Usuario | null>(null)
  const [remito, setRemito] = useState<Remito | null>(null)

  const [clientes, setClientes] = useState<Cliente[]>([])
  const [tarifas, setTarifas] = useState<Tarifa[]>([])

  // form states
  const [clienteId, setClienteId] = useState<string>('')
  const [tarifaId, setTarifaId] = useState<string>('')
  const [choferRealNombre, setChoferRealNombre] = useState<string>('')

  const estado = viaje?.estado ?? 'pendiente'

  const load = async () => {
    setLoading(true)

    // 1) Viaje
    const { data: v, error: errV } = await supabase
      .from('viajes')
      .select(
        `
        id,
        estado,
        origen,
        destino,
        tipo_unidad,
        creado_en,
        chofer_id,
        chofer_nombre,
        cliente_id,
        tarifa_id,
        valor_cliente_snapshot,
        valor_chofer_snapshot
      `
      )
      .eq('id', viajeId)
      .maybeSingle()

    if (errV) {
      alert(errV.message)
      setLoading(false)
      return
    }

    if (!v) {
      alert('Viaje no encontrado')
      setLoading(false)
      return
    }

    setViaje(v as Viaje)

    // 2) Transportista (usuario dueño)
    const { data: u, error: errU } = await supabase
      .from('usuarios')
      .select('id, nombre, email')
      .eq('id', (v as Viaje).chofer_id)
      .maybeSingle()

    if (errU) {
      alert(errU.message)
      setLoading(false)
      return
    }
    setTransportista((u ?? null) as Usuario | null)

    // 3) Remito asociado
    const { data: r, error: errR } = await supabase
      .from('remitos')
      .select('id, viaje_id, numero_remito, fecha_viaje, archivo_url')
      .eq('viaje_id', viajeId)
      .maybeSingle()

    if (errR) {
      // no es fatal, puede no haber remito en viajes viejos
      setRemito(null)
    } else {
      setRemito((r ?? null) as Remito | null)
    }

    // 4) Clientes (admin)
    const { data: c, error: errC } = await supabase
      .from('clientes')
      .select('id, nombre')
      .order('creado_en', { ascending: false })

    if (errC) {
      // ojo: si te aparece "violates RLS", es que NO sos admin en usuarios.
      console.error(errC)
    } else {
      setClientes((c ?? []) as Cliente[])
    }

    // inicializar inputs
    const vv = v as Viaje
    setClienteId(vv.cliente_id ?? '')
    setTarifaId(vv.tarifa_id ?? '')
    setChoferRealNombre(vv.chofer_nombre ?? '')

    setLoading(false)
  }

  const loadTarifas = async (cliente_id: string) => {
    if (!cliente_id) {
      setTarifas([])
      return
    }

    const { data, error } = await supabase
      .from('tarifas')
      .select('id, destino, tipo_unidad, valor_cliente, valor_chofer, vigente')
      .eq('cliente_id', cliente_id)
      .eq('vigente', true)
      .order('creado_en', { ascending: false })

    if (error) {
      console.error(error)
      setTarifas([])
      return
    }
    setTarifas((data ?? []) as Tarifa[])
  }

  useEffect(() => {
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viajeId])

  useEffect(() => {
    loadTarifas(clienteId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clienteId])

  // ---------- acciones ----------

  const guardarChoferReal = async () => {
    if (!viaje) return
    setSaving(true)

    const { error } = await supabase
      .from('viajes')
      .update({
        // ✅ acá guardamos texto simple (lo que escribe el chofer)
        chofer_nombre: choferRealNombre?.trim() || null,
      })
      .eq('id', viaje.id)

    if (error) alert(error.message)
    await load()
    setSaving(false)
  }

  const guardarCliente = async () => {
    if (!viaje) return
    setSaving(true)

    const { error } = await supabase
      .from('viajes')
      .update({
        cliente_id: clienteId || null,
        // cuando cambias cliente, reseteo tarifa elegida
        tarifa_id: null,
      })
      .eq('id', viaje.id)

    if (error) alert(error.message)
    await load()
    setSaving(false)
  }

  const aplicarTarifa = async () => {
    if (!viaje) return
    if (!tarifaId) return alert('Elegí una tarifa primero')

    setSaving(true)

    const { error } = await supabase.rpc('aplicar_tarifa_a_viaje', {
      p_viaje_id: viaje.id,
      p_tarifa_id: tarifaId,
    })

    if (error) alert(error.message)
    await load()
    setSaving(false)
  }

  const cambiarEstado = async (nuevo: EstadoViaje) => {
    if (!viaje) return
    setSaving(true)

    const { error } = await supabase.rpc('cambiar_estado_viaje', {
      p_viaje_id: viaje.id,
      p_estado: nuevo,
    })

    if (error) alert(error.message)
    await load()
    setSaving(false)
  }

  const marcarPagado = async () => {
    if (!viaje) return

    setSaving(true)

    const { error } = await supabase.rpc('registrar_pago_transportista', {
      p_viaje_id: viaje.id,
    })

    if (error) {
      alert(error.message)

      /**
       * Si te aparece el error de “Could not choose the best candidate function…”
       * es porque te quedó una función VIEJA con mismo nombre pero otros parámetros.
       * Solución SQL:
       * drop function if exists public.registrar_pago_transportista(uuid,text,text);
       */
    }

    await load()
    setSaving(false)
  }

  const verRemito = async () => {
    if (!remito?.archivo_url) return alert('No hay archivo cargado')

    try {
      const path = extractStoragePath(remito.archivo_url)

      // ✅ SIEMPRE abrir con signed URL (evita 404 cuando el bucket NO es público)
      const { data, error } = await supabase.storage.from('remitos').createSignedUrl(path, 60 * 10)

      if (error) return alert(error.message)
      if (!data?.signedUrl) return alert('No se pudo generar el link')

      window.open(data.signedUrl, '_blank')
    } catch (e: any) {
      alert(e?.message ?? 'Error abriendo remito')
    }
  }

  // ---------- UI ----------

  const headerRuta = useMemo(() => {
    const o = viaje?.origen ?? 'General'
    const d = viaje?.destino ?? '-'
    return `${o} → ${d}`
  }, [viaje?.origen, viaje?.destino])

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-6 w-40 bg-gray-200 rounded animate-pulse" />
        <div className="h-32 bg-gray-100 rounded-2xl animate-pulse" />
        <div className="h-32 bg-gray-100 rounded-2xl animate-pulse" />
        <div className="h-32 bg-gray-100 rounded-2xl animate-pulse" />
      </div>
    )
  }

  if (!viaje) {
    return <div className="text-sm text-gray-600">No se encontró el viaje.</div>
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div className="transition-all duration-200">
          <h1 className="text-2xl font-bold">Detalle del viaje</h1>
          <p className="text-sm text-gray-500">Gestión del viaje, remito, cliente, tarifa y estado</p>
        </div>

        <button
          onClick={load}
          className="border rounded-xl px-4 py-2 text-sm hover:bg-gray-50 transition active:scale-[0.98]"
        >
          Actualizar
        </button>
      </div>

      {/* Resumen */}
      <Card
        title="Resumen"
        subtitle={`ID: ${viaje.id}`}
        right={<Badge estado={estado} />}
      >
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Transportista */}
          <div className="border rounded-2xl p-4 hover:shadow-sm transition">
            <div className="text-xs text-gray-500">Transportista</div>
            <div className="text-sm font-semibold">{transportista?.nombre ?? '-'}</div>
            <div className="text-xs text-gray-500">{transportista?.email ?? '-'}</div>

            {/* ✅ Chofer real = texto cargado al subir remito */}
            <div className="mt-3 p-3 rounded-xl bg-gray-50 border">
              <div className="text-xs text-gray-500 mb-2">Chofer real (el que se cargó al subir remito)</div>

              <div className="flex gap-2">
                <input
                  value={choferRealNombre}
                  onChange={e => setChoferRealNombre(e.target.value)}
                  className="flex-1 border rounded-xl p-2 text-sm bg-white"
                  placeholder="Ej: Juan Pérez"
                />
                <button
                  onClick={guardarChoferReal}
                  disabled={saving}
                  className="border rounded-xl px-3 py-2 text-sm hover:bg-gray-50 transition active:scale-[0.98] disabled:opacity-50"
                >
                  Guardar
                </button>
              </div>

              <div className="text-xs text-gray-500 mt-2">
                Actual: <span className="font-medium">{viaje.chofer_nombre ?? '-'}</span>
              </div>
            </div>
          </div>

          {/* Ruta */}
          <div className="border rounded-2xl p-4 hover:shadow-sm transition">
            <div className="text-xs text-gray-500">Ruta</div>
            <div className="text-sm font-semibold">{headerRuta}</div>

            <div className="mt-2 text-xs text-gray-500">Unidad</div>
            <div className="text-sm font-semibold">{viaje.tipo_unidad ?? '-'}</div>

            <div className="mt-2 text-xs text-gray-500">Creado</div>
            <div className="text-sm font-semibold">{fmtFecha(viaje.creado_en)}</div>
          </div>
        </div>
      </Card>

      {/* Remito */}
      <Card title="Remito" subtitle="Datos del remito asociado al viaje" right={remito?.archivo_url ? <span className="text-xs text-gray-500">Archivo disponible</span> : <span className="text-xs text-gray-400">Sin archivo</span>}>
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
          <div className="border rounded-2xl p-4 transition hover:shadow-sm">
            <div className="text-xs text-gray-500">Número</div>
            <div className="text-sm font-semibold">{remito?.numero_remito ?? '-'}</div>
          </div>

          <div className="border rounded-2xl p-4 transition hover:shadow-sm">
            <div className="text-xs text-gray-500">Fecha del viaje</div>
            <div className="text-sm font-semibold">{remito?.fecha_viaje ?? '-'}</div>
          </div>

          <div className="border rounded-2xl p-4 transition hover:shadow-sm flex items-center justify-between gap-3">
            <div>
              <div className="text-xs text-gray-500">Archivo</div>
              <div className="text-sm font-semibold">
                {remito?.archivo_url ? (
                  <span className="text-green-700">Cargado ✅</span>
                ) : (
                  <span className="text-red-600">No cargado ❌</span>
                )}
              </div>
            </div>

            <button
              onClick={verRemito}
              disabled={!remito?.archivo_url}
              className="px-4 py-2 rounded-xl border text-sm font-semibold hover:bg-gray-50 transition active:scale-[0.98] disabled:opacity-50"
            >
              Ver remito
            </button>
          </div>
        </div>
      </Card>

      {/* Cliente */}
      <Card title="Cliente" subtitle="Seleccioná el cliente para poder asignar tarifas y facturar">
        <div className="flex flex-col lg:flex-row gap-3 items-stretch">
          <select
            value={clienteId}
            onChange={e => setClienteId(e.target.value)}
            className="border rounded-xl p-2 text-sm bg-white flex-1"
          >
            <option value="">Seleccionar cliente…</option>
            {clientes.map(c => (
              <option key={c.id} value={c.id}>
                {c.nombre}
              </option>
            ))}
          </select>

          <button
            onClick={guardarCliente}
            disabled={saving}
            className="border rounded-xl px-4 py-2 text-sm hover:bg-gray-50 transition active:scale-[0.98] disabled:opacity-50"
          >
            Guardar
          </button>
        </div>

        <div className="text-xs text-gray-500 mt-2">
          Tip: si no te aparecen clientes, revisá que estés logueado como admin real en tabla <b>usuarios</b>.
        </div>
      </Card>

      {/* Tarifa */}
      <Card
        title="Tarifa"
        subtitle={clienteId ? 'Elegí una tarifa vigente para este cliente.' : 'Primero elegí un cliente.'}
        right={
          viaje.tarifa_id ? (
            <span className="text-xs px-3 py-1 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
              Tarifa seleccionada
            </span>
          ) : (
            <span className="text-xs text-gray-400">Sin tarifa</span>
          )
        }
      >
        <div className="flex flex-col lg:flex-row gap-3 items-stretch">
          <select
            value={tarifaId}
            onChange={e => setTarifaId(e.target.value)}
            className="border rounded-xl p-2 text-sm bg-white flex-1 disabled:opacity-60"
            disabled={!clienteId}
          >
            <option value="">Seleccionar tarifa…</option>
            {tarifas.map(t => (
              <option key={t.id} value={t.id}>
                {t.tipo_unidad} • {t.destino} • ${t.valor_cliente} / chofer ${t.valor_chofer}
              </option>
            ))}
          </select>

          <button
            onClick={aplicarTarifa}
            disabled={saving || !tarifaId}
            className="border rounded-xl px-4 py-2 text-sm hover:bg-gray-50 transition active:scale-[0.98] disabled:opacity-50"
          >
            Aplicar tarifa
          </button>
        </div>
      </Card>

      {/* Acciones */}
      <Card title="Acciones" subtitle="Control de estados del viaje (admin)">
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => cambiarEstado('aprobado')}
            disabled={saving}
            className="px-4 py-2 rounded-xl border text-sm hover:bg-gray-50 transition active:scale-[0.98] disabled:opacity-50"
          >
            Aprobar
          </button>

          <button
            onClick={() => cambiarEstado('facturado')}
            disabled={saving}
            className="px-4 py-2 rounded-xl border text-sm bg-purple-600 text-white hover:bg-purple-700 transition active:scale-[0.98] disabled:opacity-50"
          >
            Facturar
          </button>

          <button
            onClick={marcarPagado}
            disabled={saving}
            className="px-4 py-2 rounded-xl border text-sm hover:bg-gray-50 transition active:scale-[0.98] disabled:opacity-50"
          >
            Marcar pagado
          </button>

          <button
            onClick={() => cambiarEstado('rechazado')}
            disabled={saving}
            className="px-4 py-2 rounded-xl border text-sm text-red-700 border-red-200 hover:bg-red-50 transition active:scale-[0.98] disabled:opacity-50"
          >
            Rechazar
          </button>
        </div>

        {(viaje.valor_cliente_snapshot || viaje.valor_chofer_snapshot) && (
          <div className="mt-3 text-xs text-gray-500">
            Snapshots: Cliente ${viaje.valor_cliente_snapshot ?? '-'} • Chofer ${viaje.valor_chofer_snapshot ?? '-'}
          </div>
        )}
      </Card>
    </div>
  )
}
