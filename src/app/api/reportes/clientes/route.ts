import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type ViajeRow = {
  cliente_id: string | null
  estado: "pendiente" | "aprobado" | "facturado" | "pagado" | "rechazado"
  fecha_viaje: string | null
  valor_cliente_snapshot: number | null
  valor_chofer_snapshot: number | null
  clientes: { nombre: string } | { nombre: string }[] | null
}

type FilaInterna = {
  cliente: string
  viajes: number
  facturado: number
  costo_devengado: number
  pagado_real: number
}

function monthRange(mes: string) {
  const [y, m] = mes.split("-").map(Number)
  const desde = `${y}-${String(m).padStart(2, "0")}-01`
  const nextY = m === 12 ? y + 1 : y
  const nextM = m === 12 ? 1 : m + 1
  const hasta = `${nextY}-${String(nextM).padStart(2, "0")}-01`
  return { desde, hasta }
}

export async function POST(req: Request) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!url || !service) {
      return NextResponse.json({ error: "Faltan env en Vercel" }, { status: 500 })
    }

    const supabaseAdmin = createClient(url, service, {
      auth: { persistSession: false },
    })

    const { mes } = await req.json()

    if (!mes) {
      return NextResponse.json({ error: "Mes requerido (YYYY-MM)" }, { status: 400 })
    }

    const { desde, hasta } = monthRange(mes)

    const { data, error } = await supabaseAdmin
      .from("viajes")
      .select(`
        cliente_id,
        estado,
        fecha_viaje,
        valor_cliente_snapshot,
        valor_chofer_snapshot,
        clientes:cliente_id ( nombre )
      `)
      .gte("fecha_viaje", desde)
      .lt("fecha_viaje", hasta)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    const rows = (data ?? []) as ViajeRow[]
    const resumen: Record<string, FilaInterna> = {}

    for (const v of rows) {
      const clienteNombre = Array.isArray(v.clientes) ? v.clientes[0]?.nombre : v.clientes?.nombre
      if (!v.cliente_id || !clienteNombre) continue

      const key = v.cliente_id

      if (!resumen[key]) {
        resumen[key] = { cliente: clienteNombre, viajes: 0, facturado: 0, costo_devengado: 0, pagado_real: 0 }
      }

      resumen[key].viajes++

      const esDevengado = v.estado === "facturado" || v.estado === "pagado"

      // ingresos (cliente)
      if (esDevengado && v.valor_cliente_snapshot != null) {
        resumen[key].facturado += Number(v.valor_cliente_snapshot)
      }

      // costo devengado (lo que corresponde pagar por ese viaje)
      if (esDevengado && v.valor_chofer_snapshot != null) {
        resumen[key].costo_devengado += Number(v.valor_chofer_snapshot)
      }

      // pagado real aproximado (si no usás tabla pagos_transportistas aún)
      if (v.estado === "pagado" && v.valor_chofer_snapshot != null) {
        resumen[key].pagado_real += Number(v.valor_chofer_snapshot)
      }
    }

    const resultado = Object.values(resumen).map(r => {
      const deuda = r.costo_devengado - r.pagado_real
      const ganancia_devengada = r.facturado - r.costo_devengado

      return {
        cliente: r.cliente,
        viajes: r.viajes,

        // compat con tu UI actual
        facturado: Math.round(r.facturado),
        pagado: Math.round(r.costo_devengado),           // 👈 "Costo" del mes (devengado)
        ganancia: Math.round(ganancia_devengada),        // 👈 ganancia devengada

        // extra (por si querés usar después)
        costo_devengado: Math.round(r.costo_devengado),
        pagado_real: Math.round(r.pagado_real),
        deuda: Math.round(deuda),
        ganancia_devengada: Math.round(ganancia_devengada),
      }
    })

    return NextResponse.json(resultado)
  } catch {
    return NextResponse.json({ error: "Error inesperado en reporte por cliente" }, { status: 500 })
  }
}
