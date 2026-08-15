import "server-only";
import { randomBytes } from "node:crypto";
import { db } from "@/lib/db";
import { negocio } from "@/config/negocio";
import { aMinutos, aTexto, fechaClave, slotsMinDeBarbero } from "@/lib/disponibilidad";
import { obtenerServicio } from "@/lib/servicios";
import { listarBarberos, obtenerBarbero, barberosParaServicio } from "@/lib/barberos";
import type { Barbero, Servicio } from "@/lib/tipos";

// ============================================================================
// Capa de datos de turnos. Toda la lógica de disponibilidad "real" (restando
// los turnos ya tomados) y el alta con control de doble-reserva vive acá.
// ============================================================================

interface Ocupado {
  barberoId: string;
  inicioMin: number;
  finMin: number;
}

function servicioPorId(id: string): Servicio | null {
  return obtenerServicio(id);
}

/** Barberos activos que hacen ese servicio; si se pide uno puntual, se filtra a él. */
function barberosCandidatos(barberoId: string | null, servicioId: string): Barbero[] {
  const habilitados = barberosParaServicio(servicioId);
  const activos = listarBarberos(true).filter((b) => habilitados.has(b.id));
  return barberoId ? activos.filter((b) => b.id === barberoId) : activos;
}

/** Minuto del día "ahora", solo si la fecha es hoy; si no, null (no se filtra). */
function minutosAhoraSi(fecha: Date): number | null {
  const ahora = new Date();
  if (fechaClave(fecha) !== fechaClave(ahora)) return null;
  return ahora.getHours() * 60 + ahora.getMinutes();
}

function ocupadosDelDia(slug: string, fechaKey: string): Ocupado[] {
  const filas = db()
    .prepare(
      `SELECT barbero_id AS barberoId, inicio_min AS inicioMin, fin_min AS finMin
       FROM turnos
       WHERE negocio_slug = ? AND fecha = ? AND estado = 'reservado'`,
    )
    .all(slug, fechaKey) as Ocupado[];
  return filas;
}

function haySolapamiento(
  inicio: number,
  fin: number,
  ocupadosBarbero: Ocupado[],
): boolean {
  return ocupadosBarbero.some((o) => inicio < o.finMin && o.inicioMin < fin);
}

/** ¿El barbero puede tomar este turno? (horario válido, no pasado, sin choque) */
function barberoLibreEn(
  barbero: Barbero,
  fecha: Date,
  servicio: Servicio,
  inicioMin: number,
  ocupados: Ocupado[],
  nowMin: number | null,
): boolean {
  const validos = slotsMinDeBarbero(negocio, barbero, fecha, servicio);
  if (!validos.includes(inicioMin)) return false;
  if (nowMin != null && inicioMin < nowMin) return false;
  const fin = inicioMin + servicio.duracionMin;
  const mios = ocupados.filter((o) => o.barberoId === barbero.id);
  return !haySolapamiento(inicioMin, fin, mios);
}

/**
 * Horarios de inicio disponibles para (servicio, barbero|cualquiera, fecha),
 * ya descontando los turnos tomados y las horas pasadas si es hoy.
 */
