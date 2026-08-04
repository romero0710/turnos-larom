import "server-only";
import { timingSafeEqual } from "node:crypto";
import { db } from "@/lib/db";
import { negocio, HORARIO_LUN_A_SAB } from "@/config/negocio";
import { generarId } from "@/lib/slug";
import type { Barbero, DiaSemana, RangoHorario } from "@/lib/tipos";

// ============================================================================
// Capa de datos de barberos (Fase 2.1, ladrillo 2 y 3). Fuente de verdad = la
// base (editable desde el panel). Se siembra la primera vez desde
// config/negocio.ts: los barberos, "quién hace qué servicio" (todos hacen todo,
// como hoy) y el horario de cada uno.
//
// Ladrillo 3: el horario ya NO es compartido en el config. Cada barbero tiene
// el suyo en la tabla barberos_horarios y el dueño lo edita desde el panel.
// ============================================================================

export type HorarioSemanal = Partial<Record<DiaSemana, RangoHorario[]>>;

interface FilaBarbero {
  id: string;
  nombre: string;
  clave: string;
  activo: number;
}

/** Arma el horario semanal de un barbero leyendo sus franjas de la base. */
function cargarHorario(barberoId: string): HorarioSemanal {
  const filas = db()
    .prepare(
      `SELECT dia, desde, hasta FROM barberos_horarios
       WHERE negocio_slug = ? AND barbero_id = ?
       ORDER BY dia ASC, desde ASC`,
    )
    .all(negocio.slug, barberoId) as { dia: number; desde: string; hasta: string }[];

  const horario: HorarioSemanal = {};
  for (const f of filas) {
    const dia = f.dia as DiaSemana;
    (horario[dia] ??= []).push({ desde: f.desde, hasta: f.hasta });
  }
  return horario;
}

function mapear(f: FilaBarbero): Barbero {
  return {
    id: f.id,
    nombre: f.nombre,
    activo: f.activo === 1,
    horario: cargarHorario(f.id),
    clave: f.clave,
  };
}

/** Escribe (reemplazando) las franjas de horario de un barbero en la base. */
function guardarHorarioEnBase(barberoId: string, horario: HorarioSemanal): void {
  const tx = db().transaction(() => {
    db()
      .prepare(`DELETE FROM barberos_horarios WHERE negocio_slug = ? AND barbero_id = ?`)
      .run(negocio.slug, barberoId);
    const insert = db().prepare(
      `INSERT OR IGNORE INTO barberos_horarios (negocio_slug, barbero_id, dia, desde, hasta)
       VALUES (?, ?, ?, ?, ?)`,
    );
    for (let dia = 0 as DiaSemana; dia <= 6; dia = (dia + 1) as DiaSemana) {
      for (const r of horario[dia] ?? []) {
        insert.run(negocio.slug, barberoId, dia, r.desde, r.hasta);
      }
    }
  });
  tx();
}

let _sembrado = false;

/** Siembra barberos + capacidades (servicio x barbero) si la tabla está vacía. */
function asegurarSeed(): void {
  if (_sembrado) return;
  const { n } = db()
    .prepare(`SELECT COUNT(*) AS n FROM barberos WHERE negocio_slug = ?`)
    .get(negocio.slug) as { n: number };

  if (n === 0) {
    const insertBarbero = db().prepare(
      `INSERT OR IGNORE INTO barberos (negocio_slug, id, nombre, clave, orden, activo)
       VALUES (?, ?, ?, ?, ?, 1)`,
    );
    const insertCapacidad = db().prepare(
      `INSERT OR IGNORE INTO servicios_barberos (negocio_slug, servicio_id, barbero_id)
       VALUES (?, ?, ?)`,
    );
    const insertHorario = db().prepare(
      `INSERT OR IGNORE INTO barberos_horarios (negocio_slug, barbero_id, dia, desde, hasta)
       VALUES (?, ?, ?, ?, ?)`,
    );
    const tx = db().transaction(() => {
      negocio.barberos.forEach((b, i) => {
        insertBarbero.run(negocio.slug, b.id, b.nombre, b.clave ?? generarId(b.nombre), i);
        // Compatibilidad: al sembrar, todos los barberos del config hacen
        // todos los servicios del config (así arranca igual que hoy).
        for (const s of negocio.servicios) {
          insertCapacidad.run(negocio.slug, s.id, b.id);
        }
        // Horario propio sembrado desde el config (ladrillo 3).
        for (let dia = 0 as DiaSemana; dia <= 6; dia = (dia + 1) as DiaSemana) {
          for (const r of b.horario[dia] ?? []) {
            insertHorario.run(negocio.slug, b.id, dia, r.desde, r.hasta);
          }
        }
      });
    });
    tx();
  }

  // Migración ladrillo 3: una base creada antes de esta feature tiene barberos
  // pero la tabla de horarios vacía. Si ese es el caso, sembramos a cada barbero
  // con el horario por defecto del negocio para que no queden sin disponibilidad.
  // (Una vez que exista al menos una franja, no se vuelve a tocar.)
  const { nb } = db()
    .prepare(`SELECT COUNT(*) AS nb FROM barberos WHERE negocio_slug = ?`)
    .get(negocio.slug) as { nb: number };
  const { nh } = db()
    .prepare(`SELECT COUNT(*) AS nh FROM barberos_horarios WHERE negocio_slug = ?`)
    .get(negocio.slug) as { nh: number };
  if (nb > 0 && nh === 0) {
    const ids = db()
      .prepare(`SELECT id FROM barberos WHERE negocio_slug = ?`)
      .all(negocio.slug) as { id: string }[];
    for (const { id } of ids) guardarHorarioEnBase(id, HORARIO_LUN_A_SAB);
  }

  _sembrado = true;
}

