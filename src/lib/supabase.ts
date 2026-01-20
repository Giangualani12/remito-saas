import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

let _client: SupabaseClient | null = null;

export function getSupabaseClient() {
  if (_client) return _client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // ⛔ no lo revientes en build/server, solo en navegador si falta
  if ((!url || !anon) && typeof window !== "undefined") {
    throw new Error("Faltan env vars de Supabase en Vercel (.env)");
  }

  _client = createClient(url ?? "", anon ?? "", {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  });

  return _client;
}

// ✅ Mantiene compatibilidad con tu código viejo: supabase.from(...)
export const supabase: any = new Proxy(
  {},
  {
    get(_target, prop) {
      const client = getSupabaseClient();
      return client[prop as keyof typeof client];
    },
  }
);