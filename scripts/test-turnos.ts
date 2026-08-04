// Test de integración de la lógica de turnos contra una base SQLite temporal.
// Ejecutar con: npm run test:turnos
import { tmpdir } from "node:os";
import { rmSync } from "node:fs";
import path from "node:path";

// Base temporal propia (se lee de forma perezosa en el primer uso de db()).
const DB_TMP = path.join(tmpdir(), `test-turnos-${Date.now()}.db`);
process.env.DB_PATH = DB_TMP;
// Carpeta de uploads temporal (para no ensuciar la real).
const UPLOADS_TMP = path.join(tmpdir(), `test-uploads-${Date.now()}`);
process.env.UPLOADS_PATH = UPLOADS_TMP;

import { negocio } from "@/config/negocio";
import type { DiaSemana } from "@/lib/tipos";
import { proximosDiasHabiles, fechaClave } from "@/lib/disponibilidad";
import {
  horariosDisponibles,
  reservarTurno,
  obtenerTurnoPorToken,
  cancelarTurno,
  agendaDelDia,
  cancelarTurnoAdmin,
  metricasPeriodo,
} from "@/lib/turnos";
import { identificar } from "@/lib/auth";
import {
  listarServicios,
  obtenerServicio,
  crearServicio,
  actualizarServicio,
  eliminarServicio,
} from "@/lib/servicios";
import {
  guardarImagenSubida,
  leerImagen,
  borrarImagenSubida,
  esImagenSubida,
} from "@/lib/uploads";
import {
  listarGaleria,
  agregarFoto,
  eliminarFoto,
  reordenarGaleria,
} from "@/lib/galeria";
import {
  listarBarberos,
  obtenerBarbero,
  barberosParaServicio,
  serviciosDeBarbero,
  setServiciosDeBarbero,
  crearBarbero,
  actualizarBarbero,
  eliminarBarbero,
  reactivarBarbero,
  horarioDeBarbero,
  setHorarioDeBarbero,
  type HorarioSemanal,
} from "@/lib/barberos";
import { db } from "@/lib/db";

let fallos = 0;
function check(nombre: string, cond: boolean) {
  console.log(`${cond ? "✅" : "❌"} ${nombre}`);
  if (!cond) fallos++;
}

// Día hábil a futuro (evita el filtro de horas pasadas de "hoy").
const dias = proximosDiasHabiles(negocio, 5);
const hoy = fechaClave(new Date());
const dia = dias.find((d) => fechaClave(d) !== hoy)!;
const fechaIso = dia.toISOString();
console.log("Día de prueba:", fechaClave(dia), "\n");

// 1) Horarios iniciales para Lucas / corte
const h1 = horariosDisponibles("corte", "lucas", fechaIso);
check("Hay horarios libres al inicio", h1.length > 0);
check("Incluye 10:00 al inicio", h1.includes("10:00"));

// 2) Reservar corte con Lucas 10:00 (corte = 30min -> ocupa 10:00–10:30)
const r1 = reservarTurno({
  servicioId: "corte", barberoId: "lucas", fechaIso, hora: "10:00",
  nombre: "Juan Perez", telefono: "1122334455",
});
check("Reserva 10:00 Lucas OK", r1.ok && r1.barberoId === "lucas");

// 3) 10:00 y 10:15 ya no aparecen (solapan con 10:00–10:30); 10:30 sí
const h2 = horariosDisponibles("corte", "lucas", fechaIso);
check("10:00 ya no está libre", !h2.includes("10:00"));
check("10:15 ya no está libre (solape)", !h2.includes("10:15"));
check("10:30 sigue libre", h2.includes("10:30"));

// 4) Doble reserva exacta -> tomado
const r2 = reservarTurno({
  servicioId: "corte", barberoId: "lucas", fechaIso, hora: "10:00",
  nombre: "Otro", telefono: "1100000000",
});
check("Doble reserva exacta rechazada", !r2.ok && r2.error === "tomado");

