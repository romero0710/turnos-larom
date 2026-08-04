import "server-only";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, unlinkSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// ============================================================================
// Almacenamiento de imágenes subidas desde el panel (fotos de servicios y, más
// adelante, galería). Viven en una carpeta de DATOS aparte del código —igual que
// la base SQLite— para que el modelo sea escalable: al copiar el molde para un
// cliente nuevo, sus datos (base + fotos) quedan separados y el backup es una
// sola carpeta. Ruta configurable con UPLOADS_PATH (útil en el VPS).
//
// Las imágenes NO se sirven como estáticos: se entregan por la ruta /media/<x>
// (ver app/media/[archivo]/route.ts), que lee de esta carpeta.
// ============================================================================

const MAX_BYTES = 4 * 1024 * 1024; // 4 MB
const PREFIJO_MEDIA = "/media/";

// Tipos permitidos: mime -> extensión.
const EXT_POR_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const CONTENT_TYPE_POR_EXT: Record<string, string> = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

export function rutaUploads(): string {
  return process.env.UPLOADS_PATH || path.join(process.cwd(), "data", "uploads");
}

function asegurarDir(): void {
  const dir = rutaUploads();
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

/** ¿Los primeros bytes coinciden con el formato declarado? (evita archivos disfrazados) */
function magicValido(buf: Buffer, ext: string): boolean {
  if (ext === "jpg") return buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff;
  if (ext === "png")
    return buf.length > 8 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;
  if (ext === "webp")
    return (
      buf.length > 12 &&
      buf.toString("ascii", 0, 4) === "RIFF" &&
      buf.toString("ascii", 8, 12) === "WEBP"
    );
  return false;
}

export type ResultadoSubida = { ok: true; ref: string } | { ok: false; error: "tipo" | "tamano" | "vacio" };

/**
 * Guarda una imagen subida y devuelve su referencia pública (/media/<archivo>).
 * Valida tipo (por mime Y por magic bytes) y tamaño.
 */
export async function guardarImagenSubida(file: File): Promise<ResultadoSubida> {
  if (!file || typeof file.arrayBuffer !== "function" || file.size === 0) {
    return { ok: false, error: "vacio" };
  }
  const ext = EXT_POR_MIME[file.type];
  if (!ext) return { ok: false, error: "tipo" };
  if (file.size > MAX_BYTES) return { ok: false, error: "tamano" };

  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.length > MAX_BYTES) return { ok: false, error: "tamano" };
  if (!magicValido(buf, ext)) return { ok: false, error: "tipo" };

  asegurarDir();
  const nombre = `${Date.now()}-${randomBytes(8).toString("hex")}.${ext}`;
  await writeFile(path.join(rutaUploads(), nombre), buf);
  return { ok: true, ref: PREFIJO_MEDIA + nombre };
}

/** ¿La referencia es una imagen que subimos nosotros (y por lo tanto borrable)? */
export function esImagenSubida(ref: string | null | undefined): boolean {
  return typeof ref === "string" && ref.startsWith(PREFIJO_MEDIA);
}

/** Borra del disco una imagen subida. No-op si no es una referencia nuestra. */
export function borrarImagenSubida(ref: string | null | undefined): void {
  if (!esImagenSubida(ref)) return;
  const nombre = path.basename(ref!.slice(PREFIJO_MEDIA.length));
  try {
    unlinkSync(path.join(rutaUploads(), nombre));
  } catch {
    // ya no existe o no se pudo borrar: no es crítico.
  }
}

/** Lee una imagen por su nombre de archivo (para servirla). Protege contra path traversal. */
export async function leerImagen(
  nombreArchivo: string,
): Promise<{ buf: Buffer; contentType: string } | null> {
  const nombre = path.basename(nombreArchivo);
  // Si el basename difiere del input, había separadores/traversal: rechazar.
  if (nombre !== nombreArchivo || nombre.includes("..")) return null;

  const ext = nombre.split(".").pop()?.toLowerCase() ?? "";
  const contentType = CONTENT_TYPE_POR_EXT[ext];
  if (!contentType) return null;

  try {
    const buf = await readFile(path.join(rutaUploads(), nombre));
    return { buf, contentType };
  } catch {
    return null;
  }
}
