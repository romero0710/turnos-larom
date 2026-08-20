"use server";

import {
  cancelarTurno,
  estadoPagoPorToken,
  expirarTurno,
  guardarPreferenciaPago,
  horariosDisponibles,
  obtenerTurnoPorToken,
  reservarTurno,
  type DatosReserva,
  type EstadoPago,
  type ResultadoCancelacion,
  type TurnoDetalle,
} from "@/lib/turnos";
import { crearPreferenciaSena, holdMin } from "@/lib/mp";
import { senaHabilitada } from "@/lib/sena";
import { obtenerServicio } from "@/lib/servicios";
import { negocio } from "@/config/negocio";

// Server actions: el único puente entre el cliente y la base de datos.
// Corren en el servidor; el cliente nunca ve SQLite ni la config interna.

export async function obtenerHorarios(
  servicioId: string,
  barberoId: string | null,
  fechaIso: string,
): Promise<string[]> {
  return horariosDisponibles(servicioId, barberoId, fechaIso);
}

// Avisa al bot de WhatsApp que hay un turno nuevo, para que mande la confirmación
// al instante (sin esperar su polling). Si el bot está caído, no rompe la reserva:
// el chequeo periódico del bot lo agarra igual.
async function avisarBotNuevoTurno(): Promise<void> {
  const secret = process.env.BOT_API_SECRET || "";
  if (!secret) return;
  const botUrl = process.env.BOT_URL || "http://larom_wabot:3000";
  try {
    await fetch(`${botUrl}/interno/check`, {
      method: "POST",
      headers: { "x-bot-secret": secret },
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    // ignorado a propósito
  }
}

// Resultado de reservar visto por el cliente. Si el turno requiere seña, viene
// `pago` con el link del checkout de MercadoPago y los datos del contador.
export type ResultadoReservaAccion =
  | {
      ok: true;
      token: string;
      barberoNombre: string;
      pago?: { initPoint: string; montoArs: number; expiraEnMs: number };
    }
  | { ok: false; error: "datos" | "servicio" | "tomado" | "pago" };

export async function confirmarReserva(datos: DatosReserva): Promise<ResultadoReservaAccion> {
  const conSena = senaHabilitada();
  const res = reservarTurno(datos, conSena ? { conSena: true, holdMinutos: holdMin() } : undefined);
  if (!res.ok) return { ok: false, error: res.error };

  // Sin seña: flujo de siempre (confirmación por WhatsApp si corresponde).
  if (!res.sena) {
    if (process.env.CONFIRMACION_TURNO !== "false") await avisarBotNuevoTurno();
    return { ok: true, token: res.token, barberoNombre: res.barberoNombre };
  }

  // Con seña: creamos la preferencia de MercadoPago y mandamos al cliente a pagar.
  try {
    const servicio = obtenerServicio(datos.servicioId);
    const titulo = `Seña · ${servicio?.nombre ?? "Turno"} · ${negocio.nombre}`;
    const pref = await crearPreferenciaSena({
      turnoId: res.id,
      token: res.token,
      titulo,
      montoArs: res.sena.montoArs,
      expiraEnMs: res.sena.expiraEnMs,
    });
    guardarPreferenciaPago(res.id, pref.id, pref.initPoint);
    return {
      ok: true,
      token: res.token,
      barberoNombre: res.barberoNombre,
      pago: {
        initPoint: pref.initPoint,
        montoArs: res.sena.montoArs,
        expiraEnMs: res.sena.expiraEnMs,
      },
    };
  } catch (e) {
    // Si MP falla, no dejamos el horario bloqueado: expiramos el turno.
    console.error("[pago] no se pudo crear la preferencia:", e);
    expirarTurno(res.id);
    return { ok: false, error: "pago" };
  }
}

/** Estado del pago de un turno (para la pantalla de checkout con contador). */
export async function estadoPagoAction(token: string): Promise<EstadoPago> {
  return estadoPagoPorToken(token);
}

export async function verTurno(token: string): Promise<TurnoDetalle | null> {
  return obtenerTurnoPorToken(token);
}

export async function cancelarTurnoAction(token: string): Promise<ResultadoCancelacion> {
  return cancelarTurno(token);
}