export function horariosDisponibles(
  servicioId: string,
  barberoId: string | null,
  fechaIso: string,
): string[] {
  const servicio = servicioPorId(servicioId);
  if (!servicio) return [];

  const fecha = new Date(fechaIso);
  const fechaKey = fechaClave(fecha);
  const nowMin = minutosAhoraSi(fecha);
  const ocupados = ocupadosDelDia(negocio.slug, fechaKey);
  const candidatos = barberosCandidatos(barberoId, servicio.id);

  const libres = new Set<number>();
  for (const b of candidatos) {
    for (const t of slotsMinDeBarbero(negocio, b, fecha, servicio)) {
      if (barberoLibreEn(b, fecha, servicio, t, ocupados, nowMin)) libres.add(t);
    }
  }

  return [...libres]
    .sort((a, b) => a - b)
    .map((m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`);
}

export interface DatosReserva {
  servicioId: string;
  barberoId: string | null; // null = "cualquiera"
  fechaIso: string;
  hora: string; // "HH:MM"
  nombre: string;
  telefono: string;
}

export type ResultadoReserva =
  | { ok: true; barberoId: string; barberoNombre: string; token: string }
  | { ok: false; error: "datos" | "servicio" | "tomado" };

/**
 * Alta de turno con control de doble-reserva. Todo dentro de una transacción:
 * re-chequea disponibilidad y recién ahí inserta. Si el horario se ocupó mientras
 * el cliente completaba, devuelve error "tomado".
 */
export function reservarTurno(datos: DatosReserva): ResultadoReserva {
  const nombre = datos.nombre.trim();
  const telefono = datos.telefono.trim();
  if (nombre.length < 2 || telefono.length < 6) return { ok: false, error: "datos" };

  const servicio = servicioPorId(datos.servicioId);
  if (!servicio) return { ok: false, error: "servicio" };

  const fecha = new Date(datos.fechaIso);
  const fechaKey = fechaClave(fecha);
  const inicioMin = aMinutos(datos.hora);
  const finMin = inicioMin + servicio.duracionMin;
  const nowMin = minutosAhoraSi(fecha);

  const tx = db().transaction((): ResultadoReserva => {
    const ocupados = ocupadosDelDia(negocio.slug, fechaKey);

    // Elegir barbero: el pedido, o el primero libre si es "cualquiera".
    // (Si el barbero pedido no hace este servicio, barberosCandidatos lo excluye.)
    const candidatos = barberosCandidatos(datos.barberoId, servicio.id);
    const elegido = candidatos.find((b) =>
      barberoLibreEn(b, fecha, servicio, inicioMin, ocupados, nowMin),
    );
    if (!elegido) return { ok: false, error: "tomado" };

    const token = randomBytes(16).toString("hex"); // 128 bits, imposible de adivinar

    // Confirmación por WhatsApp (ladrillo 3a): activada salvo CONFIRMACION_TURNO=false.
    const requiereConfirmacion = process.env.CONFIRMACION_TURNO !== "false" ? 1 : 0;

    db()
      .prepare(
        `INSERT INTO turnos
           (negocio_slug, servicio_id, barbero_id, fecha, inicio_min, fin_min,
            cliente_nombre, cliente_telefono, token, requiere_confirmacion, confirmado)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      )
      .run(
        negocio.slug,
        servicio.id,
        elegido.id,
        fechaKey,
        inicioMin,
        finMin,
        nombre,
        telefono,
        token,
        requiereConfirmacion,
      );

    return { ok: true, barberoId: elegido.id, barberoNombre: elegido.nombre, token };
  });

  return tx();
}

// ============================================================================
// Ver / cancelar un turno por su token secreto (sin login).
// ============================================================================

// Minutos de antelación para cancelar gratis. Configurable por negocio con la
// env CANCELACION_ANTELACION_MIN (default 120 = 2 horas antes del turno).
const MIN_ANTELACION_CANCELAR = parseInt(process.env.CANCELACION_ANTELACION_MIN || "120", 10);

interface FilaTurno {
  id: number;
  servicio_id: string;
  barbero_id: string;
  fecha: string;
  inicio_min: number;
  cliente_nombre: string;
  estado: string;
}

/** Date local del arranque del turno, a partir de fecha (YYYY-MM-DD) + inicio_min. */
function fechaHoraTurno(fecha: string, inicioMin: number): Date {
  const [y, m, d] = fecha.split("-").map(Number);
  const h = Math.floor(inicioMin / 60);
  const min = inicioMin % 60;
  return new Date(y, m - 1, d, h, min, 0, 0);
}

// Argentina UTC-3 fija (sin DST). Epoch real de un momento del turno,
// independiente de la zona horaria del servidor (los contenedores suelen correr
// en UTC). Se usa para saber si un turno ya terminó sin skew de 3 horas.
const TZ_OFFSET_MIN = 180;
function epochTurnoAr(fecha: string, min: number): number {
  const [y, m, d] = fecha.split("-").map(Number);
  return Date.UTC(y, m - 1, d, Math.floor(min / 60), min % 60) + TZ_OFFSET_MIN * 60_000;
}

