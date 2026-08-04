import "server-only";
import { db } from "@/lib/db";
import { negocio } from "@/config/negocio";
import { borrarImagenSubida } from "@/lib/uploads";

// ============================================================================
// Capa de datos de la galería del carrusel (Fase 2.1, Paso B). Fuente de verdad
// = la base (editable desde el panel). Se siembra UNA vez desde
// config/negocio.ts; el flag en app_meta evita re-sembrar si el dueño borra todo.
// Reusa lib/uploads para el borrado de las fotos subidas.
// ============================================================================

export interface FotoGaleria {
  id: number;
  imagen: string;
}

interface FilaGaleria {
  id: number;
  imagen: string;
}

let _sembrado = false;

function yaSembrada(): boolean {
  const r = db()
    .prepare(`SELECT 1 AS x FROM app_meta WHERE negocio_slug = ? AND clave = 'galeria_sembrada'`)
    .get(negocio.slug);
  return r !== undefined;
}

/** Siembra la galería desde el config la primera vez (y marca el flag). */
function asegurarSeed(): void {
  if (_sembrado) return;
  if (!yaSembrada()) {
    const fotos = negocio.imagenes?.galeria ?? [];
    const insert = db().prepare(
      `INSERT INTO galeria (negocio_slug, imagen, orden) VALUES (?, ?, ?)`,
    );
    const marca = db().prepare(
      `INSERT OR IGNORE INTO app_meta (negocio_slug, clave, valor) VALUES (?, 'galeria_sembrada', '1')`,
    );
    const tx = db().transaction(() => {
      fotos.forEach((src, i) => insert.run(negocio.slug, src, i));
      marca.run(negocio.slug);
    });
    tx();
  }
  _sembrado = true;
}

/** Fotos de la galería, en orden. */
export function listarGaleria(): FotoGaleria[] {
  asegurarSeed();
  const filas = db()
    .prepare(
      `SELECT id, imagen FROM galeria
       WHERE negocio_slug = ?
       ORDER BY orden ASC, id ASC`,
    )
    .all(negocio.slug) as FilaGaleria[];
  return filas.map((f) => ({ id: f.id, imagen: f.imagen }));
}

/** Agrega una foto al final de la galería. */
export function agregarFoto(imagen: string): FotoGaleria | null {
  asegurarSeed();
  const ref = typeof imagen === "string" ? imagen.trim() : "";
  if (!ref.startsWith("/") || ref.length > 300) return null;

  const { m } = db()
    .prepare(`SELECT COALESCE(MAX(orden), -1) AS m FROM galeria WHERE negocio_slug = ?`)
    .get(negocio.slug) as { m: number };
  const info = db()
    .prepare(`INSERT INTO galeria (negocio_slug, imagen, orden) VALUES (?, ?, ?)`)
    .run(negocio.slug, ref, m + 1);
  return { id: Number(info.lastInsertRowid), imagen: ref };
}

/** Elimina una foto (borrado real) y limpia el archivo si lo habíamos subido. */
export function eliminarFoto(id: number): boolean {
  asegurarSeed();
  const fila = db()
    .prepare(`SELECT imagen FROM galeria WHERE negocio_slug = ? AND id = ?`)
    .get(negocio.slug, id) as { imagen: string } | undefined;
  if (!fila) return false;

  const info = db()
    .prepare(`DELETE FROM galeria WHERE negocio_slug = ? AND id = ?`)
    .run(negocio.slug, id);
  if (info.changes === 0) return false;

  borrarImagenSubida(fila.imagen);
  return true;
}

/**
 * Reordena la galería según la lista de ids recibida (índice = nuevo orden).
 * Solo afecta ids que pertenecen a este negocio; ignora los demás.
 */
export function reordenarGaleria(ids: number[]): void {
  asegurarSeed();
  if (!Array.isArray(ids)) return;
  const actualizar = db().prepare(
    `UPDATE galeria SET orden = ? WHERE negocio_slug = ? AND id = ?`,
  );
  const tx = db().transaction(() => {
    ids.forEach((id, i) => actualizar.run(i, negocio.slug, id));
  });
  tx();
}
