"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { negocio } from "@/config/negocio";
import { formatearPrecio } from "@/lib/disponibilidad";
import { cancelarTurnoAction, verTurno } from "@/app/actions/turnos";
import type { TurnoDetalle } from "@/lib/turnos";

const PRIMARIO = negocio.marca.primario;
const TEXTO_PRIMARIO = negocio.marca.primarioTextoOscuro ? "#111827" : "#ffffff";

export default function VerTurno({ token }: { token: string }) {
  const [cargando, setCargando] = useState(true);
  const [detalle, setDetalle] = useState<TurnoDetalle | null>(null);
  const [cancelando, setCancelando] = useState(false);
  const [mensaje, setMensaje] = useState<string | null>(null);

  useEffect(() => {
    verTurno(token)
      .then(setDetalle)
      .catch(() => setDetalle(null))
      .finally(() => setCargando(false));
  }, [token]);

  async function onCancelar() {
    setCancelando(true);
    setMensaje(null);
    try {
      const res = await cancelarTurnoAction(token);
      if (res.ok) {
        setDetalle((d) => (d ? { ...d, estado: "cancelado", cancelable: false } : d));
        setMensaje("Tu turno fue cancelado. ¡Gracias por avisar!");
      } else if (res.error === "tarde") {
        setMensaje("Ya no se puede cancelar online (faltan menos de 2 horas). Escribile a la barbería.");
      } else if (res.error === "ya-cancelado") {
        setDetalle((d) => (d ? { ...d, estado: "cancelado", cancelable: false } : d));
        setMensaje("Este turno ya estaba cancelado.");
      } else {
        setMensaje("No encontramos el turno. Revisá el link.");
      }
    } catch {
      setMensaje("No pudimos cancelar. Probá de nuevo en un momento.");
    } finally {
      setCancelando(false);
    }
  }

  return (
    <div className="mx-auto max-w-lg px-6 py-16">
      <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-800">
        ← {negocio.nombre}
      </Link>

      {cargando ? (
        <p className="mt-10 text-center text-zinc-400">Buscando tu turno…</p>
      ) : !detalle ? (
        <div className="mt-10 text-center">
          <h1 className="text-2xl font-bold">Turno no encontrado</h1>
          <p className="mt-2 text-zinc-500">
            El link puede estar incompleto o el turno ya no existe.
          </p>
        </div>
      ) : (
        <div className="mt-8">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold tracking-tight">Tu turno</h1>
            {detalle.estado === "cancelado" && (
              <span className="rounded-full bg-red-100 px-3 py-1 text-xs font-semibold text-red-700">
                Cancelado
              </span>
            )}
          </div>

          <div className="mt-6 rounded-2xl border border-zinc-200 p-6">
            <Fila etiqueta="Servicio" valor={`${detalle.servicioNombre} · ${detalle.duracionMin} min`} />
            <Fila etiqueta="Precio" valor={formatearPrecio(detalle.precioArs)} />
            <Fila etiqueta="Barbero" valor={detalle.barberoNombre} />
            <Fila etiqueta="Día" valor={formatearFecha(detalle.fechaIso)} />
            <Fila etiqueta="Hora" valor={`${detalle.hora} hs`} />
          </div>

          {mensaje && (
            <p className="mt-5 rounded-lg bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
              {mensaje}
            </p>
          )}

          {detalle.estado === "reservado" && !mensaje && (
            <div className="mt-6">
              {detalle.yaPaso ? (
                <p className="text-sm text-zinc-500">Este turno ya pasó.</p>
              ) : detalle.cancelable ? (
                <button
                  onClick={onCancelar}
                  disabled={cancelando}
                  className="w-full rounded-full border border-red-300 py-3 text-sm font-semibold text-red-700 transition-colors hover:bg-red-50 disabled:opacity-50"
                >
                  {cancelando ? "Cancelando…" : "Cancelar turno"}
                </button>
              ) : (
                <p className="text-sm text-zinc-500">
                  Este turno ya no se puede cancelar online (faltan menos de 2 horas).
                  Si necesitás cancelarlo, escribile a la barbería.
                </p>
              )}
            </div>
          )}

          <Link
            href="/"
            className="mt-8 inline-block rounded-full px-6 py-3 text-sm font-semibold"
            style={{ background: PRIMARIO, color: TEXTO_PRIMARIO }}
          >
            Volver al inicio
          </Link>
        </div>
      )}
    </div>
  );
}

function formatearFecha(iso: string): string {
  return new Date(iso).toLocaleDateString("es-AR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function Fila({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-zinc-500">{etiqueta}</span>
      <span className="font-medium text-zinc-900">{valor}</span>
    </div>
  );
}
