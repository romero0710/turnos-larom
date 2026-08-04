import type { Barbero, DiaSemana, Negocio, Servicio } from "@/lib/tipos";

// Utilidades de horarios. Todo en minutos desde medianoche para facilitar el cálculo.

export function aMinutos(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}

export function aTexto(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Fecha -> "YYYY-MM-DD" en hora local (clave de día para la base). */
export function fechaClave(fecha: Date): string {
  const y = fecha.getFullYear();
  const m = String(fecha.getMonth() + 1).padStart(2, "0");
  const d = String(fecha.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Genera los horarios de inicio posibles para un barbero, en una fecha, para un servicio.
 * Considera el horario propio del barbero y que el servicio entre completo antes del cierre.
 * (Todavía no descuenta turnos ya tomados: eso llega con la base de datos — Fase 1.5/2.)
 */
export function slotsMinDeBarbero(
  negocio: Negocio,
  barbero: Barbero,
  fecha: Date,
  servicio: Servicio,
): number[] {
  if (!barbero.activo) return [];
  const dia = fecha.getDay() as DiaSemana;
  const rangos = barbero.horario[dia] ?? [];
  const paso = negocio.intervaloSlotMin;
  const slots: number[] = [];

  for (const rango of rangos) {
    const inicio = aMinutos(rango.desde);
    const cierre = aMinutos(rango.hasta);
    for (let t = inicio; t + servicio.duracionMin <= cierre; t += paso) {
      slots.push(t);
    }
  }
  return slots;
}

export function slotsDeBarbero(
  negocio: Negocio,
  barbero: Barbero,
  fecha: Date,
  servicio: Servicio,
): string[] {
  return slotsMinDeBarbero(negocio, barbero, fecha, servicio).map(aTexto);
}

/**
 * Slots disponibles para la selección del cliente.
 * Si barberoId es null ("cualquiera"), une los horarios de todos los barberos activos.
 * Devuelve horarios ordenados y sin duplicados.
 */
export function slotsDisponibles(
  negocio: Negocio,
  barberoId: string | null,
  fecha: Date,
  servicio: Servicio,
): string[] {
  const barberos = barberoId
    ? negocio.barberos.filter((b) => b.id === barberoId)
    : negocio.barberos.filter((b) => b.activo);

  const set = new Set<string>();
  for (const b of barberos) {
    for (const s of slotsDeBarbero(negocio, b, fecha, servicio)) set.add(s);
  }
  return [...set].sort();
}

/** ¿El negocio atiende ese día? (algún barbero activo con horario) */
export function atiendeEseDia(negocio: Negocio, fecha: Date): boolean {
  const dia = fecha.getDay() as DiaSemana;
  return negocio.barberos.some(
    (b) => b.activo && (b.horario[dia]?.length ?? 0) > 0,
  );
}

/** Próximos N días que el negocio atiende, a partir de hoy. */
export function proximosDiasHabiles(negocio: Negocio, cantidad: number): Date[] {
  const dias: Date[] = [];
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  for (let i = 0; dias.length < cantidad && i < 60; i++) {
    const d = new Date(hoy);
    d.setDate(hoy.getDate() + i);
    if (atiendeEseDia(negocio, d)) dias.push(d);
  }
  return dias;
}

const NOMBRE_DIA: Record<DiaSemana, string> = {
  0: "Domingo",
  1: "Lunes",
  2: "Martes",
  3: "Miércoles",
  4: "Jueves",
  5: "Viernes",
  6: "Sábado",
};

/**
 * Resumen de horarios de atención del negocio (unión de todos los barberos activos),
 * agrupando días consecutivos con el mismo rango. Ej: "Lunes a Sábado: 10:00–20:00".
 */
export function horarioResumen(negocio: Negocio): string[] {
  const orden: DiaSemana[] = [1, 2, 3, 4, 5, 6, 0];
  // rango unificado por día
  const rangoPorDia = new Map<DiaSemana, string>();
  for (const dia of orden) {
    let min = Infinity;
    let max = -Infinity;
    for (const b of negocio.barberos) {
      if (!b.activo) continue;
      for (const r of b.horario[dia] ?? []) {
        const [dh, dm] = r.desde.split(":").map(Number);
        const [hh, hm] = r.hasta.split(":").map(Number);
        min = Math.min(min, dh * 60 + dm);
        max = Math.max(max, hh * 60 + hm);
      }
    }
    if (min !== Infinity) {
      const fmt = (m: number) =>
        `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
      rangoPorDia.set(dia, `${fmt(min)}–${fmt(max)}`);
    }
  }

  // agrupar días consecutivos con el mismo rango
  const lineas: string[] = [];
  let i = 0;
  while (i < orden.length) {
    const dia = orden[i];
    const rango = rangoPorDia.get(dia);
    if (!rango) {
      i++;
      continue;
    }
    let j = i;
    while (j + 1 < orden.length && rangoPorDia.get(orden[j + 1]) === rango) j++;
    const etiqueta =
      i === j
        ? NOMBRE_DIA[dia]
        : `${NOMBRE_DIA[dia]} a ${NOMBRE_DIA[orden[j]]}`;
    lineas.push(`${etiqueta}: ${rango}`);
    i = j + 1;
  }
  return lineas;
}

export function nombreDiaLargo(fecha: Date): string {
  return NOMBRE_DIA[fecha.getDay() as DiaSemana];
}

export function formatearPrecio(ars: number): string {
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  }).format(ars);
}