export function listarBarberos(soloActivos = true): Barbero[] {
  asegurarSeed();
  const filas = db()
    .prepare(
      `SELECT id, nombre, clave, activo FROM barberos
       WHERE negocio_slug = ?${soloActivos ? " AND activo = 1" : ""}
       ORDER BY orden ASC, nombre ASC`,
    )
    .all(negocio.slug) as FilaBarbero[];
  return filas.map(mapear);
}

/** Un barbero por id, activo o no (para resolver turnos y sesiones históricas). */
export function obtenerBarbero(id: string): Barbero | null {
  asegurarSeed();
  const f = db()
    .prepare(`SELECT id, nombre, clave, activo FROM barberos WHERE negocio_slug = ? AND id = ?`)
    .get(negocio.slug, id) as FilaBarbero | undefined;
  return f ? mapear(f) : null;
}

function igual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/** Barbero activo cuya clave coincide, o null. Comparación en tiempo constante. */
export function barberoPorClave(claveInput: string): Barbero | null {
  const clave = claveInput.trim();
  for (const b of listarBarberos(true)) {
    if (b.clave && igual(clave, b.clave)) return b;
  }
  return null;
}

// ── Capacidades: qué servicios hace cada barbero ─────────────────────────────

/** Ids de barberos activos que realizan un servicio dado. */
export function barberosParaServicio(servicioId: string): Set<string> {
  asegurarSeed();
  const filas = db()
    .prepare(
      `SELECT sb.barbero_id AS barberoId
       FROM servicios_barberos sb
       JOIN barberos b ON b.negocio_slug = sb.negocio_slug AND b.id = sb.barbero_id
       WHERE sb.negocio_slug = ? AND sb.servicio_id = ? AND b.activo = 1`,
    )
    .all(negocio.slug, servicioId) as { barberoId: string }[];
  return new Set(filas.map((f) => f.barberoId));
}

/** Ids de servicios que un barbero realiza (para el checklist del panel). */
export function serviciosDeBarbero(barberoId: string): Set<string> {
  asegurarSeed();
  const filas = db()
    .prepare(
      `SELECT servicio_id AS servicioId FROM servicios_barberos
       WHERE negocio_slug = ? AND barbero_id = ?`,
    )
    .all(negocio.slug, barberoId) as { servicioId: string }[];
  return new Set(filas.map((f) => f.servicioId));
}

/** Reemplaza el set completo de servicios que hace un barbero. */
export function setServiciosDeBarbero(barberoId: string, servicioIds: string[]): void {
  asegurarSeed();
  const tx = db().transaction(() => {
    db()
      .prepare(`DELETE FROM servicios_barberos WHERE negocio_slug = ? AND barbero_id = ?`)
      .run(negocio.slug, barberoId);
    const insert = db().prepare(
      `INSERT OR IGNORE INTO servicios_barberos (negocio_slug, servicio_id, barbero_id)
       VALUES (?, ?, ?)`,
    );
    for (const sid of servicioIds) insert.run(negocio.slug, sid, barberoId);
  });
  tx();
}

// ── Horario propio de cada barbero (ladrillo 3) ──────────────────────────────

/** Horario semanal de un barbero (para el editor del panel). */
export function horarioDeBarbero(barberoId: string): HorarioSemanal {
  asegurarSeed();
  return cargarHorario(barberoId);
}

const RE_HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

