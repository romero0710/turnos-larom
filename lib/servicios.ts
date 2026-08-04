import "server-only";
import { db } from "@/lib/db";
import { negocio } from "@/config/negocio";
import { generarId } from "@/lib/slug";
import { borrarImagenSubida, esImagenSubida } from "@/lib/uploads";
import type { Servicio } from "@/lib/tipos";

// ============================================================================
// Capa de datos de servicios. Fuente de verdad = la base (editable desde el
// panel). La primera vez se siembra con lo que está en config/negocio.ts, así
// un negocio nuevo arranca con sus servicios por defecto sin tocar la base.
// ============================================================================

interface FilaServicio {
  id: string;
  nombre: string;
  precio_ars: number;
  duracion_min: number;
  imagen: string | null;
}

function mapear(f: FilaServicio): Servicio {
  return {
    id: f.id,
    nombre: f.nombre,
    precioArs: f.precio_ars,
    duracionMin: f.duracion_min,
    imagen: f.imagen ?? undefined,
  };
}

let _sembrado = false;

/** Siembra los servicios por defecto si la tabla está vacía para este negocio. */
function asegurarSeed(): void {
  if (_sembrado) return;
  const { n } = db()
    .prepare(`SELECT COUNT(*) AS n FROM servicios WHERE negocio_slug = ?`)
    .get(negocio.slug) as { n: number };

  if (n === 0) {
    const insert = db().prepare(
      `INSERT OR IGNORE INTO servicios
         (negocio_slug, id, nombre, precio_ars, duracion_min, imagen, orden, activo)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
    );
    const tx = db().transaction(() => {
      negocio.servicios.forEach((s, i) => {
        insert.run(negocio.slug, s.id, s.nombre, s.precioArs, s.duracionMin, s.imagen ?? null, i);
      });
    });
    tx();
  }
  _sembrado = true;
}

/** Servicios del negocio. Por defecto solo los activos (para la web pública). */
export function listarServicios(soloActivos = true): Servicio[] {
  asegurarSeed();
  const filas = db()
    .prepare(
      `SELECT id, nombre, precio_ars, duracion_min, imagen
       FROM servicios
       WHERE negocio_slug = ?${soloActivos ? " AND activo = 1" : ""}
       ORDER BY orden ASC, nombre ASC`,
    )
    .all(negocio.slug) as FilaServicio[];
  return filas.map(mapear);
}

/** Un servicio por id, activo o no (para resolver turnos históricos). */
export function obtenerServicio(id: string): Servicio | null {
  asegurarSeed();
  const f = db()
    .prepare(
      `SELECT id, nombre, precio_ars, duracion_min, imagen
       FROM servicios WHERE negocio_slug = ? AND id = ?`,
    )
    .get(negocio.slug, id) as FilaServicio | undefined;
  return f ? mapear(f) : null;
}

// ── ABM desde el panel (solo dueño; el guard vive en las server actions) ─────

export interface DatosServicio {
  nombre: string;
  precioArs: number;
  duracionMin: number;
  // Ruta de la imagen: string = usar esa; null = quitar; undefined = no tocar.
  imagen?: string | null;
}

/** Normaliza la referencia de imagen: acepta rutas /... (subidas o de /public). */
function normalizarImagen(imagen: string | null | undefined): string | null {
  if (imagen == null) return null;
  const ref = imagen.trim();
  if (!ref.startsWith("/") || ref.length > 300) return null;
  return ref;
}

export type ResultadoServicio =
  | { ok: true; servicio: Servicio }
  | { ok: false; error: "datos" | "no-existe" };

function datosValidos(d: DatosServicio): boolean {
  return (
    typeof d.nombre === "string" &&
    d.nombre.trim().length >= 2 &&
    Number.isFinite(d.precioArs) &&
    d.precioArs >= 0 &&
    Number.isInteger(d.duracionMin) &&
    d.duracionMin >= 5 &&
    d.duracionMin <= 480
  );
}

export function crearServicio(d: DatosServicio): ResultadoServicio {
  asegurarSeed();
  if (!datosValidos(d)) return { ok: false, error: "datos" };

  const id = generarId(d.nombre, "servicio");
  const { m } = db()
    .prepare(`SELECT COALESCE(MAX(orden), -1) AS m FROM servicios WHERE negocio_slug = ?`)
    .get(negocio.slug) as { m: number };

  db()
    .prepare(
      `INSERT INTO servicios
         (negocio_slug, id, nombre, precio_ars, duracion_min, imagen, orden, activo)
       VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
    )
    .run(negocio.slug, id, d.nombre.trim(), Math.round(d.precioArs), d.duracionMin, normalizarImagen(d.imagen), m + 1);

  return { ok: true, servicio: obtenerServicio(id)! };
}

export function actualizarServicio(id: string, d: DatosServicio): ResultadoServicio {
  asegurarSeed();
  if (!datosValidos(d)) return { ok: false, error: "datos" };

  const previo = obtenerServicio(id);

  // La imagen solo se toca si viene en los datos (undefined = dejarla como está).
  const tocaImagen = d.imagen !== undefined;
  const imagenNueva = tocaImagen ? normalizarImagen(d.imagen) : null;

  const info = tocaImagen
    ? db()
        .prepare(
          `UPDATE servicios SET nombre = ?, precio_ars = ?, duracion_min = ?, imagen = ?
           WHERE negocio_slug = ? AND id = ?`,
        )
        .run(d.nombre.trim(), Math.round(d.precioArs), d.duracionMin, imagenNueva, negocio.slug, id)
    : db()
        .prepare(
          `UPDATE servicios SET nombre = ?, precio_ars = ?, duracion_min = ?
           WHERE negocio_slug = ? AND id = ?`,
        )
        .run(d.nombre.trim(), Math.round(d.precioArs), d.duracionMin, negocio.slug, id);

  if (info.changes === 0) return { ok: false, error: "no-existe" };

  // Si se reemplazó/quitó una imagen que habíamos subido nosotros, borrar la vieja.
  if (tocaImagen && previo?.imagen && previo.imagen !== imagenNueva && esImagenSubida(previo.imagen)) {
    borrarImagenSubida(previo.imagen);
  }

  return { ok: true, servicio: obtenerServicio(id)! };
}

/**
 * Baja de servicio (soft-delete): se marca inactivo. No se borra la fila para que
 * los turnos que lo referencian sigan mostrando su nombre y precio.
 */
export function eliminarServicio(id: string): boolean {
  asegurarSeed();
  const info = db()
    .prepare(`UPDATE servicios SET activo = 0 WHERE negocio_slug = ? AND id = ? AND activo = 1`)
    .run(negocio.slug, id);
  return info.changes > 0;
}
