import { NextResponse } from "next/server"
import { createClient } from "@supabase/supabase-js"

type ViajeDB = {
  chofer_id: string
  estado: "pendiente" | "aprobado" | "facturado" | "pagado" | "rechazado"
  fecha_viaje: string | null
  valor_chofer_snapshot: number | null
  usuarios: { nombre: string } | { nombre: string }[] | null
}

type FilaChofer = {
  chofer: string
  viajes: number
  costo_devengado: number
  pagado: number
}

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

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

    if (!url) {
      return NextResponse.json({ error: "Falta NEXT_PUBLIC_SUPABASE_URL en Vercel" }, { status: 500 })
    }
    if (!service) {
      return NextResponse.json({ error: "Falta SUPABASE_SERVICE_ROLE_KEY en Vercel" }, { status: 500 })
    }

    const supabaseAdmin = createClient(url, service, { auth: { persistSession: false } })

    const { mes } = await req.json()
    if (!mes) return NextResponse.json({ error: "Mes requerido (YYYY-MM)" }, { status: 400 })

    const { desde, hasta } = monthRange(mes)

    const { data, error } = await supabaseAdmin
      .from("viajes")
      .select(`
        chofer_id,
        estado,
        fecha_viaje,
        valor_chofer_snapshot,
        usuarios:chofer_id ( nombre )
      `)
      .gte("fecha_viaje", desde)
      .lt("fecha_viaje", hasta)

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    const filas = (data ?? []) as ViajeDB[]
    const resumen: Record<string, FilaChofer> = {}

    for (const v of filas) {
      const nombreChofer = Array.isArray(v.usuarios) ? v.usuarios[0]?.nombre : v.usuarios?.nombre
      if (!nombreChofer) continue

      const key = v.chofer_id

      if (!resumen[key]) {
        resumen[key] = { chofer: nombreChofer, viajes: 0, costo_devengado: 0, pagado: 0 }
      }

      resumen[key].viajes++

      const esDevengado = v.estado === "facturado" || v.estado === "pagado"

      if (esDevengado && v.valor_chofer_snapshot != null) {
        resumen[key].costo_devengado += Number(v.valor_chofer_snapshot)
      }

      if (v.estado === "pagado" && v.valor_chofer_snapshot != null) {
        resumen[key].pagado += Number(v.valor_chofer_snapshot)
      }
    }

    const resultado = Object.values(resumen).map(r => ({
      chofer: r.chofer,
      viajes: r.viajes,

      // compat con tu UI actual:
      facturado: Math.round(r.costo_devengado),

      pagado: Math.round(r.pagado),
      deuda: Math.round(r.costo_devengado - r.pagado),

      // extra
      costo_devengado: Math.round(r.costo_devengado),
    }))

    return NextResponse.json(resultado)
  } catch {
    return NextResponse.json({ error: "Error inesperado en reporte por chofer" }, { status: 500 })
  }
}
