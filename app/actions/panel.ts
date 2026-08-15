"use server";

import { abrirSesion, cerrarSesion, identificar, leerSesion } from "@/lib/auth";
import {
  agendaDelDia,
  cancelarTurnoAdmin,
  marcarAsistencia,
  metricasPeriodo,
  resumenPeriodo,
  type AgendaDia,
  type Metricas,
} from "@/lib/turnos";
import type { SesionPanel } from "@/lib/tipos";

// Server actions del panel. Cada acción que toca datos re-lee la sesión desde la
// cookie firmada: el cliente nunca decide quién es ni qué puede ver/cancelar.

// El barbero solo ve/cancela lo suyo; el dueño, todo.
function filtroDe(sesion: SesionPanel): string | null {
  return sesion.tipo === "barbero" ? sesion.barberoId : null;
}

export async function ingresarPanel(
  clave: string,
): Promise<{ ok: true; sesion: SesionPanel } | { ok: false }> {
  const sesion = identificar(clave);
  if (!sesion) return { ok: false };
  await abrirSesion(sesion);
  return { ok: true, sesion };
}

export async function salirPanel(): Promise<void> {
  await cerrarSesion();
}

export async function obtenerAgenda(fechaKey: string): Promise<AgendaDia | null> {
  const sesion = await leerSesion();
  if (!sesion) return null;
  return agendaDelDia(fechaKey, filtroDe(sesion));
}

export async function cancelarTurnoPanel(id: number): Promise<{ ok: boolean }> {
  const sesion = await leerSesion();
  if (!sesion) return { ok: false };
  return { ok: cancelarTurnoAdmin(id, filtroDe(sesion)) };
}

/** Marca si el cliente vino (1), no vino (0) o sin marcar (null). */
export async function marcarAsistenciaPanel(
  id: number,
  asistio: 0 | 1 | null,
): Promise<{ ok: boolean }> {
  const sesion = await leerSesion();
  if (!sesion) return { ok: false };
  return { ok: marcarAsistencia(id, asistio, filtroDe(sesion)) };
}

/**
 * Métricas del negocio en un rango de días (claves YYYY-MM-DD). Solo el dueño.
 * Si se pasa el rango del período anterior, adjunta sus totales para comparar.
 */
export async function obtenerMetricas(
  desdeKey: string,
  hastaKey: string,
  desdePrevKey?: string,
  hastaPrevKey?: string,
): Promise<Metricas | null> {
  const sesion = await leerSesion();
  if (sesion?.tipo !== "dueno") return null;
  const actual = metricasPeriodo(desdeKey, hastaKey);
  if (desdePrevKey && hastaPrevKey) {
    actual.anterior = resumenPeriodo(desdePrevKey, hastaPrevKey);
  }
  return actual;
}