// 5) "Cualquiera" a las 10:00 -> asigna a Joel o Agustín (Lucas ocupado)
const r3 = reservarTurno({
  servicioId: "corte", barberoId: null, fechaIso, hora: "10:00",
  nombre: "Cliente Tres", telefono: "1133333333",
});
check("Cualquiera 10:00 asigna otro barbero", r3.ok && r3.barberoId !== "lucas");

// 6) Ocupar al tercer barbero también a las 10:00, luego "cualquiera" -> tomado
const restante = listarBarberos().find(
  (b) => b.id !== "lucas" && r3.ok && b.id !== r3.barberoId,
)!;
const r4 = reservarTurno({
  servicioId: "corte", barberoId: restante.id, fechaIso, hora: "10:00",
  nombre: "Cliente Cuatro", telefono: "1144444444",
});
check("Tercer barbero 10:00 OK", r4.ok);
const r5 = reservarTurno({
  servicioId: "corte", barberoId: null, fechaIso, hora: "10:00",
  nombre: "Sin lugar", telefono: "1155555555",
});
check("Cualquiera sin lugar -> tomado", !r5.ok && r5.error === "tomado");

// 7) Datos inválidos
const r6 = reservarTurno({
  servicioId: "corte", barberoId: "joel", fechaIso, hora: "12:00",
  nombre: "A", telefono: "1",
});
check("Datos inválidos rechazados", !r6.ok && r6.error === "datos");

// ── Ver / cancelar turno por token ──────────────────────────────────────────
// Reserva en un día futuro (cancelable, faltan > 2h).
const r7 = reservarTurno({
  servicioId: "corte", barberoId: "lucas", fechaIso, hora: "11:00",
  nombre: "Cliente Cancel", telefono: "1166666666",
});
check("Reserva 11:00 devuelve token", r7.ok && typeof r7.token === "string" && r7.token.length >= 16);
const token = r7.ok ? r7.token : "";

const det = obtenerTurnoPorToken(token);
check("verTurno trae el detalle", det !== null && det.estado === "reservado");
check("Turno futuro es cancelable", det !== null && det.cancelable === true);

check("11:00 ocupado antes de cancelar", !horariosDisponibles("corte", "lucas", fechaIso).includes("11:00"));

const c1 = cancelarTurno(token);
check("Cancelar turno futuro OK", c1.ok);
check("Tras cancelar, estado = cancelado", obtenerTurnoPorToken(token)?.estado === "cancelado");
check("11:00 se liberó tras cancelar", horariosDisponibles("corte", "lucas", fechaIso).includes("11:00"));

const c2 = cancelarTurno(token);
check("Cancelar dos veces -> ya-cancelado", !c2.ok && c2.error === "ya-cancelado");

check("Token inválido -> null", obtenerTurnoPorToken("noexiste123") === null);
const c3 = cancelarTurno("noexiste123");
check("Cancelar token inválido -> no-existe", !c3.ok && c3.error === "no-existe");

// Regla de 2h: insertamos directo un turno que arranca en ~1h y no debe poder cancelarse.
const ahora = new Date();
const inicioCerca = ahora.getHours() * 60 + ahora.getMinutes() + 60; // +1h
if (inicioCerca < 24 * 60) {
  db().prepare(
    `INSERT INTO turnos
       (negocio_slug, servicio_id, barbero_id, fecha, inicio_min, fin_min,
        cliente_nombre, cliente_telefono, token)
     VALUES (?, 'corte', 'joel', ?, ?, ?, 'Cercano', '1100000000', 'tok-cerca')`,
  ).run(negocio.slug, fechaClave(ahora), inicioCerca, inicioCerca + 30);
  const c4 = cancelarTurno("tok-cerca");
  check("Cancelar con < 2h -> tarde", !c4.ok && c4.error === "tarde");

  // El dueño SÍ puede cancelar ese mismo turno con < 2h (sin traba).
  const filaCerca = db().prepare(`SELECT id FROM turnos WHERE token = 'tok-cerca'`).get() as { id: number } | undefined;
  check("Dueño cancela turno con < 2h (sin traba)", filaCerca != null && cancelarTurnoAdmin(filaCerca.id) === true);
} else {
  check("Cancelar con < 2h -> tarde (omitido por horario)", true);
}