export interface TurnoDetalle {
  servicioNombre: string;
  precioArs: number;
  duracionMin: number;
  barberoNombre: string;
  fechaIso: string;
  hora: string;
  estado: "reservado" | "cancelado";
  cancelable: boolean; // reservado y faltan > 2h
  yaPaso: boolean; // el turno ya ocurrió
}

function armarDetalle(fila: FilaTurno): TurnoDetalle {
  const servicio = servicioPorId(fila.servicio_id);
  const barbero = obtenerBarbero(fila.barbero_id);
  const inicio = fechaHoraTurno(fila.fecha, fila.inicio_min);
  const minutosFalta = (inicio.getTime() - Date.now()) / 60000;
  const hora = `${String(Math.floor(fila.inicio_min / 60)).padStart(2, "0")}:${String(fila.inicio_min % 60).padStart(2, "0")}`;

  return {
    servicioNombre: servicio?.nombre ?? fila.servicio_id,
    precioArs: servicio?.precioArs ?? 0,
    duracionMin: servicio?.duracionMin ?? 0,
    barberoNombre: barbero?.nombre ?? fila.barbero_id,
    fechaIso: inicio.toISOString(),
    hora,
    estado: fila.estado === "cancelado" ? "cancelado" : "reservado",
    cancelable: fila.estado === "reservado" && minutosFalta >= MIN_ANTELACION_CANCELAR,
    yaPaso: minutosFalta < 0,
  };
}

export function obtenerTurnoPorToken(token: string): TurnoDetalle | null {
  const fila = db()
    .prepare(
      `SELECT id, servicio_id, barbero_id, fecha, inicio_min, cliente_nombre, estado
       FROM turnos WHERE token = ? AND negocio_slug = ?`,
    )
    .get(token, negocio.slug) as FilaTurno | undefined;
  return fila ? armarDetalle(fila) : null;
}

export type ResultadoCancelacion =
  | { ok: true }
  | { ok: false; error: "no-existe" | "tarde" | "ya-cancelado" };

export function cancelarTurno(token: string): ResultadoCancelacion {
  const tx = db().transaction((): ResultadoCancelacion => {
    const fila = db()
      .prepare(
        `SELECT id, servicio_id, barbero_id, fecha, inicio_min, cliente_nombre, estado
         FROM turnos WHERE token = ? AND negocio_slug = ?`,
      )
      .get(token, negocio.slug) as FilaTurno | undefined;

    if (!fila) return { ok: false, error: "no-existe" };
    if (fila.estado === "cancelado") return { ok: false, error: "ya-cancelado" };

    const inicio = fechaHoraTurno(fila.fecha, fila.inicio_min);
    const minutosFalta = (inicio.getTime() - Date.now()) / 60000;
    if (minutosFalta < MIN_ANTELACION_CANCELAR) return { ok: false, error: "tarde" };

    db().prepare(`UPDATE turnos SET estado = 'cancelado' WHERE id = ?`).run(fila.id);
    return { ok: true };
  });

  return tx();
}

// ============================================================================
// Panel del dueño: agenda del día y cancelación sin la traba de las 2h.
// (El dueño manda: puede cancelar aunque falte poco, ej. si el cliente avisó
// por teléfono.) El acceso se controla en la capa de auth, no acá.
// ============================================================================

export interface TurnoAgenda {
  id: number;
  hora: string; // "HH:MM" de inicio
  finHora: string; // "HH:MM" de fin
  servicioNombre: string;
  precioArs: number;
  duracionMin: number;
  barberoNombre: string;
  clienteNombre: string;
  clienteTelefono: string;
  estado: "reservado" | "cancelado";
  pendiente: boolean; // reservado pero todavía sin confirmar por WhatsApp
  senaMonto: number; // seña pagada (0 si no hubo)
  yaTermino: boolean; // el turno ya pasó (para habilitar la marca de asistencia)
  asistio: number | null; // null = sin marcar (se asume que vino), 1 = vino, 0 = no vino
}

