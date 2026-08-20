"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { negocio } from "@/config/negocio";
import { formatearPrecio } from "@/lib/disponibilidad";
import { estadoPagoAction } from "@/app/actions/turnos";
import type { EstadoPago } from "@/lib/turnos";

const PRIMARIO = negocio.marca.primario;
const TEXTO_PRIMARIO = negocio.marca.primarioTextoOscuro ? "#111827" : "#ffffff";

export default function PagoPage() {
  return (
    <Suspense fallback={<Centrado>Cargando…</Centrado>}>
      <Checkout />
    </Suspense>
  );
}

function Checkout() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";

  const [estado, setEstado] = useState<EstadoPago | null>(null);
  const [restanteSeg, setRestanteSeg] = useState<number | null>(null);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const refrescar = useCallback(async () => {
    if (!token) return;
    try {
      const e = await estadoPagoAction(token);
      setEstado(e);
    } catch {
      // reintenta en el próximo tick
    }
  }, [token]);

  // Primera carga + polling mientras el pago está pendiente.
  useEffect(() => {
    void refrescar();
  }, [refrescar]);

  useEffect(() => {
    if (estado?.estado !== "pendiente") return;
    const id = setInterval(() => void refrescar(), 4000);
    return () => clearInterval(id);
  }, [estado?.estado, refrescar]);

  // Contador regresivo hasta expiraEnMs.
  useEffect(() => {
    if (estado?.estado !== "pendiente" || !estado.expiraEnMs) {
      setRestanteSeg(null);
      return;
    }
    const tick = () => {
      const seg = Math.max(0, Math.round((estado.expiraEnMs! - Date.now()) / 1000));
      setRestanteSeg(seg);
      if (seg <= 0) void refrescar(); // se venció: el server lo marca expirado
    };
    tick();
    timer.current = setInterval(tick, 1000);
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
  }, [estado?.estado, estado?.expiraEnMs, refrescar]);

  if (!token) return <Centrado>Link inválido.</Centrado>;
  if (!estado) return <Centrado>Cargando tu reserva…</Centrado>;
  if (!estado.encontrado) return <Centrado>No encontramos esta reserva.</Centrado>;

  // ── Pagado: turno confirmado ──
  if (estado.estado === "pagado") {
    return (
      <Marco>
        <Icono>✓</Icono>
        <h1 className="mt-6 text-2xl font-bold">¡Turno confirmado!</h1>
        <p className="mt-2 text-zinc-500">Recibimos tu seña. Te esperamos 🙌</p>
        {estado.turno && (
          <Resumen estado={estado} />
        )}
        <Link
          href={`/turno/${estado.turno?.token ?? token}`}
          className="mt-6 inline-block w-full rounded-full border px-5 py-3 text-center text-sm font-semibold"
          style={{ borderColor: PRIMARIO }}
        >
          Ver o cancelar mi turno
        </Link>
        <Link
          href="/"
          className="mt-3 inline-block rounded-full px-6 py-3 text-sm font-semibold"
          style={{ background: PRIMARIO, color: TEXTO_PRIMARIO }}
        >
          Volver al inicio
        </Link>
      </Marco>
    );
  }

  // ── Expirado: se liberó el horario ──
  if (estado.estado === "expirado" || estado.estado === "sin_pago") {
    return (
      <Marco>
        <Icono tenue>⏳</Icono>
        <h1 className="mt-6 text-2xl font-bold">Se venció el tiempo de pago</h1>
        <p className="mt-2 text-zinc-500">
          Liberamos el horario para que no quede bloqueado. Podés volver a reservar cuando quieras.
        </p>
        <Link
          href="/reservar"
          className="mt-6 inline-block rounded-full px-6 py-3 text-sm font-semibold"
          style={{ background: PRIMARIO, color: TEXTO_PRIMARIO }}
        >
          Reservar de nuevo
        </Link>
      </Marco>
    );
  }

  // ── Pendiente: contador + botón de pago ──
  const min = restanteSeg != null ? Math.floor(restanteSeg / 60) : null;
  const seg = restanteSeg != null ? restanteSeg % 60 : null;

  return (
    <Marco>
      <span
        className="rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide"
        style={{ background: PRIMARIO, color: TEXTO_PRIMARIO }}
      >
        Falta pagar la seña
      </span>
      <h1 className="mt-4 text-2xl font-bold">Reservá tu turno con la seña</h1>
      <p className="mt-2 text-zinc-500">
        Pagá <span className="font-semibold text-zinc-900">{formatearPrecio(estado.montoArs)}</span> para
        dejar tu turno confirmado.
      </p>

      {min != null && seg != null && (
        <div className="mt-6">
          <p className="text-sm text-zinc-500">Te guardamos el horario por</p>
          <p className="mt-1 font-mono text-4xl font-bold tabular-nums" style={{ color: PRIMARIO }}>
            {String(min).padStart(2, "0")}:{String(seg).padStart(2, "0")}
          </p>
        </div>
      )}

      {estado.turno && <Resumen estado={estado} />}

      {estado.initPoint ? (
        <a
          href={estado.initPoint}
          className="mt-6 flex w-full items-center justify-center rounded-full py-4 text-base font-bold transition-opacity hover:opacity-90"
          style={{ background: PRIMARIO, color: TEXTO_PRIMARIO }}
        >
          Ir a pagar con MercadoPago
        </a>
      ) : (
        <p className="mt-6 text-sm text-zinc-500">Generando el link de pago…</p>
      )}

      <p className="mt-4 text-xs text-zinc-400">
        No cierres esta pantalla. Cuando termines el pago, se confirma sola.
      </p>
    </Marco>
  );
}

function Resumen({ estado }: { estado: EstadoPago }) {
  const t = estado.turno!;
  const fecha = new Date(t.fechaIso);
  return (
    <div className="mt-6 w-full rounded-2xl border border-zinc-200 p-5 text-left text-sm">
      <Fila etiqueta="Servicio" valor={t.servicioNombre} />
      <Fila etiqueta="Barbero" valor={t.barberoNombre} />
      <Fila
        etiqueta="Cuándo"
        valor={`${fecha.getDate()}/${fecha.getMonth() + 1} · ${t.hora} hs`}
      />
      <Fila etiqueta="Seña" valor={formatearPrecio(estado.montoArs)} />
    </div>
  );
}

function Fila({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-zinc-500">{etiqueta}</span>
      <span className="font-medium text-zinc-900">{valor}</span>
    </div>
  );
}

function Marco({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto flex max-w-md flex-col items-center px-6 py-16 text-center">{children}</div>;
}

function Centrado({ children }: { children: React.ReactNode }) {
  return <div className="py-24 text-center text-zinc-400">{children}</div>;
}

function Icono({ children, tenue }: { children: React.ReactNode; tenue?: boolean }) {
  return (
    <div
      className="mx-auto flex h-16 w-16 items-center justify-center rounded-full text-3xl"
      style={tenue ? { background: "#f4f4f5", color: "#a1a1aa" } : { background: PRIMARIO, color: TEXTO_PRIMARIO }}
    >
      {children}
    </div>
  );
}
