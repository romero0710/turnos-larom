"use server";

import { leerSesion } from "@/lib/auth";
import {
  actualizarBarbero,
  crearBarbero,
  eliminarBarbero,
  listarBarberos,
  reactivarBarbero,
  serviciosDeBarbero,
  setServiciosDeBarbero,
  setHorarioDeBarbero,
  type DatosBarbero,
  type HorarioSemanal,
  type ResultadoBarbero,
  type ResultadoHorario,
} from "@/lib/barberos";
import type { Barbero } from "@/lib/tipos";

// Gestión de barberos: SOLO el dueño. Cada acción re-verifica la sesión en el
// servidor (un barbero no puede editar su propio acceso ni el de otros).

async function esDueno(): Promise<boolean> {
  const s = await leerSesion();
  return s?.tipo === "dueno";
}

export interface BarberoConServicios extends Barbero {
  servicioIds: string[];
}

export async function listarBarberosPanel(): Promise<BarberoConServicios[] | null> {
  if (!(await esDueno())) return null;
  return listarBarberos(false).map((b) => ({ ...b, servicioIds: [...serviciosDeBarbero(b.id)] }));
}

export async function crearBarberoPanel(datos: DatosBarbero): Promise<ResultadoBarbero | null> {
  if (!(await esDueno())) return null;
  return crearBarbero(datos);
}

export async function actualizarBarberoPanel(
  id: string,
  datos: DatosBarbero,
): Promise<ResultadoBarbero | null> {
  if (!(await esDueno())) return null;
  return actualizarBarbero(id, datos);
}

export async function eliminarBarberoPanel(id: string): Promise<{ ok: boolean } | null> {
  if (!(await esDueno())) return null;
  return { ok: eliminarBarbero(id) };
}

export async function reactivarBarberoPanel(id: string): Promise<{ ok: boolean } | null> {
  if (!(await esDueno())) return null;
  return { ok: reactivarBarbero(id) };
}

export async function setServiciosBarberoPanel(
  id: string,
  servicioIds: string[],
): Promise<{ ok: boolean } | null> {
  if (!(await esDueno())) return null;
  setServiciosDeBarbero(id, servicioIds);
  return { ok: true };
}

export async function setHorarioBarberoPanel(
  id: string,
  horario: HorarioSemanal,
): Promise<ResultadoHorario | null> {
  if (!(await esDueno())) return null;
  return setHorarioDeBarbero(id, horario);
}
