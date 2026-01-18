import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type ViajeRow = {
  estado: "pendiente" | "aprobado" | "facturado" | "pagado" | "rechazado"
  valor_cliente_snapshot: number | null
  valor_chofer_snapshot: number | null
  creado_en: string
}

export async function POST(req: Request) {
  try {
    // ✅ crear client adentro (evita crash en build)
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

    const [y, m] = mes.split("-").map(Number)

    const desdeDate = new Date(y, m - 1, 1)
    const hastaDate = new Date(y, m, 0, 23, 59, 59, 999)

    const desde = desdeDate.toISOString()
    const hasta = hastaDate.toISOString()

    const diasDelMes = new Date(y, m, 0).getDate()

    const now = new Date()
    const esMesActual = now.getFullYear() === y && now.getMonth() + 1 === m

    // días transcurridos (si no es mes actual, lo tomamos como cerrado)
    const diasTranscurridos = esMesActual ? Math.min(now.getDate(), diasDelMes) : diasDelMes

    const { data, error } = await supabaseAdmin
      .from("viajes")
      .select("estado, valor_cliente_snapshot, valor_chofer_snapshot, creado_en")
      .gte("creado_en", desde)
      .lte("creado_en", hasta)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    const rows = (data ?? []) as ViajeRow[]

    let facturadoActual = 0
    let pagadoActual = 0

    for (const v of rows) {
      // facturado = estados facturado o pagado, usando valor_cliente_snapshot
      if ((v.estado === "facturado" || v.estado === "pagado") && v.valor_cliente_snapshot != null) {
        facturadoActual += Number(v.valor_cliente_snapshot)
      }

      // costo/pagado = estado pagado usando valor_chofer_snapshot
      if (v.estado === "pagado" && v.valor_chofer_snapshot != null) {
        pagadoActual += Number(v.valor_chofer_snapshot)
      }
    }

    const gananciaActual = facturadoActual - pagadoActual

    // promedios diarios
    const divisor = Math.max(diasTranscurridos, 1)
    const facturadoPromedio = facturadoActual / divisor
    const pagadoPromedio = pagadoActual / divisor
    const gananciaPromedio = gananciaActual / divisor

    // proyección
    const factor = esMesActual ? diasDelMes / divisor : 1

    const facturadoProy = Math.round(facturadoActual * factor)
    const pagadoProy = Math.round(pagadoActual * factor)
    const gananciaProy = facturadoProy - pagadoProy

    return NextResponse.json({
      mes,
      dias_del_mes: diasDelMes,
      dias_transcurridos: diasTranscurridos,
      es_mes_actual: esMesActual,

      facturado_actual: Math.round(facturadoActual),
      pagado_actual: Math.round(pagadoActual),
      ganancia_actual: Math.round(gananciaActual),

      facturado_promedio_diario: Math.round(facturadoPromedio),
      pagado_promedio_diario: Math.round(pagadoPromedio),
      ganancia_promedio_diario: Math.round(gananciaPromedio),

      facturado_proyectado: facturadoProy,
      pagado_proyectado: pagadoProy,
      ganancia_proyectada: gananciaProy,
    })
  } catch {
    return NextResponse.json({ error: "Error inesperado en proyecciones" }, { status: 500 })
  }
}