export interface AgendaDia {
  turnos: TurnoAgenda[]; // todos (reservados y cancelados), ordenados por hora
  totalReservados: number;
  ingresoEstimadoArs: number; // suma de precios de los reservados
}

interface FilaAgenda {
  id: number;
  servicio_id: string;
  barbero_id: string;
  inicio_min: number;
  fin_min: number;
  cliente_nombre: string;
  cliente_telefono: string;
  estado: string;
  requiere_confirmacion: number;
  confirmado: number;
  sena_monto: number;
  asistio: number | null;
}

/**
 * Turnos de un día (clave YYYY-MM-DD), ordenados por hora de inicio.
 * Si se pasa barberoId, filtra solo los de ese barbero (vista del barbero);
 * sin él, trae todos (vista del dueño).
 */
export function agendaDelDia(fechaKey: string, barberoId?: string | null): AgendaDia {
  const filas = db()
    .prepare(
      `SELECT id, servicio_id, barbero_id, inicio_min, fin_min,
              cliente_nombre, cliente_telefono, estado,
              requiere_confirmacion, confirmado, sena_monto, asistio
       FROM turnos
       WHERE negocio_slug = ? AND fecha = ?
         AND estado IN ('reservado','cancelado')
         AND (? IS NULL OR barbero_id = ?)
       ORDER BY inicio_min ASC, id ASC`,
    )
    .all(negocio.slug, fechaKey, barberoId ?? null, barberoId ?? null) as FilaAgenda[];

  const ahora = Date.now();
  const turnos: TurnoAgenda[] = filas.map((f) => {
    const servicio = servicioPorId(f.servicio_id);
    const barbero = obtenerBarbero(f.barbero_id);
    const estado = f.estado === "cancelado" ? "cancelado" : "reservado";
    const finEpoch = epochTurnoAr(fechaKey, f.fin_min);
    return {
      id: f.id,
      hora: aTexto(f.inicio_min),
      finHora: aTexto(f.fin_min),
      servicioNombre: servicio?.nombre ?? f.servicio_id,
      precioArs: servicio?.precioArs ?? 0,
      duracionMin: servicio?.duracionMin ?? 0,
      barberoNombre: barbero?.nombre ?? f.barbero_id,
      clienteNombre: f.cliente_nombre,
      clienteTelefono: f.cliente_telefono,
      estado,
      pendiente: estado === "reservado" && f.requiere_confirmacion === 1 && f.confirmado === 0,
      senaMonto: f.sena_monto ?? 0,
      yaTermino: finEpoch <= ahora,
      asistio: f.asistio ?? null,
    } as TurnoAgenda;
  });

  const reservados = turnos.filter((t) => t.estado === "reservado");
  return {
    turnos,
    totalReservados: reservados.length,
    ingresoEstimadoArs: reservados.reduce((s, t) => s + t.precioArs, 0),
  };
}

/**
 * Cancela un turno desde el panel, sin la restricción de las 2h (el personal manda).
 * Si se pasa barberoId, solo cancela si el turno es de ese barbero (un barbero no
 * puede cancelar turnos ajenos). Sin él, cancela cualquiera (vista del dueño).
 * Devuelve true si había un turno reservado que matcheara y quedó cancelado.
 */
export function cancelarTurnoAdmin(id: number, barberoId?: string | null): boolean {
  const info = db()
    .prepare(
      `UPDATE turnos SET estado = 'cancelado'
       WHERE id = ? AND negocio_slug = ? AND estado = 'reservado'
         AND (? IS NULL OR barbero_id = ?)`,
    )
    .run(id, negocio.slug, barberoId ?? null, barberoId ?? null);
  return info.changes > 0;
}

