'use client'

import { usePathname, useRouter } from 'next/navigation'

export default function ChoferHeader() {
  const router = useRouter()
  const pathname = usePathname()

  const btn = (path: string) =>
    `select-none px-4 py-2 rounded-lg text-sm border transition cursor-pointer ${
      pathname === path
        ? 'bg-blue-600 text-white border-blue-600'
        : 'bg-white text-gray-700 hover:bg-gray-50'
    }`

  return (
    <div className="sticky top-0 z-20 bg-white border-b">
      <div className="max-w-md mx-auto p-3 flex gap-2 justify-center select-none">
        <button
          type="button"
          onClick={() => router.push('/chofer')}
          className={btn('/chofer')}
        >
          Inicio
        </button>

        <button
          type="button"
          onClick={() => router.push('/chofer/remitos/nuevo')}
          className={btn('/chofer/remitos/nuevo')}
        >
          Crear remito
        </button>

        <button
          type="button"
          onClick={() => router.push('/chofer/remitos')}
          className={btn('/chofer/remitos')}
        >
          Mis remitos
        </button>
      </div>
    </div>
  )
}
