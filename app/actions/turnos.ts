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

export async function confirmarReserva(datos: DatosReserva): Promise<ResultadoReserva> {
  return reservarTurno(datos);
}

export async function verTurno(token: string): Promise<TurnoDetalle | null> {
  return obtenerTurnoPorToken(token);
}

export async function cancelarTurnoAction(token: string): Promise<ResultadoCancelacion> {
  return cancelarTurno(token);
}
