"use server";

import { leerSesion } from "@/lib/auth";
import {
  actualizarServicio,
  crearServicio,
  eliminarServicio,
  listarServicios,
  type DatosServicio,
  type ResultadoServicio,
} from "@/lib/servicios";
import { guardarImagenSubida } from "@/lib/uploads";
import type { Servicio } from "@/lib/tipos";

// Gestión de servicios: SOLO el dueño. Cada acción re-verifica la sesión en el
// servidor (un barbero no puede tocar los servicios del negocio).

async function esDueno(): Promise<boolean> {
  const s = await leerSesion();
  return s?.tipo === "dueno";
}

export async function listarServiciosPanel(): Promise<Servicio[] | null> {
  if (!(await esDueno())) return null;
  return listarServicios(true);
}

export async function crearServicioPanel(datos: DatosServicio): Promise<ResultadoServicio | null> {
  if (!(await esDueno())) return null;
  return crearServicio(datos);
}

export async function actualizarServicioPanel(
  id: string,
  datos: DatosServicio,
): Promise<ResultadoServicio | null> {
  if (!(await esDueno())) return null;
  return actualizarServicio(id, datos);
}

export async function eliminarServicioPanel(id: string): Promise<{ ok: boolean } | null> {
  if (!(await esDueno())) return null;
  return { ok: eliminarServicio(id) };
}

export type ResultadoSubidaImagen =
  | { ok: true; ref: string }
  | { ok: false; error: "tipo" | "tamano" | "vacio" };

/** Sube una imagen (solo dueño) y devuelve su referencia /media/<archivo>. */
export async function subirImagenServicio(
  formData: FormData,
): Promise<ResultadoSubidaImagen | null> {
  if (!(await esDueno())) return null;
  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "vacio" };
  return guardarImagenSubida(file);
}
