import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

type ViajeDB = {
  chofer_id: string;
  estado: "pendiente" | "aprobado" | "facturado" | "pagado" | "rechazado";
  valor_chofer_snapshot: number | null;
  usuarios: { nombre: string } | { nombre: string }[] | null;
};

type FilaChofer = {
  chofer: string;
  viajes: number;
  costo_devengado: number;
  pagado: number;
};

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    // ✅ Crear el client ADENTRO (así NO rompe el build de Vercel)
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const service = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url) {
      return NextResponse.json(
        { error: "Falta NEXT_PUBLIC_SUPABASE_URL en Vercel" },
        { status: 500 }
      );
    }

    if (!service) {
      return NextResponse.json(
        { error: "Falta SUPABASE_SERVICE_ROLE_KEY en Vercel" },
        { status: 500 }
      );
    }

    const supabaseAdmin = createClient(url, service, {
      auth: { persistSession: false },
    });

    const { mes } = await req.json();

    if (!mes) {
      return NextResponse.json({ error: "Mes requerido (YYYY-MM)" }, { status: 400 });
    }

    // ✅ rango mejor: inicio del mes / inicio del mes siguiente
    const [y, m] = mes.split("-").map(Number);
    const desde = new Date(Date.UTC(y, m - 1, 1)).toISOString();
    const hasta = new Date(Date.UTC(y, m, 1)).toISOString();

    const { data, error } = await supabaseAdmin
      .from("viajes")
      .select(
        `
        chofer_id,
        estado,
        valor_chofer_snapshot,
        usuarios:chofer_id ( nombre )
      `
      )
      .gte("creado_en", desde)
      .lt("creado_en", hasta);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const filas = (data ?? []) as ViajeDB[];
    const resumen: Record<string, FilaChofer> = {};

    for (const v of filas) {
      const nombreChofer = Array.isArray(v.usuarios)
        ? v.usuarios[0]?.nombre
        : v.usuarios?.nombre;

      if (!nombreChofer) continue;

      const key = v.chofer_id;

      if (!resumen[key]) {
        resumen[key] = {
          chofer: nombreChofer,
          viajes: 0,
          costo_devengado: 0,
          pagado: 0,
        };
      }

      resumen[key].viajes++;

      // ✅ costo devengado: cuando el viaje ya fue facturado o pagado
      if (
        (v.estado === "facturado" || v.estado === "pagado") &&
        v.valor_chofer_snapshot != null
      ) {
        resumen[key].costo_devengado += v.valor_chofer_snapshot;
      }

      // ✅ pagado: solo cuando estado = pagado
      if (v.estado === "pagado" && v.valor_chofer_snapshot != null) {
        resumen[key].pagado += v.valor_chofer_snapshot;
      }
    }

    const resultado = Object.values(resumen).map((r) => ({
      chofer: r.chofer,
      viajes: r.viajes,
      facturado: r.costo_devengado, // 👈 compatibilidad con tu front
      pagado: r.pagado,
      deuda: r.costo_devengado - r.pagado,
    }));

    return NextResponse.json(resultado);
  } catch {
    return NextResponse.json(
      { error: "Error inesperado en reporte por chofer" },
      { status: 500 }
    );
  }
}