// ── Panel: agenda del día (vista del dueño = todos) ──────────────────────────
// En el día de prueba quedaron 3 reservados (10:00 Lucas, 10:00 otro, 10:00 tercero)
// y 1 cancelado (11:00 Lucas, cancelado más arriba).
const ag = agendaDelDia(fechaClave(dia));
check("Agenda dueño: 4 turnos en el día", ag.turnos.length === 4);
check("Agenda dueño: 3 reservados", ag.totalReservados === 3);
check("Agenda dueño: ingreso estimado = 3 cortes (45000)", ag.ingresoEstimadoArs === 45000);
check("Agenda dueño: trae teléfono del cliente", ag.turnos.some((t) => t.clienteTelefono === "1122334455"));
check("Agenda dueño: ordenada por hora", ag.turnos.every((t, i, arr) => i === 0 || arr[i - 1].hora <= t.hora));

// ── Vista del barbero (filtrada) ─────────────────────────────────────────────
const agLucas = agendaDelDia(fechaClave(dia), "lucas");
check("Agenda Lucas: solo turnos de Lucas", agLucas.turnos.every((t) => t.barberoNombre === "Lucas"));
check("Agenda Lucas: 1 reservado", agLucas.totalReservados === 1);

// Un barbero no puede cancelar el turno de otro.
const turnoLucas = agLucas.turnos.find((t) => t.estado === "reservado")!;
check("Joel NO cancela turno de Lucas", cancelarTurnoAdmin(turnoLucas.id, "joel") === false);
check("Lucas SÍ cancela su propio turno", cancelarTurnoAdmin(turnoLucas.id, "lucas") === true);

// El dueño cancela cualquiera (sin filtro).
const ag2 = agendaDelDia(fechaClave(dia));
check("Tras cancelar Lucas, 2 reservados", ag2.totalReservados === 2);
const otro = ag2.turnos.find((t) => t.estado === "reservado")!;
check("Dueño cancela cualquier turno", cancelarTurnoAdmin(otro.id) === true);
check("Cancelar id inexistente -> false", cancelarTurnoAdmin(999999) === false);

// ── Identificación por clave (login por barbero / dueño) ─────────────────────
// En test no hay PANEL_PASSWORD, así que la clave del dueño es la de dev ("gambino").
const sesDueno = identificar("gambino");
check("Clave del dueño -> sesión dueño", sesDueno?.tipo === "dueno");
const sesLucas = identificar("lucas25");
check("Clave de Lucas -> sesión barbero Lucas", sesLucas?.tipo === "barbero" && sesLucas.barberoId === "lucas");
check("Clave inexistente -> null", identificar("no-existe-123") === null);

// ── Fase 2.1: servicios en la base (seed + ABM) ──────────────────────────────
// Seed automático desde config la primera vez.
const svcs = listarServicios();
check("Servicios: seed trae 3", svcs.length === 3);
check(
  "Servicios: corte 15000 / 30min",
  obtenerServicio("corte")?.precioArs === 15000 && obtenerServicio("corte")?.duracionMin === 30,
);

// Crear
const cr = crearServicio({ nombre: "Corte + lavado", precioArs: 18000, duracionMin: 40 });
check("Servicios: crear OK", cr.ok);
const nuevoId = cr.ok ? cr.servicio.id : "";
check("Servicios: aparece en la lista activa", listarServicios().some((s) => s.id === nuevoId));