/**
 * Marca la asistencia real de un turno (Servicio 2, ladrillo 4): 1 = vino,
 * 0 = no vino, null = sin marcar (default, se asume que asistió). Solo aplica a
 * turnos reservados. Si se pasa barberoId, un barbero solo marca los suyos.
 * Alimenta la fidelización (solo los asistidos suman) y el ingreso real (un
 * no-show no factura el corte, solo la seña si la hubo).
 */
export function marcarAsistencia(
  id: number,
  asistio: 0 | 1 | null,
  barberoId?: string | null,
): boolean {
  const info = db()
    .prepare(
      `UPDATE turnos SET asistio = ?
       WHERE id = ? AND negocio_slug = ? AND estado = 'reservado'
         AND (? IS NULL OR barbero_id = ?)`,
    )
    .run(asistio, id, negocio.slug, barberoId ?? null, barberoId ?? null);
  return info.changes > 0;
}

// ============================================================================
// Métricas del negocio (panel del dueño). Agrega los turnos de un rango de días
// (claves YYYY-MM-DD, inclusive) en totales y rankings por barbero y por servicio.
// ============================================================================

export interface MetricaItem {
  id: string;
  nombre: string;
  turnos: number; // reservados en el período
  ingresoArs: number; // suma de precios de esos reservados
}

/** Totales "chatos" de un período, para comparar contra el período anterior. */
export interface ResumenPeriodo {
  turnosReservados: number;
  ingresoEstimadoArs: number;
  ticketPromedioArs: number;
  tasaCancelacion: number;
}

export interface Metricas {
  turnosReservados: number;
  turnosCancelados: number;
  turnosNoVinieron: number; // reservados marcados "no vino" (no facturan el corte)
  ingresoEstimadoArs: number;
  ticketPromedioArs: number; // ingreso / reservados (0 si no hay)
  tasaCancelacion: number; // cancelados / (reservados + cancelados), 0..1
  porBarbero: MetricaItem[]; // ordenado por ingreso desc
  porServicio: MetricaItem[]; // ordenado por ingreso desc
  anterior?: ResumenPeriodo; // totales del período equivalente anterior (si se pidió)
}

interface Acum {
  turnos: number;
  ingresoArs: number;
}

/** Métricas de un rango de fechas (inclusive). Solo cuentan los turnos reservados
 *  para ingreso/rankings; los cancelados se usan para la tasa de cancelación. */
export function metricasPeriodo(desdeKey: string, hastaKey: string): Metricas {
  const filas = db()
    .prepare(
      `SELECT servicio_id, barbero_id, estado, asistio, sena_monto
       FROM turnos
       WHERE negocio_slug = ? AND fecha >= ? AND fecha <= ?`,
    )
    .all(negocio.slug, desdeKey, hastaKey) as {
    servicio_id: string;
    barbero_id: string;
    estado: string;
    asistio: number | null;
    sena_monto: number;
  }[];

  let turnosReservados = 0;
  let turnosCancelados = 0;
  let turnosNoVinieron = 0;
  let ingresoEstimadoArs = 0;
  const porBarbero = new Map<string, Acum>();
  const porServicio = new Map<string, Acum>();

  const sumar = (mapa: Map<string, Acum>, clave: string, ingreso: number) => {
    const a = mapa.get(clave) ?? { turnos: 0, ingresoArs: 0 };
    a.turnos += 1;
    a.ingresoArs += ingreso;
    mapa.set(clave, a);
  };

  for (const f of filas) {
    if (f.estado === "cancelado") {
      turnosCancelados += 1;
      continue;
    }
    // Solo los reservados cuentan como ingreso. Los 'expirado' (turnos que no se
    // confirmaron por WhatsApp) se ignoran: ni ingreso ni cancelación.
    if (f.estado !== "reservado") continue;
    // Un turno marcado "no vino" (asistio === 0) no factura el corte: solo entra
    // la seña que se haya pagado (si la hubo). Sin marcar (null) o "vino" (1) =
    // factura el precio completo.
    const noVino = f.asistio === 0;
    const precio = servicioPorId(f.servicio_id)?.precioArs ?? 0;
    const ingreso = noVino ? f.sena_monto ?? 0 : precio;
    turnosReservados += 1;
    if (noVino) turnosNoVinieron += 1;
    ingresoEstimadoArs += ingreso;
    sumar(porBarbero, f.barbero_id, ingreso);
    sumar(porServicio, f.servicio_id, ingreso);
  }

  const aItems = (
    mapa: Map<string, Acum>,
    nombreDe: (id: string) => string,
  ): MetricaItem[] =>
    [...mapa.entries()]
      .map(([id, a]) => ({ id, nombre: nombreDe(id), turnos: a.turnos, ingresoArs: a.ingresoArs }))
      .sort((x, y) => y.ingresoArs - x.ingresoArs || y.turnos - x.turnos);

  const totalConEstado = turnosReservados + turnosCancelados;

  return {
    turnosReservados,
    turnosCancelados,
    turnosNoVinieron,
    ingresoEstimadoArs,
    ticketPromedioArs: turnosReservados > 0 ? Math.round(ingresoEstimadoArs / turnosReservados) : 0,
    tasaCancelacion: totalConEstado > 0 ? turnosCancelados / totalConEstado : 0,
    porBarbero: aItems(porBarbero, (id) => obtenerBarbero(id)?.nombre ?? id),
    porServicio: aItems(porServicio, (id) => servicioPorId(id)?.nombre ?? id),
  };
}

