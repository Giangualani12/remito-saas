import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type ViajeRow = {
  estado: "pendiente" | "aprobado" | "facturado" | "pagado" | "rechazado"
  valor_cliente_snapshot: number | null
  valor_chofer_snapshot: number | null
  fecha_viaje: string | null
}

function monthRange(mes: string) {
  const [y, m] = mes.split("-").map(Number)
  const desde = `${y}-${String(m).padStart(2, "0")}-01`
  const nextY = m === 12 ? y + 1 : y
  const nextM = m === 12 ? 1 : m + 1
  const hasta = `${nextY}-${String(nextM).padStart(2, "0")}-01`
  return { desde, hasta, y, m }
}

export async function POST(req: Request) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY

    if (!url || !service) return NextResponse.json({ error: "Faltan env en Vercel" }, { status: 500 })

    const supabaseAdmin = createClient(url, service, { auth: { persistSession: false } })

    const { mes } = await req.json()
    if (!mes) return NextResponse.json({ error: "Mes requerido (YYYY-MM)" }, { status: 400 })

    const { desde, hasta, y, m } = monthRange(mes)
    const diasDelMes = new Date(y, m, 0).getDate()

    const now = new Date()
    const esMesActual = now.getFullYear() === y && now.getMonth() + 1 === m
    const diasTranscurridos = esMesActual ? Math.min(now.getDate(), diasDelMes) : diasDelMes

    const { data, error } = await supabaseAdmin
      .from("viajes")
      .select("estado, valor_cliente_snapshot, valor_chofer_snapshot, fecha_viaje")
      .gte("fecha_viaje", desde)
      .lt("fecha_viaje", hasta)

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    const rows = (data ?? []) as ViajeRow[]

    let facturadoActual = 0
    let costoDevengadoActual = 0
    let pagadoActual = 0 // aproximación por estado=pagado

    for (const v of rows) {
      const esDevengado = v.estado === "facturado" || v.estado === "pagado"

      if (esDevengado && v.valor_cliente_snapshot != null) {
        facturadoActual += Number(v.valor_cliente_snapshot)
      }

      if (esDevengado && v.valor_chofer_snapshot != null) {
        costoDevengadoActual += Number(v.valor_chofer_snapshot)
      }

      if (v.estado === "pagado" && v.valor_chofer_snapshot != null) {
        pagadoActual += Number(v.valor_chofer_snapshot)
      }
    }

    const gananciaDevengadaActual = facturadoActual - costoDevengadoActual

    const divisor = Math.max(diasTranscurridos, 1)
    const facturadoProm = facturadoActual / divisor
    const costoProm = costoDevengadoActual / divisor
    const gananciaProm = gananciaDevengadaActual / divisor

    const factor = esMesActual ? diasDelMes / divisor : 1

    const facturadoProy = Math.round(facturadoActual * factor)
    const costoProy = Math.round(costoDevengadoActual * factor)
    const gananciaProy = facturadoProy - costoProy

    return NextResponse.json({
      mes,
      dias_del_mes: diasDelMes,
      dias_transcurridos: diasTranscurridos,
      es_mes_actual: esMesActual,

      facturado_actual: Math.round(facturadoActual),

      // compat con tu UI actual (tu UI lo llama "pagado_actual" pero lo muestra como "Costo"):
      pagado_actual: Math.round(costoDevengadoActual),

      ganancia_actual: Math.round(gananciaDevengadaActual),

      facturado_promedio_diario: Math.round(facturadoProm),
      pagado_promedio_diario: Math.round(costoProm),
      ganancia_promedio_diario: Math.round(gananciaProm),

      facturado_proyectado: facturadoProy,
      pagado_proyectado: costoProy,
      ganancia_proyectada: gananciaProy,

      // extra por si querés caja real:
      pagado_real_actual: Math.round(pagadoActual),
    })
  } catch {
    return NextResponse.json({ error: "Error inesperado en proyecciones" }, { status: 500 })
  }
}
