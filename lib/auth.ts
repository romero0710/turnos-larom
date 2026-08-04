import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { barberoPorClave, obtenerBarbero } from "@/lib/barberos";
import type { SesionPanel } from "@/lib/tipos";

// ============================================================================
// Auth del panel. Dos niveles, un solo formulario:
//   - Dueño: clave del negocio (env var PANEL_PASSWORD). Ve TODOS los turnos.
//   - Barbero: su propia clave (en config/negocio.ts). Ve/cancela SOLO lo suyo.
//
// La cookie guarda un payload ("dueno" o "barbero:<id>") FIRMADO con HMAC. Así el
// cliente no puede editarla para hacerse pasar por otro barbero ni por el dueño.
// No guarda ninguna clave en claro.
// ============================================================================

const COOKIE = "panel_sesion";
const CLAVE_DEV = "gambino"; // clave del dueño por defecto (solo desarrollo local)

export function clavePanel(): string {
  return process.env.PANEL_PASSWORD || CLAVE_DEV;
}

/** Clave usada para FIRMAR la cookie (no para ingresar). Server-side. */
function claveFirma(): string {
  return process.env.PANEL_SECRET || clavePanel();
}

function firmar(payload: string): string {
  return createHmac("sha256", claveFirma()).update(payload).digest("hex");
}

/** Comparación en tiempo constante (evita filtrar info por timing). */
function igual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

function verificarClaveDueno(input: string): boolean {
  return igual(input.trim(), clavePanel());
}

/**
 * A partir de una clave, decide quién es. El dueño tiene prioridad; si no,
 * busca un barbero activo cuya clave coincida. Devuelve null si no matchea nada.
 */
export function identificar(claveInput: string): SesionPanel | null {
  const clave = claveInput.trim();
  if (verificarClaveDueno(clave)) return { tipo: "dueno" };
  const b = barberoPorClave(clave);
  return b ? { tipo: "barbero", barberoId: b.id, barberoNombre: b.nombre } : null;
}

function payloadDe(sesion: SesionPanel): string {
  return sesion.tipo === "dueno" ? "dueno" : `barbero:${sesion.barberoId}`;
}

export async function abrirSesion(sesion: SesionPanel): Promise<void> {
  const payload = payloadDe(sesion);
  (await cookies()).set(COOKIE, `${payload}.${firmar(payload)}`, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 días
    secure: process.env.NODE_ENV === "production",
  });
}

export async function leerSesion(): Promise<SesionPanel | null> {
  const val = (await cookies()).get(COOKIE)?.value;
  if (!val) return null;

  const i = val.lastIndexOf(".");
  if (i < 0) return null;
  const payload = val.slice(0, i);
  const mac = val.slice(i + 1);
  if (!igual(mac, firmar(payload))) return null; // cookie manipulada o clave cambiada

  if (payload === "dueno") return { tipo: "dueno" };
  if (payload.startsWith("barbero:")) {
    const id = payload.slice("barbero:".length);
    const b = obtenerBarbero(id);
    return b && b.activo ? { tipo: "barbero", barberoId: b.id, barberoNombre: b.nombre } : null;
  }
  return null;
}

export async function cerrarSesion(): Promise<void> {
  (await cookies()).delete(COOKIE);
}