// Crear inválido
check("Servicios: crear con nombre corto -> datos", crearServicio({ nombre: "A", precioArs: 1000, duracionMin: 30 }).ok === false);
check("Servicios: crear con duración inválida -> datos", crearServicio({ nombre: "Test", precioArs: 1000, duracionMin: 1 }).ok === false);

// Actualizar (precio)
const up = actualizarServicio("corte", { nombre: "Corte", precioArs: 16000, duracionMin: 30 });
check("Servicios: actualizar OK", up.ok === true);
check("Servicios: precio actualizado persiste", obtenerServicio("corte")?.precioArs === 16000);
check("Servicios: actualizar id inexistente -> no-existe", actualizarServicio("noexiste", { nombre: "X", precioArs: 1, duracionMin: 30 }).ok === false);

// Baja (soft-delete: sale de la lista pero la fila queda para históricos)
check("Servicios: baja OK", eliminarServicio(nuevoId) === true);
check("Servicios: baja lo saca de la lista activa", !listarServicios().some((s) => s.id === nuevoId));
check("Servicios: baja NO borra la fila (histórico)", obtenerServicio(nuevoId) !== null);

// La duración editada afecta nuevas reservas (fin_min sale de la base).
actualizarServicio("barba", { nombre: "Barba", precioArs: 6000, duracionMin: 60 });
const rb = reservarTurno({ servicioId: "barba", barberoId: "lucas", fechaIso, hora: "16:00", nombre: "Barba Test", telefono: "1199999999" });
check("Servicios: reserva de barba (60min) OK", rb.ok);
const agBarba = agendaDelDia(fechaClave(dia), "lucas");
const turnoBarba = agBarba.turnos.find((t) => t.hora === "16:00");
check("Servicios: barba dura 60min en la agenda (16:00→17:00)", turnoBarba?.finHora === "17:00");

// ── Fase 2.1, ladrillo 2: barberos en la base (seed + capacidades + ABM) ─────
const brb = listarBarberos();
check("Barberos: seed trae 3", brb.length === 3);
check(
  "Barberos: Lucas viene con su clave sembrada",
  obtenerBarbero("lucas")?.nombre === "Lucas" && obtenerBarbero("lucas")?.clave === "lucas25",
);

// Al sembrar, todos los barberos hacen todos los servicios del config (compatibilidad).
check("Capacidades: seed -> los 3 hacen 'corte'", barberosParaServicio("corte").size === 3);
check("Capacidades: Lucas hace 'corte' y 'barba'", serviciosDeBarbero("lucas").has("corte") && serviciosDeBarbero("lucas").has("barba"));

// Servicio nuevo (ej. "Tintura"): nadie lo hace hasta que se asigne explícitamente.
const crTintura = crearServicio({ nombre: "Tintura", precioArs: 12000, duracionMin: 45 });
check("Capacidades: servicio nuevo crea OK", crTintura.ok);
const tinturaId = crTintura.ok ? crTintura.servicio.id : "";
check("Capacidades: servicio nuevo, nadie lo hace todavía", barberosParaServicio(tinturaId).size === 0);
check("Capacidades: sin nadie asignado, no hay horarios", horariosDisponibles(tinturaId, null, fechaIso).length === 0);

// Un barbero puntual (Joel) NO hace tintura -> reservarle tintura falla, aunque tenga la agenda libre.
const rTinturaJoel = reservarTurno({ servicioId: tinturaId, barberoId: "joel", fechaIso, hora: "12:00", nombre: "Cliente Tintura", telefono: "1177777777" });
check("Capacidades: reservar tintura con barbero que no la hace -> tomado", !rTinturaJoel.ok && rTinturaJoel.error === "tomado");

