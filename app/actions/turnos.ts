"use server";

import {
  cancelarTurno,
  horariosDisponibles,
  obtenerTurnoPorToken,
  reservarTurno,
  type DatosReserva,
  type ResultadoCancelacion,
  type ResultadoReserva,
  type TurnoDetalle,
} from "@/lib/turnos";

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

export async function confirmarReserva(datos: DatosReserva): Promise<ResultadoReserva> {
  const res = reservarTurno(datos);
  if (res.ok && process.env.CONFIRMACION_TURNO !== "false") {
    await avisarBotNuevoTurno();
  }
  return res;
}

export async function verTurno(token: string): Promise<TurnoDetalle | null> {
  return obtenerTurnoPorToken(token);
}

export async function cancelarTurnoAction(token: string): Promise<ResultadoCancelacion> {
  return cancelarTurno(token);
}
