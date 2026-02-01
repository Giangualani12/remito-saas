import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type ViajeDB = {
  fecha_viaje: string | null // YYYY-MM-DD
  estado: "pendiente" | "aprobado" | "facturado" | "pagado" | "rechazado"
  valor_cliente_snapshot: number | null
  valor_chofer_snapshot: number | null
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

    const { data, error } = await supabaseAdmin
      .from("viajes")
      .select("fecha_viaje, estado, valor_cliente_snapshot, valor_chofer_snapshot")
      .gte("fecha_viaje", desde)
      .lt("fecha_viaje", hasta)

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    const rows = (data ?? []) as ViajeDB[]

    const base = Array.from({ length: diasDelMes }, (_, i) => ({
      day: i + 1,
      label: String(i + 1),
      facturado: 0,
      costo: 0,
      ganancia: 0,
    }))

    for (const v of rows) {
      if (!v.fecha_viaje) continue
      const day = Number(String(v.fecha_viaje).slice(8, 10))
      const idx = day - 1
      if (idx < 0 || idx >= base.length) continue

      const esDevengado = v.estado === "facturado" || v.estado === "pagado"

      if (esDevengado && v.valor_cliente_snapshot != null) {
        base[idx].facturado += Number(v.valor_cliente_snapshot)
      }

      // ✅ costo devengado (más útil que “solo pagado” para ver el mes real)
      if (esDevengado && v.valor_chofer_snapshot != null) {
        base[idx].costo += Number(v.valor_chofer_snapshot)
      }
    }

    for (const r of base) {
      r.ganancia = r.facturado - r.costo
      r.facturado = Math.round(r.facturado)
      r.costo = Math.round(r.costo)
      r.ganancia = Math.round(r.ganancia)
    }

    return NextResponse.json(base)
  } catch {
    return NextResponse.json({ error: "Error inesperado en series diarias" }, { status: 500 })
  }
}