/** Solo los totales de un período (para usar como comparación "anterior"). */
export function resumenPeriodo(desdeKey: string, hastaKey: string): ResumenPeriodo {
  const m = metricasPeriodo(desdeKey, hastaKey);
  return {
    turnosReservados: m.turnosReservados,
    ingresoEstimadoArs: m.ingresoEstimadoArs,
    ticketPromedioArs: m.ticketPromedioArs,
    tasaCancelacion: m.tasaCancelacion,
  };
}

// ============================================================================
// Confirmación de turno por WhatsApp (Servicio 2, ladrillo 3a). El bot consume
// estas funciones vía las rutas /api/bot/*.
// ============================================================================

export interface TurnoPendiente {
  id: number;
  nombre: string;
  telefono: string;
  servicioNombre: string;
  barberoNombre: string;
  fecha: string; // YYYY-MM-DD
  inicioMin: number;
  creadoEn: string; // 'YYYY-MM-DD HH:MM:SS' (UTC, de SQLite datetime('now'))
  token: string; // para armar el link de ver/cancelar
  precioArs: number; // precio del servicio (para calcular la seña)
}

interface FilaPendiente {
  id: number;
  servicio_id: string;
  barbero_id: string;
  fecha: string;
  inicio_min: number;
  cliente_nombre: string;
  cliente_telefono: string;
  creado_en: string;
  token: string;
}

/** Turnos reservados que esperan confirmación por WhatsApp. */
export function listarPendientes(): TurnoPendiente[] {
  const filas = db()
    .prepare(
      `SELECT id, servicio_id, barbero_id, fecha, inicio_min,
              cliente_nombre, cliente_telefono, creado_en, token
       FROM turnos
       WHERE negocio_slug = ? AND estado = 'reservado'
         AND requiere_confirmacion = 1 AND confirmado = 0`,
    )
    .all(negocio.slug) as FilaPendiente[];

  return filas.map((f) => {
    const servicio = servicioPorId(f.servicio_id);
    return {
      id: f.id,
      nombre: f.cliente_nombre,
      telefono: f.cliente_telefono,
      servicioNombre: servicio?.nombre ?? f.servicio_id,
      barberoNombre: obtenerBarbero(f.barbero_id)?.nombre ?? f.barbero_id,
      fecha: f.fecha,
      inicioMin: f.inicio_min,
      creadoEn: f.creado_en,
      token: f.token,
      precioArs: servicio?.precioArs ?? 0,
    };
  });
}

/**
 * El cliente confirmó (respondió SÍ, o pagó la seña). Devuelve true si había un
 * pendiente. Si senaMonto > 0, además registra la seña pagada.
 */
