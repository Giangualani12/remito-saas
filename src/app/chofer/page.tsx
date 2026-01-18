'use client'

import { useRouter } from 'next/navigation'
import ChoferHeader from '@/components/chofer/ChoferHeader'

export default function ChoferHomePage() {
  const router = useRouter()

  return (
    <div className="min-h-screen bg-gray-50 bg-app">
      <ChoferHeader />

      <div className="max-w-md mx-auto p-4 space-y-4">
        {/* Card header */}
        <div className="bg-white rounded-2xl shadow-sm ring-1 ring-black/5 p-5 fade-up">
          <h1 className="text-xl font-bold tracking-tight">Panel del Chofer</h1>
          <p className="text-sm text-gray-600 mt-1">
            Subí remitos rápido y consultá el estado de tus viajes.
          </p>
        </div>

        {/* CTA crear remito */}
        <button
          onClick={() => router.push('/chofer/remitos/nuevo')}
          className="w-full rounded-2xl p-5 text-left shadow-sm ring-1 ring-blue-600/20 bg-blue-600 text-white
                     hover:brightness-[1.02] active:scale-[0.99] transition fade-up"
        >
          <div className="text-base font-semibold">➕ Crear remito</div>
          <div className="text-sm text-blue-100 mt-1">
            Cargar número, fecha, ruta y unidad + archivo
          </div>
        </button>

        {/* CTA mis remitos */}
        <button
          onClick={() => router.push('/chofer/remitos')}
          className="w-full bg-white rounded-2xl p-5 text-left shadow-sm ring-1 ring-black/5
                     hover:bg-gray-50 active:scale-[0.99] transition fade-up"
        >
          <div className="text-base font-semibold">📄 Mis remitos</div>
          <div className="text-sm text-gray-600 mt-1">
            Ver estados (pendiente / aprobado / facturado / pagado)
          </div>
        </button>
      </div>
    </div>
  )
}
