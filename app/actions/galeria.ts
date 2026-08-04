"use server";

import { leerSesion } from "@/lib/auth";
import {
  listarGaleria,
  agregarFoto,
  eliminarFoto,
  reordenarGaleria,
  type FotoGaleria,
} from "@/lib/galeria";
import { guardarImagenSubida } from "@/lib/uploads";

// Gestión de la galería del carrusel: SOLO el dueño. Cada acción re-verifica la
// sesión en el servidor.

async function esDueno(): Promise<boolean> {
  const s = await leerSesion();
  return s?.tipo === "dueno";
}

export async function listarGaleriaPanel(): Promise<FotoGaleria[] | null> {
  if (!(await esDueno())) return null;
  return listarGaleria();
}

export type ResultadoFotoGaleria =
  | { ok: true; foto: FotoGaleria }
  | { ok: false; error: "tipo" | "tamano" | "vacio" | "guardado" };

/** Sube una imagen y la agrega a la galería, en un solo paso. */
export async function agregarFotoGaleriaPanel(
  formData: FormData,
): Promise<ResultadoFotoGaleria | null> {
  if (!(await esDueno())) return null;
  const file = formData.get("file");
  if (!(file instanceof File)) return { ok: false, error: "vacio" };

  const sub = await guardarImagenSubida(file);
  if (!sub.ok) return { ok: false, error: sub.error };

  const foto = agregarFoto(sub.ref);
  if (!foto) return { ok: false, error: "guardado" };
  return { ok: true, foto };
}

export async function eliminarFotoGaleriaPanel(id: number): Promise<{ ok: boolean } | null> {
  if (!(await esDueno())) return null;
  return { ok: eliminarFoto(id) };
}

export async function reordenarGaleriaPanel(ids: number[]): Promise<{ ok: boolean } | null> {
  if (!(await esDueno())) return null;
  reordenarGaleria(ids);
  return { ok: true };
}