// Se asigna la tintura solo a Lucas.
setServiciosDeBarbero("lucas", [...serviciosDeBarbero("lucas"), tinturaId]);
check("Capacidades: tras asignar, Lucas hace tintura", serviciosDeBarbero("lucas").has(tinturaId));
check("Capacidades: barberosParaServicio ahora trae a Lucas", barberosParaServicio(tinturaId).has("lucas") && barberosParaServicio(tinturaId).size === 1);
const rTinturaLucas = reservarTurno({ servicioId: tinturaId, barberoId: "lucas", fechaIso, hora: "12:00", nombre: "Cliente Tintura", telefono: "1177777777" });
check("Capacidades: reservar tintura con Lucas OK", rTinturaLucas.ok);
check("Capacidades: 'cualquiera' de tintura solo ofrece horarios de Lucas", horariosDisponibles(tinturaId, null, fechaIso).length > 0);

// ── ABM de barberos ───────────────────────────────────────────────────────────
const crB = crearBarbero({ nombre: "Martín", clave: "martin1" });
check("Barberos: crear OK", crB.ok);
const martinId = crB.ok ? crB.barbero.id : "";
check("Barberos: nuevo barbero sin servicios asignados", serviciosDeBarbero(martinId).size === 0);
check("Barberos: crear con clave repetida -> clave-repetida", crearBarbero({ nombre: "Otro", clave: "lucas25" }).ok === false);
check("Barberos: crear con clave corta -> datos", crearBarbero({ nombre: "Corto", clave: "abc" }).ok === false);
check("Barberos: crear con nombre corto -> datos", crearBarbero({ nombre: "A", clave: "algo123" }).ok === false);

// Login con la clave nueva.
const sesMartin = identificar("martin1");
check("Barberos: clave nueva loguea como barbero Martín", sesMartin?.tipo === "barbero" && sesMartin.barberoId === martinId);

// Actualizar solo nombre (sin tocar clave): la clave vieja sigue sirviendo.
const upB1 = actualizarBarbero(martinId, { nombre: "Martín G." });
check("Barberos: actualizar solo nombre OK", upB1.ok === true);
check("Barberos: clave vieja sigue funcionando", identificar("martin1")?.tipo === "barbero");

// Cambiar la clave: la vieja deja de servir, la nueva sí.
const upB2 = actualizarBarbero(martinId, { nombre: "Martín G.", clave: "martin2" });
check("Barberos: cambiar clave OK", upB2.ok === true);
check("Barberos: clave vieja ya no loguea", identificar("martin1") === null);
check("Barberos: clave nueva loguea", identificar("martin2")?.tipo === "barbero");
check("Barberos: actualizar id inexistente -> no-existe", actualizarBarbero("noexiste", { nombre: "X" }).ok === false);

// Baja: no puede loguear ni aparece en la lista activa; el dueño lo puede reactivar.
check("Barberos: baja OK", eliminarBarbero(martinId) === true);
check("Barberos: de baja no aparece en lista activa", !listarBarberos(true).some((b) => b.id === martinId));
check("Barberos: de baja no puede loguear", identificar("martin2") === null);
check("Barberos: reactivar OK", reactivarBarbero(martinId) === true);
check("Barberos: reactivado vuelve a loguear", identificar("martin2")?.tipo === "barbero");
check("Barberos: reactivado aparece en lista activa", listarBarberos(true).some((b) => b.id === martinId));

// ── Fase 2.1, ladrillo 3: horario propio por barbero ─────────────────────────
// Seed: el horario se sembró desde el config (Lun–Sáb 10–20, Domingo cerrado).
check("Horario: seed de Lucas abre 10:00 el lunes", horarioDeBarbero("lucas")[1]?.[0]?.desde === "10:00");
check("Horario: seed de Lucas cierra 20:00 el lunes", horarioDeBarbero("lucas")[1]?.[0]?.hasta === "20:00");
check("Horario: seed de Lucas NO trabaja domingo", horarioDeBarbero("lucas")[0] === undefined);

// Día de la semana del día de prueba (siempre Lun–Sáb: el negocio no atiende domingo).
const ds = dia.getDay() as DiaSemana;