export function confirmarTurno(id: number, senaMonto = 0): boolean {
  const info = db()
    .prepare(
      `UPDATE turnos SET confirmado = 1, sena_monto = ?
       WHERE id = ? AND negocio_slug = ? AND estado = 'reservado'
         AND requiere_confirmacion = 1 AND confirmado = 0`,
    )
    .run(Math.max(0, Math.round(senaMonto)), id, negocio.slug);
  return info.changes > 0;
}

/** Expira un turno pendiente (NO o timeout): libera el horario. estado='expirado'. */
export function expirarTurno(id: number): boolean {
  const info = db()
    .prepare(
      `UPDATE turnos SET estado = 'expirado'
       WHERE id = ? AND negocio_slug = ? AND estado = 'reservado' AND confirmado = 0`,
    )
    .run(id, negocio.slug);
  return info.changes > 0;
}

// ============================================================================
// Post-turno (Servicio 2, ladrillo 4): reseña de Google + fidelización.
// El bot consume estas funciones vía /api/bot/postturno. Un turno "para reseña"
// es uno reservado que ya terminó y NO fue marcado como no-show.
// ============================================================================

export interface TurnoResena {
  id: number;
  nombre: string;
  telefono: string;
  servicioNombre: string;
  finEpochMs: number; // fin del turno (epoch real, AR UTC-3)
  asistidos: number; // cortes asistidos de ese teléfono (incluye este) → fidelización
}

/**
 * Cuenta los turnos asistidos de un teléfono: reservados, ya terminados y no
 * marcados como "no vino". Es el contador de fidelización ("vas X/10"). Cuenta
 * por el teléfono tal cual se cargó al reservar (limitación conocida: si el mismo
 * cliente lo tipea distinto, se cuenta aparte).
 */
export function contarCortesAsistidos(telefono: string): number {
  const filas = db()
    .prepare(
      `SELECT fecha, fin_min, asistio FROM turnos
       WHERE negocio_slug = ? AND cliente_telefono = ? AND estado = 'reservado'`,
    )
    .all(negocio.slug, telefono) as { fecha: string; fin_min: number; asistio: number | null }[];
  const ahora = Date.now();
  return filas.filter((f) => f.asistio !== 0 && epochTurnoAr(f.fecha, f.fin_min) <= ahora).length;
}

/**
 * Turnos que ya terminaron y son candidatos a mensaje post-turno (reseña +
 * fidelización). El bot filtra por su ventana horaria y deduplica. Se acota a los
 * últimos 2 días para no recorrer todo el historial.
 */
export function listarParaResena(): TurnoResena[] {
  const ahora = Date.now();
  const hace2Dias = new Date(ahora - 2 * 86_400_000);
  const desdeKey = `${hace2Dias.getUTCFullYear()}-${String(hace2Dias.getUTCMonth() + 1).padStart(2, "0")}-${String(hace2Dias.getUTCDate()).padStart(2, "0")}`;

  const filas = db()
    .prepare(
      `SELECT id, servicio_id, fecha, inicio_min, fin_min, cliente_nombre, cliente_telefono, asistio
       FROM turnos
       WHERE negocio_slug = ? AND estado = 'reservado' AND fecha >= ?`,
    )
    .all(negocio.slug, desdeKey) as {
    id: number;
    servicio_id: string;
    fecha: string;
    inicio_min: number;
    fin_min: number;
    cliente_nombre: string;
    cliente_telefono: string;
    asistio: number | null;
  }[];

  const out: TurnoResena[] = [];
  for (const f of filas) {
    if (f.asistio === 0) continue; // no-show: no se le pide reseña ni suma
    const finEpochMs = epochTurnoAr(f.fecha, f.fin_min);
    if (finEpochMs > ahora) continue; // todavía no terminó
    out.push({
      id: f.id,
      nombre: f.cliente_nombre,
      telefono: f.cliente_telefono,
      servicioNombre: servicioPorId(f.servicio_id)?.nombre ?? f.servicio_id,
      finEpochMs,
      asistidos: contarCortesAsistidos(f.cliente_telefono),
    });
  }
  return out;
}