function aMin(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

/**
 * Valida un horario semanal: cada franja con formato HH:MM, desde < hasta, y
 * sin solapes dentro del mismo día. Devuelve true si es válido.
 */
function horarioValido(horario: HorarioSemanal): boolean {
  for (let dia = 0 as DiaSemana; dia <= 6; dia = (dia + 1) as DiaSemana) {
    const rangos = horario[dia];
    if (rangos === undefined) continue;
    if (!Array.isArray(rangos)) return false;
    const ordenados = [...rangos].sort((a, b) => aMin(a.desde) - aMin(b.desde));
    let finPrevio = -1;
    for (const r of ordenados) {
      if (!RE_HHMM.test(r.desde) || !RE_HHMM.test(r.hasta)) return false;
      const ini = aMin(r.desde);
      const fin = aMin(r.hasta);
      if (ini >= fin) return false; // desde debe ser antes que hasta
      if (ini < finPrevio) return false; // se solapa con la franja anterior
      finPrevio = fin;
    }
  }
  return true;
}

export type ResultadoHorario = { ok: true } | { ok: false; error: "datos" | "no-existe" };

/** Reemplaza el horario de un barbero (solo dueño; el guard vive en la action). */
export function setHorarioDeBarbero(barberoId: string, horario: HorarioSemanal): ResultadoHorario {
  asegurarSeed();
  if (!horario || typeof horario !== "object" || !horarioValido(horario)) {
    return { ok: false, error: "datos" };
  }
  if (!obtenerBarbero(barberoId)) return { ok: false, error: "no-existe" };
  guardarHorarioEnBase(barberoId, horario);
  return { ok: true };
}

// ── ABM desde el panel (solo dueño; el guard vive en las server actions) ─────

export interface DatosBarbero {
  nombre: string;
  clave?: string; // en crear es obligatoria; en actualizar, vacío = no cambiarla
}

export type ResultadoBarbero =
  | { ok: true; barbero: Barbero }
  | { ok: false; error: "datos" | "no-existe" | "clave-repetida" };

function nombreValido(nombre: string): boolean {
  return typeof nombre === "string" && nombre.trim().length >= 2;
}

function claveValida(clave: string): boolean {
  return typeof clave === "string" && clave.trim().length >= 4;
}

function claveEnUso(clave: string, ignorarId?: string): boolean {
  return listarBarberos(true).some((b) => b.id !== ignorarId && b.clave && igual(b.clave, clave.trim()));
}

export function crearBarbero(d: DatosBarbero): ResultadoBarbero {
  asegurarSeed();
  if (!nombreValido(d.nombre) || !d.clave || !claveValida(d.clave)) return { ok: false, error: "datos" };
  if (claveEnUso(d.clave)) return { ok: false, error: "clave-repetida" };

  const id = generarId(d.nombre, "barbero");
  const { m } = db()
    .prepare(`SELECT COALESCE(MAX(orden), -1) AS m FROM barberos WHERE negocio_slug = ?`)
    .get(negocio.slug) as { m: number };

  db()
    .prepare(
      `INSERT INTO barberos (negocio_slug, id, nombre, clave, orden, activo)
       VALUES (?, ?, ?, ?, ?, 1)`,
    )
    .run(negocio.slug, id, d.nombre.trim(), d.clave.trim(), m + 1);

  // Arranca con el horario por defecto del negocio (editable desde el panel),
  // así el barbero nuevo ya puede recibir turnos sin un paso extra.
  guardarHorarioEnBase(id, HORARIO_LUN_A_SAB);

  return { ok: true, barbero: obtenerBarbero(id)! };
}

export function actualizarBarbero(id: string, d: DatosBarbero): ResultadoBarbero {
  asegurarSeed();
  if (!nombreValido(d.nombre)) return { ok: false, error: "datos" };
  const claveNueva = d.clave?.trim();
  if (claveNueva) {
    if (!claveValida(claveNueva)) return { ok: false, error: "datos" };
    if (claveEnUso(claveNueva, id)) return { ok: false, error: "clave-repetida" };
  }

  const info = claveNueva
    ? db()
        .prepare(`UPDATE barberos SET nombre = ?, clave = ? WHERE negocio_slug = ? AND id = ?`)
        .run(d.nombre.trim(), claveNueva, negocio.slug, id)
    : db()
        .prepare(`UPDATE barberos SET nombre = ? WHERE negocio_slug = ? AND id = ?`)
        .run(d.nombre.trim(), negocio.slug, id);

  if (info.changes === 0) return { ok: false, error: "no-existe" };
  return { ok: true, barbero: obtenerBarbero(id)! };
}

/** Baja de barbero (soft-delete): no puede loguear ni recibir turnos nuevos. */
export function eliminarBarbero(id: string): boolean {
  asegurarSeed();
  const info = db()
    .prepare(`UPDATE barberos SET activo = 0 WHERE negocio_slug = ? AND id = ? AND activo = 1`)
    .run(negocio.slug, id);
  return info.changes > 0;
}

export function reactivarBarbero(id: string): boolean {
  asegurarSeed();
  const info = db()
    .prepare(`UPDATE barberos SET activo = 1 WHERE negocio_slug = ? AND id = ? AND activo = 0`)
    .run(negocio.slug, id);
  return info.changes > 0;
}