// Barbero nuevo y aislado para probar horario sin arrastrar reservas previas.
const crH = crearBarbero({ nombre: "Horacio", clave: "hora1234" });
check("Horario: crear barbero de prueba OK", crH.ok);
const hid = crH.ok ? crH.barbero.id : "";
check("Horario: barbero nuevo arranca con horario por defecto", (horarioDeBarbero(hid)[ds]?.length ?? 0) > 0);
setServiciosDeBarbero(hid, ["corte"]); // habilitarlo para 'corte' (corte = 30 min)

// Setear una sola franja ese día: 09:00–12:00.
check("Horario: setear franja 09–12 OK", setHorarioDeBarbero(hid, { [ds]: [{ desde: "09:00", hasta: "12:00" }] } as HorarioSemanal).ok === true);
check("Horario: persiste (desde 09:00)", horarioDeBarbero(hid)[ds]?.[0]?.desde === "09:00");
const hsH = horariosDisponibles("corte", hid, fechaIso);
check("Horario: ofrece 09:00 (apertura)", hsH.includes("09:00"));
check("Horario: 11:30 es el último antes del cierre (12:00)", hsH.includes("11:30"));
check("Horario: no ofrece 12:00 (no entra el corte antes de cerrar)", !hsH.includes("12:00"));
check("Horario: no ofrece horas fuera del rango (08:45 / 13:00)", !hsH.includes("08:45") && !hsH.includes("13:00"));

// Vaciar el horario: ese día no trabaja -> sin horarios.
check("Horario: vaciar (no trabaja ningún día) OK", setHorarioDeBarbero(hid, {}).ok === true);
check("Horario: sin franjas, no hay horarios disponibles", horariosDisponibles("corte", hid, fechaIso).length === 0);

// Validaciones.
check("Horario: inicio >= fin -> datos", setHorarioDeBarbero(hid, { [ds]: [{ desde: "12:00", hasta: "10:00" }] } as HorarioSemanal).ok === false);
check("Horario: formato inválido (9:00) -> datos", setHorarioDeBarbero(hid, { [ds]: [{ desde: "9:00", hasta: "20:00" }] } as HorarioSemanal).ok === false);
check("Horario: franjas solapadas -> datos", setHorarioDeBarbero(hid, { [ds]: [{ desde: "09:00", hasta: "12:00" }, { desde: "11:00", hasta: "14:00" }] } as HorarioSemanal).ok === false);
check("Horario: turno partido sin solape OK", setHorarioDeBarbero(hid, { [ds]: [{ desde: "09:00", hasta: "12:00" }, { desde: "14:00", hasta: "18:00" }] } as HorarioSemanal).ok === true);
// La disponibilidad respeta el corte del mediodía (09–12 y 14–18).
const hsPart = horariosDisponibles("corte", hid, fechaIso);
check("Turno partido: ofrece mañana (09:00 y 11:30)", hsPart.includes("09:00") && hsPart.includes("11:30"));
check("Turno partido: no ofrece el hueco (12:00 / 13:00)", !hsPart.includes("12:00") && !hsPart.includes("13:00"));
check("Turno partido: ofrece tarde (14:00 y 17:30)", hsPart.includes("14:00") && hsPart.includes("17:30"));
check("Turno partido: cierra a las 18:00 (no 18:00)", !hsPart.includes("18:00"));
check("Horario: setear a barbero inexistente -> no-existe", setHorarioDeBarbero("no-existe", { [ds]: [{ desde: "09:00", hasta: "12:00" }] } as HorarioSemanal).ok === false);

// ── Extras 2.1: métricas del negocio ─────────────────────────────────────────
const fkMet = fechaClave(dia);
const agHoy = agendaDelDia(fkMet);
const met = metricasPeriodo(fkMet, fkMet);
check("Métricas: reservados coinciden con la agenda", met.turnosReservados === agHoy.totalReservados);
check("Métricas: ingreso coincide con la agenda", met.ingresoEstimadoArs === agHoy.ingresoEstimadoArs);
check("Métricas: cancelados = agenda total - reservados", met.turnosCancelados === agHoy.turnos.length - agHoy.totalReservados);
check("Métricas: suma de turnos por barbero = reservados", met.porBarbero.reduce((s, i) => s + i.turnos, 0) === met.turnosReservados);
check("Métricas: suma de turnos por servicio = reservados", met.porServicio.reduce((s, i) => s + i.turnos, 0) === met.turnosReservados);
check("Métricas: ranking por barbero ordenado por ingreso desc", met.porBarbero.every((it, i, arr) => i === 0 || arr[i - 1].ingresoArs >= it.ingresoArs));
check("Métricas: ticket promedio coherente", met.turnosReservados === 0 ? met.ticketPromedioArs === 0 : met.ticketPromedioArs === Math.round(met.ingresoEstimadoArs / met.turnosReservados));
check("Métricas: tasa de cancelación entre 0 y 1", met.tasaCancelacion >= 0 && met.tasaCancelacion <= 1);

const vac = metricasPeriodo("2099-01-01", "2099-01-01");
check("Métricas: rango sin turnos -> todo en cero", vac.turnosReservados === 0 && vac.ingresoEstimadoArs === 0 && vac.turnosCancelados === 0 && vac.porBarbero.length === 0 && vac.porServicio.length === 0);
check("Métricas: rango sin turnos -> ticket y tasa en cero", vac.ticketPromedioArs === 0 && vac.tasaCancelacion === 0);

// ── Paso A: imágenes en servicios (columna imagen) ───────────────────────────
const crImg = crearServicio({ nombre: "Peinado", precioArs: 8000, duracionMin: 20, imagen: "/media/foto1.png" });
check("Imagen: crear servicio con imagen OK", crImg.ok);
const peinadoId = crImg.ok ? crImg.servicio.id : "";
check("Imagen: la imagen persiste al crear", obtenerServicio(peinadoId)?.imagen === "/media/foto1.png");

const crSinImg = crearServicio({ nombre: "Cejas", precioArs: 3000, duracionMin: 10 });
check("Imagen: crear sin imagen -> queda sin imagen", crSinImg.ok && obtenerServicio(crSinImg.ok ? crSinImg.servicio.id : "")?.imagen === undefined);

// Actualizar sin tocar imagen (undefined) -> la conserva.
actualizarServicio(peinadoId, { nombre: "Peinado premium", precioArs: 9000, duracionMin: 20 });
check("Imagen: actualizar sin tocarla la conserva", obtenerServicio(peinadoId)?.imagen === "/media/foto1.png");

// Actualizar con otra imagen -> la cambia.
actualizarServicio(peinadoId, { nombre: "Peinado premium", precioArs: 9000, duracionMin: 20, imagen: "/fotos/otra.jpg" });
check("Imagen: actualizar la cambia", obtenerServicio(peinadoId)?.imagen === "/fotos/otra.jpg");

// Actualizar con null -> la quita.
actualizarServicio(peinadoId, { nombre: "Peinado premium", precioArs: 9000, duracionMin: 20, imagen: null });
check("Imagen: actualizar con null la quita", obtenerServicio(peinadoId)?.imagen === undefined);

// Ruta inválida (no empieza con /) -> se ignora (queda sin imagen).
const crMala = crearServicio({ nombre: "Ritual", precioArs: 5000, duracionMin: 15, imagen: "javascript:alert(1)" });
check("Imagen: ruta inválida se ignora", crMala.ok && obtenerServicio(crMala.ok ? crMala.servicio.id : "")?.imagen === undefined);

// ── Paso B: galería editable (lib/galeria) ───────────────────────────────────
// Seed desde config: Don Gambino trae 2 fotos en el orden del config.
const galSeed = listarGaleria();
const galConfig = negocio.imagenes?.galeria ?? [];
check("Galería: seed trae las fotos del config", galSeed.length === galConfig.length && galConfig.length > 0);
check("Galería: seed respeta el orden del config", galSeed[0]?.imagen === galConfig[0]);

// Agregar al final.
const f1 = agregarFoto("/media/gal-a.png");
const f2 = agregarFoto("/media/gal-b.png");
check("Galería: agregar devuelve la foto", f1 !== null && f2 !== null);
const trasAgregar = listarGaleria();
check("Galería: las nuevas quedan al final", trasAgregar.length === galSeed.length + 2 && trasAgregar[trasAgregar.length - 1].imagen === "/media/gal-b.png");

// Ruta inválida -> null (no agrega).
check("Galería: ruta inválida -> null", agregarFoto("no-empieza-con-barra") === null);

// Reordenar: invertir el orden actual.
const idsInvertidos = [...trasAgregar].reverse().map((f) => f.id);
reordenarGaleria(idsInvertidos);
const trasReordenar = listarGaleria();
check("Galería: reordenar aplica el nuevo orden", trasReordenar[0].imagen === "/media/gal-b.png");

// Eliminar una foto.
const aBorrar = f1!.id;
check("Galería: eliminar OK", eliminarFoto(aBorrar) === true);
check("Galería: tras eliminar baja el conteo", listarGaleria().length === trasAgregar.length - 1);
check("Galería: eliminar id inexistente -> false", eliminarFoto(999999) === false);

// ── Paso A: almacenamiento de imágenes subidas (lib/uploads) ─────────────────
// (async porque toca el sistema de archivos; el runner transpila a CJS y no
// admite top-level await, así que va en una función.)
async function testsUploads(): Promise<void> {
  const PNG_1x1 =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
  const pngBuf = Buffer.from(PNG_1x1, "base64");

  const sub = await guardarImagenSubida(new File([pngBuf], "foto.png", { type: "image/png" }));
  check("Uploads: guardar PNG devuelve ref /media/", sub.ok && sub.ref.startsWith("/media/"));
  const refImg = sub.ok ? sub.ref : "";
  check("Uploads: es imagen subida (borrable)", esImagenSubida(refImg) === true);
  check("Uploads: /fotos/... NO es imagen subida", esImagenSubida("/fotos/logo.jpg") === false);

  const nombreArchivo = refImg.replace("/media/", "");
  const leido = await leerImagen(nombreArchivo);
  check("Uploads: leer devuelve la imagen con su content-type", leido !== null && leido.contentType === "image/png" && leido.buf.length === pngBuf.length);

  check("Uploads: rechaza tipo no permitido (txt)", (await guardarImagenSubida(new File([Buffer.from("hola")], "x.txt", { type: "text/plain" }))).ok === false);
  check("Uploads: rechaza archivo disfrazado (mime png, contenido no png)", (await guardarImagenSubida(new File([Buffer.from("no soy png")], "x.png", { type: "image/png" }))).ok === false);
  check("Uploads: rechaza archivo vacío", (await guardarImagenSubida(new File([], "x.png", { type: "image/png" }))).ok === false);
  check("Uploads: leer con path traversal -> null", (await leerImagen("../secreto.png")) === null);

  borrarImagenSubida(refImg);
  check("Uploads: tras borrar, ya no se puede leer", (await leerImagen(nombreArchivo)) === null);
}

testsUploads()
  .catch((e) => {
    console.error("Error en tests de uploads:", e);
    fallos++;
  })
  .finally(() => {
    db().close();
    for (const suf of ["", "-wal", "-shm"]) {
      rmSync(DB_TMP + suf, { force: true });
    }
    rmSync(UPLOADS_TMP, { recursive: true, force: true });

    console.log(`\n${fallos === 0 ? "TODO OK" : fallos + " FALLO(S)"}`);
    process.exit(fallos === 0 ? 0 : 1);
  });
