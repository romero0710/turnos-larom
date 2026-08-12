"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { negocio } from "@/config/negocio";
import { formatearPrecio } from "@/lib/disponibilidad";
import {
  cancelarTurnoPanel,
  ingresarPanel,
  obtenerAgenda,
  obtenerMetricas,
  salirPanel,
} from "@/app/actions/panel";
import {
  actualizarServicioPanel,
  crearServicioPanel,
  eliminarServicioPanel,
  listarServiciosPanel,
  subirImagenServicio,
} from "@/app/actions/servicios";
import {
  actualizarBarberoPanel,
  crearBarberoPanel,
  eliminarBarberoPanel,
  listarBarberosPanel,
  reactivarBarberoPanel,
  setServiciosBarberoPanel,
  setHorarioBarberoPanel,
  type BarberoConServicios,
} from "@/app/actions/barberos";
import {
  listarGaleriaPanel,
  agregarFotoGaleriaPanel,
  eliminarFotoGaleriaPanel,
  reordenarGaleriaPanel,
} from "@/app/actions/galeria";
import type { FotoGaleria } from "@/lib/galeria";
import type { AgendaDia, Metricas } from "@/lib/turnos";
import type { DiaSemana, RangoHorario, SesionPanel, Servicio } from "@/lib/tipos";

const PRIMARIO = negocio.marca.primario;
const TEXTO_PRIMARIO = negocio.marca.primarioTextoOscuro ? "#111827" : "#ffffff";
const DIAS_VISTA = 14; // cuántos días a futuro puede navegar

type Vista = "agenda" | "metricas" | "servicios" | "barberos" | "galeria";

interface DiaOpcion {
  key: string; // YYYY-MM-DD
  etiqueta: string; // "Hoy", "Mañana" o "Vie 1 ago"
}

function keyDe(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function construirDias(): DiaOpcion[] {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const dias: DiaOpcion[] = [];
  for (let i = 0; i < DIAS_VISTA; i++) {
    const d = new Date(hoy);
    d.setDate(hoy.getDate() + i);
    let etiqueta: string;
    if (i === 0) etiqueta = "Hoy";
    else if (i === 1) etiqueta = "Mañana";
    else
      etiqueta = d
        .toLocaleDateString("es-AR", { weekday: "short", day: "numeric", month: "short" })
        .replace(".", "");
    dias.push({ key: keyDe(d), etiqueta });
  }
  return dias;
}

export default function Panel({ sesionInicial }: { sesionInicial: SesionPanel | null }) {
  const [sesion, setSesion] = useState<SesionPanel | null>(sesionInicial);

  if (!sesion) {
    return <Login onOk={setSesion} />;
  }
  return <PanelPrivado sesion={sesion} onSalir={() => setSesion(null)} />;
}

// ── Pantalla de ingreso ──────────────────────────────────────────────────────
function Login({ onOk }: { onOk: (s: SesionPanel) => void }) {
  const [clave, setClave] = useState("");
  const [error, setError] = useState(false);
  const [cargando, setCargando] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setCargando(true);
    setError(false);
    try {
      const res = await ingresarPanel(clave);
      if (res.ok) onOk(res.sesion);
      else setError(true);
    } catch {
      setError(true);
    } finally {
      setCargando(false);
    }
  }

  return (
    <div className="mx-auto max-w-sm px-6 py-24">
      <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-800">
        ← {negocio.nombre}
      </Link>
      <h1 className="mt-8 text-2xl font-bold tracking-tight">Panel</h1>
      <p className="mt-2 text-sm text-zinc-500">
        Ingresá tu clave. El dueño ve todos los turnos; cada barbero ve los suyos.
      </p>

      <form onSubmit={onSubmit} className="mt-6">
        <input
          type="password"
          value={clave}
          onChange={(e) => setClave(e.target.value)}
          placeholder="Clave"
          autoFocus
          className="w-full rounded-xl border border-zinc-300 px-4 py-3 outline-none focus:border-zinc-500"
        />
        {error && <p className="mt-3 text-sm font-medium text-red-600">Clave incorrecta.</p>}
        <button
          type="submit"
          disabled={cargando || clave.length === 0}
          className="mt-4 w-full rounded-full py-3 text-sm font-semibold disabled:opacity-50"
          style={{ background: PRIMARIO, color: TEXTO_PRIMARIO }}
        >
          {cargando ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </div>
  );
}

// ── Contenedor autenticado: cabecera + navegación (dueño) ────────────────────
function PanelPrivado({ sesion, onSalir }: { sesion: SesionPanel; onSalir: () => void }) {
  const esDueno = sesion.tipo === "dueno";
  const [vista, setVista] = useState<Vista>("agenda");

  const TITULOS: Record<Vista, string> = {
    agenda: "Agenda",
    metricas: "Métricas",
    servicios: "Servicios",
    barberos: "Barberos",
    galeria: "Galería",
  };
  const titulo = esDueno ? TITULOS[vista] : "Mis turnos";
  const subtitulo =
    sesion.tipo === "barbero" ? `${sesion.barberoNombre} · ${negocio.nombre}` : negocio.nombre;

  async function onSalirClick() {
    await salirPanel();
    onSalir();
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{titulo}</h1>
          <p className="text-sm text-zinc-500">{subtitulo}</p>
        </div>
        <button
          onClick={onSalirClick}
          className="text-sm text-zinc-500 underline-offset-2 hover:text-zinc-800 hover:underline"
        >
          Salir
        </button>
      </div>

      {esDueno && (
        <div className="mt-5 flex gap-2">
          <TabNav activo={vista === "agenda"} onClick={() => setVista("agenda")}>
            Agenda
          </TabNav>
          <TabNav activo={vista === "metricas"} onClick={() => setVista("metricas")}>
            Métricas
          </TabNav>
          <TabNav activo={vista === "servicios"} onClick={() => setVista("servicios")}>
            Servicios
          </TabNav>
          <TabNav activo={vista === "barberos"} onClick={() => setVista("barberos")}>
            Barberos
          </TabNav>
          <TabNav activo={vista === "galeria"} onClick={() => setVista("galeria")}>
            Galería
          </TabNav>
        </div>
      )}

      {!esDueno || vista === "agenda" ? (
        <Agenda esBarbero={sesion.tipo === "barbero"} />
      ) : vista === "metricas" ? (
        <GestionMetricas />
      ) : vista === "servicios" ? (
        <GestionServicios />
      ) : vista === "barberos" ? (
        <GestionBarberos />
      ) : (
        <GestionGaleria />
      )}
    </div>
  );
}

function TabNav({
  activo,
  onClick,
  children,
}: {
  activo: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
        activo ? "border-transparent" : "border-zinc-300 text-zinc-600 hover:border-zinc-400"
      }`}
      style={activo ? { background: PRIMARIO, color: TEXTO_PRIMARIO } : undefined}
    >
      {children}
    </button>
  );
}

// ── Agenda del día ───────────────────────────────────────────────────────────
function Agenda({ esBarbero }: { esBarbero: boolean }) {
  const [dias] = useState<DiaOpcion[]>(construirDias);
  const [sel, setSel] = useState(0);
  const [agenda, setAgenda] = useState<AgendaDia | null>(null);
  const [cargando, setCargando] = useState(true);
  const [cancelandoId, setCancelandoId] = useState<number | null>(null);

  const diaActual = dias[sel];

  const cargar = useCallback(async (fechaKey: string) => {
    setCargando(true);
    try {
      setAgenda(await obtenerAgenda(fechaKey));
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar(diaActual.key);
  }, [diaActual.key, cargar]);

  async function onCancelar(id: number) {
    if (!confirm("¿Cancelar este turno? El horario vuelve a quedar libre.")) return;
    setCancelandoId(id);
    try {
      const res = await cancelarTurnoPanel(id);
      if (res.ok) await cargar(diaActual.key);
      else alert("No se pudo cancelar (puede que ya estuviera cancelado).");
    } finally {
      setCancelandoId(null);
    }
  }

  const reservados = agenda?.turnos.filter((t) => t.estado === "reservado") ?? [];

  return (
    <>
      {/* Selector de día */}
      <div className="mt-6 flex gap-2 overflow-x-auto pb-2">
        {dias.map((d, i) => {
          const activo = i === sel;
          return (
            <button
              key={d.key}
              onClick={() => setSel(i)}
              className={`shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition-colors ${
                activo ? "border-transparent" : "border-zinc-300 text-zinc-600 hover:border-zinc-400"
              }`}
              style={activo ? { background: PRIMARIO, color: TEXTO_PRIMARIO } : undefined}
            >
              {d.etiqueta}
            </button>
          );
        })}
      </div>

      {/* Resumen */}
      {agenda && !cargando && (
        <div className="mt-6 flex gap-3">
          <Metrica etiqueta="Turnos" valor={String(agenda.totalReservados)} />
          <Metrica etiqueta="Ingreso estimado" valor={formatearPrecio(agenda.ingresoEstimadoArs)} />
        </div>
      )}

      {/* Lista */}
      <div className="mt-6">
        {cargando ? (
          <p className="py-10 text-center text-zinc-400">Cargando agenda…</p>
        ) : reservados.length === 0 ? (
          <p className="py-10 text-center text-zinc-400">No hay turnos reservados este día.</p>
        ) : (
          <ul className="space-y-3">
            {reservados.map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between rounded-2xl border border-zinc-200 p-4"
              >
                <div className="min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="text-lg font-bold tabular-nums">{t.hora}</span>
                    <span className="text-sm text-zinc-400">→ {t.finHora}</span>
                    {t.pendiente && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-700">
                        pendiente
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 truncate font-medium text-zinc-900">
                    {t.clienteNombre}
                    {!esBarbero && (
                      <span className="font-normal text-zinc-500"> · {t.barberoNombre}</span>
                    )}
                  </p>
                  <p className="text-sm text-zinc-500">
                    {t.servicioNombre} · {formatearPrecio(t.precioArs)} ·{" "}
                    <a href={`tel:${t.clienteTelefono}`} className="underline underline-offset-2">
                      {t.clienteTelefono}
                    </a>
                  </p>
                </div>
                <button
                  onClick={() => onCancelar(t.id)}
                  disabled={cancelandoId === t.id}
                  className="ml-3 shrink-0 rounded-full border border-red-300 px-4 py-2 text-sm font-semibold text-red-700 transition-colors hover:bg-red-50 disabled:opacity-50"
                >
                  {cancelandoId === t.id ? "…" : "Cancelar"}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

function Metrica({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex-1 rounded-2xl border border-zinc-200 p-4">
      <p className="text-xs uppercase tracking-wide text-zinc-400">{etiqueta}</p>
      <p className="mt-1 text-xl font-bold text-zinc-900">{valor}</p>
    </div>
  );
}

// ── Métricas del negocio (solo dueño) ────────────────────────────────────────
type PeriodoMetrica = "hoy" | "semana" | "mes";

/** Rango de días (claves YYYY-MM-DD) del período elegido, en hora local. */
function rangoDePeriodo(periodo: PeriodoMetrica): { desde: string; hasta: string } {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  if (periodo === "hoy") {
    const k = keyDe(hoy);
    return { desde: k, hasta: k };
  }
  if (periodo === "semana") {
    const desdeLunes = (hoy.getDay() + 6) % 7; // 0=dom..6=sáb -> días desde el lunes
    const lunes = new Date(hoy);
    lunes.setDate(hoy.getDate() - desdeLunes);
    const domingo = new Date(lunes);
    domingo.setDate(lunes.getDate() + 6);
    return { desde: keyDe(lunes), hasta: keyDe(domingo) };
  }
  // mes calendario actual
  const primero = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
  const ultimo = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0);
  return { desde: keyDe(primero), hasta: keyDe(ultimo) };
}

/** Rango del período equivalente anterior (ayer / semana pasada / mes pasado). */
function rangoAnteriorDePeriodo(periodo: PeriodoMetrica): { desde: string; hasta: string } {
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);

  if (periodo === "hoy") {
    const ayer = new Date(hoy);
    ayer.setDate(hoy.getDate() - 1);
    const k = keyDe(ayer);
    return { desde: k, hasta: k };
  }
  if (periodo === "semana") {
    const desdeLunes = (hoy.getDay() + 6) % 7;
    const lunesPasado = new Date(hoy);
    lunesPasado.setDate(hoy.getDate() - desdeLunes - 7);
    const domingoPasado = new Date(lunesPasado);
    domingoPasado.setDate(lunesPasado.getDate() + 6);
    return { desde: keyDe(lunesPasado), hasta: keyDe(domingoPasado) };
  }
  // mes calendario anterior
  const primero = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
  const ultimo = new Date(hoy.getFullYear(), hoy.getMonth(), 0);
  return { desde: keyDe(primero), hasta: keyDe(ultimo) };
}

/** Etiqueta corta del período anterior, para el chip de comparación. */
const ETIQUETA_ANTERIOR: Record<PeriodoMetrica, string> = {
  hoy: "ayer",
  semana: "sem. pasada",
  mes: "mes pasado",
};

function GestionMetricas() {
  const [periodo, setPeriodo] = useState<PeriodoMetrica>("hoy");
  const [datos, setDatos] = useState<Metricas | null>(null);
  const [cargando, setCargando] = useState(true);

  const rango = rangoDePeriodo(periodo);
  const rangoPrev = rangoAnteriorDePeriodo(periodo);

  useEffect(() => {
    let vivo = true;
    setCargando(true);
    obtenerMetricas(rango.desde, rango.hasta, rangoPrev.desde, rangoPrev.hasta)
      .then((m) => {
        if (vivo) setDatos(m);
      })
      .finally(() => {
        if (vivo) setCargando(false);
      });
    return () => {
      vivo = false;
    };
  }, [rango.desde, rango.hasta, rangoPrev.desde, rangoPrev.hasta]);

  const opciones: { p: PeriodoMetrica; label: string }[] = [
    { p: "hoy", label: "Hoy" },
    { p: "semana", label: "Semana" },
    { p: "mes", label: "Mes" },
  ];

  return (
    <div className="mt-6">
      <div className="flex gap-2">
        {opciones.map(({ p, label }) => {
          const activo = periodo === p;
          return (
            <button
              key={p}
              onClick={() => setPeriodo(p)}
              className={`rounded-full border px-4 py-1.5 text-sm font-medium transition-colors ${
                activo ? "border-transparent" : "border-zinc-300 text-zinc-600 hover:border-zinc-400"
              }`}
              style={activo ? { background: PRIMARIO, color: TEXTO_PRIMARIO } : undefined}
            >
              {label}
            </button>
          );
        })}
      </div>

      {cargando || !datos ? (
        <p className="py-10 text-center text-zinc-400">Cargando métricas…</p>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3">
            <TarjetaMetrica
              etiqueta="Ingreso estimado"
              valor={formatearPrecio(datos.ingresoEstimadoArs)}
              actual={datos.ingresoEstimadoArs}
              anterior={datos.anterior?.ingresoEstimadoArs}
              refAnterior={ETIQUETA_ANTERIOR[periodo]}
              destacada
            />
            <TarjetaMetrica
              etiqueta="Turnos reservados"
              valor={String(datos.turnosReservados)}
              actual={datos.turnosReservados}
              anterior={datos.anterior?.turnosReservados}
              refAnterior={ETIQUETA_ANTERIOR[periodo]}
            />
            <TarjetaMetrica
              etiqueta="Ticket promedio"
              valor={formatearPrecio(datos.ticketPromedioArs)}
              actual={datos.ticketPromedioArs}
              anterior={datos.anterior?.ticketPromedioArs}
              refAnterior={ETIQUETA_ANTERIOR[periodo]}
            />
            <TarjetaCancelaciones
              cantidad={datos.turnosCancelados}
              tasa={datos.tasaCancelacion}
              tasaAnterior={datos.anterior?.tasaCancelacion}
              refAnterior={ETIQUETA_ANTERIOR[periodo]}
            />
          </div>

          <RankingMetrica titulo="Por barbero" items={datos.porBarbero} />
          <RankingMetrica titulo="Por servicio" items={datos.porServicio} />
        </>
      )}
    </div>
  );
}

// ── Piezas visuales de métricas ──────────────────────────────────────────────

/** Variación relativa vs el período anterior. null = no hay con qué comparar. */
function calcularVariacion(
  actual: number,
  anterior: number | undefined,
): { pct: number; nuevo: boolean } | null {
  if (anterior == null) return null;
  if (anterior === 0) {
    if (actual === 0) return null; // ambos en cero: nada que mostrar
    return { pct: 0, nuevo: true };
  }
  return { pct: Math.round(((actual - anterior) / anterior) * 100), nuevo: false };
}

/** Chip ▲/▼ con color según si subir es bueno (ingresos) o malo (cancelaciones). */
function ChipVariacion({
  actual,
  anterior,
  refAnterior,
  mejorSiSube = true,
}: {
  actual: number;
  anterior: number | undefined;
  refAnterior: string;
  mejorSiSube?: boolean;
}) {
  const v = calcularVariacion(actual, anterior);
  if (!v) {
    return <p className="mt-1.5 text-[11px] text-zinc-400">Sin datos para comparar</p>;
  }

  if (v.nuevo) {
    return (
      <p className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
        ▲ nuevo <span className="font-normal text-emerald-600/70">vs {refAnterior}</span>
      </p>
    );
  }

  const sinCambio = v.pct === 0;
  const sube = v.pct > 0;
  const bueno = sinCambio ? null : sube === mejorSiSube;
  const clase = sinCambio
    ? "bg-zinc-100 text-zinc-500"
    : bueno
      ? "bg-emerald-50 text-emerald-700"
      : "bg-red-50 text-red-700";
  const flecha = sinCambio ? "=" : sube ? "▲" : "▼";

  return (
    <p
      className={`mt-1.5 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${clase}`}
    >
      {flecha} {Math.abs(v.pct)}%
      <span className="font-normal opacity-60">vs {refAnterior}</span>
    </p>
  );
}

function TarjetaMetrica({
  etiqueta,
  valor,
  actual,
  anterior,
  refAnterior,
  destacada = false,
}: {
  etiqueta: string;
  valor: string;
  actual: number;
  anterior: number | undefined;
  refAnterior: string;
  destacada?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-4 ${
        destacada ? "border-zinc-300 bg-zinc-50" : "border-zinc-200"
      }`}
    >
      <p className="text-xs uppercase tracking-wide text-zinc-400">{etiqueta}</p>
      <p
        className={`mt-1 font-bold tabular-nums text-zinc-900 ${
          destacada ? "text-2xl" : "text-xl"
        }`}
      >
        {valor}
      </p>
      <ChipVariacion actual={actual} anterior={anterior} refAnterior={refAnterior} />
    </div>
  );
}

/** Tarjeta de cancelaciones con color de alerta (ámbar/rojo) según la tasa. */
function TarjetaCancelaciones({
  cantidad,
  tasa,
  tasaAnterior,
  refAnterior,
}: {
  cantidad: number;
  tasa: number;
  tasaAnterior: number | undefined;
  refAnterior: string;
}) {
  const pct = Math.round(tasa * 100);
  // Umbrales: <15% normal, 15–30% atención (ámbar), >30% alto (rojo).
  const nivel = pct >= 30 ? "alto" : pct >= 15 ? "medio" : "bajo";
  const estilo = {
    bajo: { caja: "border-zinc-200", valor: "text-zinc-900", nota: "" },
    medio: {
      caja: "border-amber-200 bg-amber-50",
      valor: "text-amber-700",
      nota: "Cancelación algo alta",
    },
    alto: {
      caja: "border-red-200 bg-red-50",
      valor: "text-red-700",
      nota: "Cancelación alta — revisar",
    },
  }[nivel];

  return (
    <div className={`rounded-2xl border p-4 ${estilo.caja}`}>
      <p className="text-xs uppercase tracking-wide text-zinc-400">Cancelaciones</p>
      <p className={`mt-1 text-xl font-bold tabular-nums ${estilo.valor}`}>
        {cantidad} <span className="text-base font-semibold">· {pct}%</span>
      </p>
      {estilo.nota ? (
        <p className={`mt-1 text-[11px] font-semibold ${estilo.valor}`}>{estilo.nota}</p>
      ) : (
        // Comparación en puntos porcentuales (para tasas, la variación relativa confunde).
        <ChipVariacion
          actual={pct}
          anterior={tasaAnterior == null ? undefined : Math.round(tasaAnterior * 100)}
          refAnterior={refAnterior}
          mejorSiSube={false}
        />
      )}
    </div>
  );
}

function RankingMetrica({
  titulo,
  items,
}: {
  titulo: string;
  items: Metricas["porBarbero"];
}) {
  const maxIngreso = items.reduce((m, it) => Math.max(m, it.ingresoArs), 0);

  return (
    <div className="mt-6">
      <h2 className="text-sm font-semibold text-zinc-700">{titulo}</h2>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-zinc-400">Sin turnos reservados en el período.</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {items.map((it) => {
            const pct = maxIngreso > 0 ? Math.round((it.ingresoArs / maxIngreso) * 100) : 0;
            return (
              <li
                key={it.id}
                className="relative overflow-hidden rounded-xl border border-zinc-200 px-4 py-2.5"
              >
                {/* Barra proporcional al ingreso (el que más factura llena el ancho). */}
                <div
                  className="absolute inset-y-0 left-0 rounded-xl"
                  style={{ width: `${pct}%`, background: PRIMARIO, opacity: 0.12 }}
                  aria-hidden
                />
                <div className="relative flex items-center justify-between">
                  <span className="font-medium text-zinc-900">{it.nombre}</span>
                  <span className="text-sm text-zinc-500">
                    {it.turnos} {it.turnos === 1 ? "turno" : "turnos"} ·{" "}
                    <span className="font-semibold text-zinc-800">
                      {formatearPrecio(it.ingresoArs)}
                    </span>
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// ── Gestión de servicios (solo dueño) ────────────────────────────────────────
function GestionServicios() {
  const [servicios, setServicios] = useState<Servicio[] | null>(null);

  const cargar = useCallback(async () => {
    setServicios(await listarServiciosPanel());
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  if (servicios === null) {
    return <p className="py-10 text-center text-zinc-400">Cargando servicios…</p>;
  }

  return (
    <div className="mt-6">
      <ul className="space-y-3">
        {servicios.map((s) => (
          <FilaServicio key={s.id} servicio={s} onCambio={cargar} />
        ))}
      </ul>
      {servicios.length === 0 && (
        <p className="py-6 text-center text-zinc-400">No hay servicios. Agregá el primero abajo.</p>
      )}
      <NuevoServicio onCreado={cargar} />
    </div>
  );
}

function FilaServicio({ servicio, onCambio }: { servicio: Servicio; onCambio: () => Promise<void> }) {
  const [nombre, setNombre] = useState(servicio.nombre);
  const [precio, setPrecio] = useState(String(servicio.precioArs));
  const [duracion, setDuracion] = useState(String(servicio.duracionMin));
  const [imagen, setImagen] = useState<string | null>(servicio.imagen ?? null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cambiado =
    nombre !== servicio.nombre ||
    precio !== String(servicio.precioArs) ||
    duracion !== String(servicio.duracionMin) ||
    imagen !== (servicio.imagen ?? null);

  async function onGuardar() {
    setGuardando(true);
    setError(null);
    try {
      const res = await actualizarServicioPanel(servicio.id, {
        nombre,
        precioArs: Number(precio),
        duracionMin: Number(duracion),
        imagen, // string = usarla, null = quitarla
      });
      if (res && res.ok) await onCambio();
      else setError("Revisá los datos (nombre, precio y duración).");
    } finally {
      setGuardando(false);
    }
  }

  async function onBaja() {
    if (!confirm(`¿Dar de baja "${servicio.nombre}"? Deja de aparecer en la web.`)) return;
    setGuardando(true);
    try {
      const res = await eliminarServicioPanel(servicio.id);
      if (res && res.ok) await onCambio();
    } finally {
      setGuardando(false);
    }
  }

  return (
    <li className="rounded-2xl border border-zinc-200 p-4">
      <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
        <CampoTexto etiqueta="Servicio" value={nombre} onChange={setNombre} />
        <CampoNumero etiqueta="Precio $" value={precio} onChange={setPrecio} ancho="w-28" />
        <CampoNumero etiqueta="Min" value={duracion} onChange={setDuracion} ancho="w-20" />
      </div>
      <div className="mt-3">
        <CampoImagen valor={imagen} onCambio={setImagen} />
      </div>
      {error && <p className="mt-2 text-sm font-medium text-red-600">{error}</p>}
      <div className="mt-3 flex items-center gap-3">
        <button
          onClick={onGuardar}
          disabled={!cambiado || guardando}
          className="rounded-full px-4 py-1.5 text-sm font-semibold disabled:opacity-40"
          style={{ background: PRIMARIO, color: TEXTO_PRIMARIO }}
        >
          {guardando ? "Guardando…" : "Guardar"}
        </button>
        <button
          onClick={onBaja}
          disabled={guardando}
          className="rounded-full border border-red-300 px-4 py-1.5 text-sm font-semibold text-red-700 transition-colors hover:bg-red-50 disabled:opacity-50"
        >
          Dar de baja
        </button>
      </div>
    </li>
  );
}

function NuevoServicio({ onCreado }: { onCreado: () => Promise<void> }) {
  const [nombre, setNombre] = useState("");
  const [precio, setPrecio] = useState("");
  const [duracion, setDuracion] = useState("30");
  const [imagen, setImagen] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const listo = nombre.trim().length >= 2 && precio !== "" && duracion !== "";

  async function onCrear() {
    setGuardando(true);
    setError(null);
    try {
      const res = await crearServicioPanel({
        nombre,
        precioArs: Number(precio),
        duracionMin: Number(duracion),
        imagen,
      });
      if (res && res.ok) {
        setNombre("");
        setPrecio("");
        setDuracion("30");
        setImagen(null);
        await onCreado();
      } else {
        setError("Revisá los datos (nombre, precio y duración en minutos).");
      }
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="mt-6 rounded-2xl border border-dashed border-zinc-300 p-4">
      <p className="text-sm font-semibold text-zinc-700">Agregar servicio</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto_auto]">
        <CampoTexto etiqueta="Servicio" value={nombre} onChange={setNombre} placeholder="Ej: Corte + lavado" />
        <CampoNumero etiqueta="Precio $" value={precio} onChange={setPrecio} ancho="w-28" placeholder="15000" />
        <CampoNumero etiqueta="Min" value={duracion} onChange={setDuracion} ancho="w-20" />
      </div>
      <div className="mt-3">
        <CampoImagen valor={imagen} onCambio={setImagen} />
      </div>
      {error && <p className="mt-2 text-sm font-medium text-red-600">{error}</p>}
      <button
        onClick={onCrear}
        disabled={!listo || guardando}
        className="mt-3 rounded-full px-4 py-1.5 text-sm font-semibold disabled:opacity-40"
        style={{ background: PRIMARIO, color: TEXTO_PRIMARIO }}
      >
        {guardando ? "Agregando…" : "Agregar"}
      </button>
    </div>
  );
}

// ── Horario semanal por barbero (ladrillo 3) ─────────────────────────────────
// La UI edita una franja por día (abre–cierra) + un toggle "Trabaja". El modelo
// en la base soporta varias franjas por día (turno partido); si más adelante hace
// falta, se agrega acá sin tocar el esquema.
type Franja = { desde: string; hasta: string };
type DiaUi = { activo: boolean; franjas: Franja[] };

const DIAS_SEMANA: { dia: DiaSemana; label: string }[] = [
  { dia: 1, label: "Lunes" },
  { dia: 2, label: "Martes" },
  { dia: 3, label: "Miércoles" },
  { dia: 4, label: "Jueves" },
  { dia: 5, label: "Viernes" },
  { dia: 6, label: "Sábado" },
  { dia: 0, label: "Domingo" },
];

type HorarioMap = Partial<Record<DiaSemana, RangoHorario[]>>;

function horarioAUi(h: HorarioMap): Record<number, DiaUi> {
  const ui: Record<number, DiaUi> = {};
  for (const { dia } of DIAS_SEMANA) {
    const rangos = h[dia];
    ui[dia] =
      rangos && rangos.length > 0
        ? { activo: true, franjas: rangos.map((r) => ({ desde: r.desde, hasta: r.hasta })) }
        : { activo: false, franjas: [{ desde: "10:00", hasta: "20:00" }] };
  }
  return ui;
}

function uiAHorario(ui: Record<number, DiaUi>): HorarioMap {
  const h: HorarioMap = {};
  for (const { dia } of DIAS_SEMANA) {
    const d = ui[dia];
    if (d.activo && d.franjas.length > 0) {
      h[dia] = d.franjas.map((f) => ({ desde: f.desde, hasta: f.hasta }));
    }
  }
  return h;
}

/** Clave estable de un horario (todas las franjas) para detectar cambios. */
function claveHorario(h: HorarioMap): string {
  return DIAS_SEMANA.map(({ dia }) => {
    const rangos = h[dia] ?? [];
    return `${dia}:${rangos.map((r) => `${r.desde}-${r.hasta}`).join(",")}`;
  }).join("|");
}

/** ¿Alguna franja activa con inicio >= fin, o franjas solapadas en un día? */
function horarioUiInvalido(ui: Record<number, DiaUi>): boolean {
  for (const { dia } of DIAS_SEMANA) {
    const d = ui[dia];
    if (!d.activo) continue;
    const ordenadas = [...d.franjas].sort((a, b) => a.desde.localeCompare(b.desde));
    let finPrevio = "";
    for (const f of ordenadas) {
      if (f.desde >= f.hasta) return true;
      if (finPrevio && f.desde < finPrevio) return true; // se solapa con la anterior
      finPrevio = f.hasta;
    }
  }
  return false;
}

function EditorHorario({
  valor,
  onCambio,
}: {
  valor: Record<number, DiaUi>;
  onCambio: (v: Record<number, DiaUi>) => void;
}) {
  function setDia(dia: number, patch: Partial<DiaUi>) {
    onCambio({ ...valor, [dia]: { ...valor[dia], ...patch } });
  }
  function setFranja(dia: number, idx: number, patch: Partial<Franja>) {
    setDia(dia, {
      franjas: valor[dia].franjas.map((f, i) => (i === idx ? { ...f, ...patch } : f)),
    });
  }
  function agregarFranja(dia: number) {
    setDia(dia, { franjas: [...valor[dia].franjas, { desde: "16:00", hasta: "20:00" }] });
  }
  function quitarFranja(dia: number, idx: number) {
    const franjas = valor[dia].franjas.filter((_, i) => i !== idx);
    setDia(dia, { franjas: franjas.length > 0 ? franjas : [{ desde: "10:00", hasta: "20:00" }] });
  }

  return (
    <div className="mt-3">
      <p className="text-xs uppercase tracking-wide text-zinc-400">Horario de la semana</p>
      <p className="text-xs text-zinc-400">
        Podés cargar más de una franja por día (ej. turno partido con corte al mediodía).
      </p>
      <div className="mt-2 space-y-2">
        {DIAS_SEMANA.map(({ dia, label }) => {
          const d = valor[dia];
          return (
            <div key={dia} className="rounded-lg border border-zinc-200 p-2">
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={d.activo}
                    onChange={(e) => setDia(dia, { activo: e.target.checked })}
                    className="h-4 w-4"
                  />
                  <span className={d.activo ? "font-medium" : "text-zinc-400"}>{label}</span>
                </label>
                {d.activo ? (
                  <button
                    type="button"
                    onClick={() => agregarFranja(dia)}
                    className="text-xs font-semibold text-zinc-600 hover:text-zinc-900"
                  >
                    + franja
                  </button>
                ) : (
                  <span className="text-sm text-zinc-400">No trabaja</span>
                )}
              </div>

              {d.activo && (
                <div className="mt-2 space-y-1.5">
                  {d.franjas.map((f, idx) => {
                    const invalido = f.desde >= f.hasta;
                    return (
                      <div key={idx} className="flex items-center gap-1.5">
                        <input
                          type="time"
                          value={f.desde}
                          onChange={(e) => setFranja(dia, idx, { desde: e.target.value })}
                          className={`rounded-lg border px-2 py-1 text-sm outline-none focus:border-zinc-500 ${
                            invalido ? "border-red-400" : "border-zinc-300"
                          }`}
                        />
                        <span className="text-zinc-400">a</span>
                        <input
                          type="time"
                          value={f.hasta}
                          onChange={(e) => setFranja(dia, idx, { hasta: e.target.value })}
                          className={`rounded-lg border px-2 py-1 text-sm outline-none focus:border-zinc-500 ${
                            invalido ? "border-red-400" : "border-zinc-300"
                          }`}
                        />
                        {d.franjas.length > 1 && (
                          <button
                            type="button"
                            onClick={() => quitarFranja(dia, idx)}
                            aria-label="Quitar franja"
                            className="ml-1 h-7 w-7 shrink-0 rounded-full border border-zinc-300 text-zinc-500 transition-colors hover:border-red-300 hover:text-red-600"
                          >
                            ×
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Gestión de barberos (solo dueño) ─────────────────────────────────────────
function GestionBarberos() {
  const [barberos, setBarberos] = useState<BarberoConServicios[] | null>(null);
  const [servicios, setServicios] = useState<Servicio[] | null>(null);

  const cargar = useCallback(async () => {
    const [b, s] = await Promise.all([listarBarberosPanel(), listarServiciosPanel()]);
    setBarberos(b);
    setServicios(s);
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  if (barberos === null || servicios === null) {
    return <p className="py-10 text-center text-zinc-400">Cargando barberos…</p>;
  }

  return (
    <div className="mt-6">
      <ul className="space-y-3">
        {barberos.map((b) => (
          <FilaBarbero key={b.id} barbero={b} servicios={servicios} onCambio={cargar} />
        ))}
      </ul>
      {barberos.length === 0 && (
        <p className="py-6 text-center text-zinc-400">No hay barberos. Agregá el primero abajo.</p>
      )}
      <NuevoBarbero onCreado={cargar} />
    </div>
  );
}

function FilaBarbero({
  barbero,
  servicios,
  onCambio,
}: {
  barbero: BarberoConServicios;
  servicios: Servicio[];
  onCambio: () => Promise<void>;
}) {
  const [nombre, setNombre] = useState(barbero.nombre);
  const [clave, setClave] = useState(""); // vacío = no cambiarla
  const [servicioIds, setServicioIds] = useState<string[]>(barbero.servicioIds);
  const [horarioUi, setHorarioUi] = useState<Record<number, DiaUi>>(() => horarioAUi(barbero.horario));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const horarioBaseClave = claveHorario(barbero.horario);
  const cambiado =
    nombre !== barbero.nombre ||
    clave !== "" ||
    servicioIds.length !== barbero.servicioIds.length ||
    servicioIds.some((id) => !barbero.servicioIds.includes(id)) ||
    claveHorario(uiAHorario(horarioUi)) !== horarioBaseClave;

  // ¿Alguna franja activa inválida o solapada? (bloquea el guardado)
  const horarioInvalido = horarioUiInvalido(horarioUi);

  function toggleServicio(id: string) {
    setServicioIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function onGuardar() {
    setGuardando(true);
    setError(null);
    try {
      const res = await actualizarBarberoPanel(barbero.id, { nombre, clave: clave || undefined });
      if (!res || !res.ok) {
        setError(
          res && "error" in res && res.error === "clave-repetida"
            ? "Esa clave ya la usa otro barbero."
            : "Revisá el nombre (y la clave, si la cambiaste: mínimo 4 caracteres).",
        );
        setGuardando(false);
        return;
      }
      await setServiciosBarberoPanel(barbero.id, servicioIds);
      const resH = await setHorarioBarberoPanel(barbero.id, uiAHorario(horarioUi));
      if (!resH || !resH.ok) {
        setError("Revisá los horarios: la hora de inicio debe ser anterior a la de fin.");
        setGuardando(false);
        return;
      }
      setClave("");
      await onCambio();
    } finally {
      setGuardando(false);
    }
  }

  async function onBaja() {
    if (!confirm(`¿Dar de baja a ${barbero.nombre}? No va a poder entrar al panel ni recibir turnos nuevos.`))
      return;
    setGuardando(true);
    try {
      const res = await eliminarBarberoPanel(barbero.id);
      if (res && res.ok) await onCambio();
    } finally {
      setGuardando(false);
    }
  }

  async function onReactivar() {
    setGuardando(true);
    try {
      const res = await reactivarBarberoPanel(barbero.id);
      if (res && res.ok) await onCambio();
    } finally {
      setGuardando(false);
    }
  }

  return (
    <li className={`rounded-2xl border p-4 ${barbero.activo ? "border-zinc-200" : "border-zinc-200 bg-zinc-50"}`}>
      <div className="grid gap-3 sm:grid-cols-2">
        <CampoTexto etiqueta="Nombre" value={nombre} onChange={setNombre} />
        <CampoTexto etiqueta="Nueva clave (opcional)" value={clave} onChange={setClave} placeholder="Dejar vacío para no cambiarla" />
      </div>

      {servicios.length > 0 && (
        <div className="mt-3">
          <p className="text-xs uppercase tracking-wide text-zinc-400">Hace estos servicios</p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {servicios.map((s) => {
              const activo = servicioIds.includes(s.id);
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => toggleServicio(s.id)}
                  className={`rounded-full border px-3 py-1 text-sm font-medium transition-colors ${
                    activo ? "border-transparent" : "border-zinc-300 text-zinc-500 hover:border-zinc-400"
                  }`}
                  style={activo ? { background: PRIMARIO, color: TEXTO_PRIMARIO } : undefined}
                >
                  {s.nombre}
                </button>
              );
            })}
          </div>
        </div>
      )}

      <EditorHorario valor={horarioUi} onCambio={setHorarioUi} />

      {!barbero.activo && (
        <p className="mt-3 text-sm font-medium text-zinc-500">Dado de baja: no puede entrar ni recibir turnos.</p>
      )}
      {error && <p className="mt-2 text-sm font-medium text-red-600">{error}</p>}

      <div className="mt-3 flex items-center gap-3">
        <button
          onClick={onGuardar}
          disabled={!cambiado || guardando || horarioInvalido}
          className="rounded-full px-4 py-1.5 text-sm font-semibold disabled:opacity-40"
          style={{ background: PRIMARIO, color: TEXTO_PRIMARIO }}
        >
          {guardando ? "Guardando…" : "Guardar"}
        </button>
        {barbero.activo ? (
          <button
            onClick={onBaja}
            disabled={guardando}
            className="rounded-full border border-red-300 px-4 py-1.5 text-sm font-semibold text-red-700 transition-colors hover:bg-red-50 disabled:opacity-50"
          >
            Dar de baja
          </button>
        ) : (
          <button
            onClick={onReactivar}
            disabled={guardando}
            className="rounded-full border border-zinc-300 px-4 py-1.5 text-sm font-semibold text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50"
          >
            Reactivar
          </button>
        )}
      </div>
    </li>
  );
}

function NuevoBarbero({ onCreado }: { onCreado: () => Promise<void> }) {
  const [nombre, setNombre] = useState("");
  const [clave, setClave] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const listo = nombre.trim().length >= 2 && clave.trim().length >= 4;

  async function onCrear() {
    setGuardando(true);
    setError(null);
    try {
      const res = await crearBarberoPanel({ nombre, clave });
      if (res && res.ok) {
        setNombre("");
        setClave("");
        await onCreado();
      } else {
        setError(
          res && "error" in res && res.error === "clave-repetida"
            ? "Esa clave ya la usa otro barbero."
            : "Revisá el nombre y que la clave tenga al menos 4 caracteres.",
        );
      }
    } finally {
      setGuardando(false);
    }
  }

  return (
    <div className="mt-6 rounded-2xl border border-dashed border-zinc-300 p-4">
      <p className="text-sm font-semibold text-zinc-700">Agregar barbero</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <CampoTexto etiqueta="Nombre" value={nombre} onChange={setNombre} placeholder="Ej: Martín" />
        <CampoTexto etiqueta="Clave" value={clave} onChange={setClave} placeholder="Mínimo 4 caracteres" />
      </div>
      <p className="mt-2 text-xs text-zinc-400">
        Después de crearlo, tildá qué servicios hace desde su tarjeta.
      </p>
      {error && <p className="mt-2 text-sm font-medium text-red-600">{error}</p>}
      <button
        onClick={onCrear}
        disabled={!listo || guardando}
        className="mt-3 rounded-full px-4 py-1.5 text-sm font-semibold disabled:opacity-40"
        style={{ background: PRIMARIO, color: TEXTO_PRIMARIO }}
      >
        {guardando ? "Agregando…" : "Agregar"}
      </button>
    </div>
  );
}

// ── Gestión de la galería del carrusel (solo dueño) ──────────────────────────
function GestionGaleria() {
  const [fotos, setFotos] = useState<FotoGaleria[] | null>(null);
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ocupadoId, setOcupadoId] = useState<number | null>(null);

  const cargar = useCallback(async () => {
    setFotos(await listarGaleriaPanel());
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  async function onAgregar(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setSubiendo(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const res = await agregarFotoGaleriaPanel(fd);
      if (res && res.ok) await cargar();
      else
        setError(
          res && "error" in res && res.error === "tamano"
            ? "La imagen es muy pesada (máx 4 MB)."
            : "No se pudo agregar. Usá JPG, PNG o WEBP.",
        );
    } catch {
      setError("No se pudo agregar la foto. Probá de nuevo.");
    } finally {
      setSubiendo(false);
    }
  }

  async function onEliminar(id: number) {
    if (!confirm("¿Quitar esta foto de la galería?")) return;
    setOcupadoId(id);
    try {
      const res = await eliminarFotoGaleriaPanel(id);
      if (res && res.ok) await cargar();
    } finally {
      setOcupadoId(null);
    }
  }

  async function mover(i: number, dir: -1 | 1) {
    if (!fotos) return;
    const j = i + dir;
    if (j < 0 || j >= fotos.length) return;
    const nuevo = [...fotos];
    [nuevo[i], nuevo[j]] = [nuevo[j], nuevo[i]];
    setFotos(nuevo); // actualización optimista
    const res = await reordenarGaleriaPanel(nuevo.map((f) => f.id));
    if (!res || !res.ok) await cargar(); // si falló, recargar el orden real
  }

  if (fotos === null) {
    return <p className="py-10 text-center text-zinc-400">Cargando galería…</p>;
  }

  return (
    <div className="mt-6">
      {fotos.length === 0 ? (
        <p className="py-6 text-center text-zinc-400">
          No hay fotos todavía. Agregá la primera abajo.
        </p>
      ) : (
        <ul className="space-y-3">
          {fotos.map((foto, i) => (
            <li
              key={foto.id}
              className="flex items-center gap-3 rounded-2xl border border-zinc-200 p-3"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={foto.imagen}
                alt={`Foto ${i + 1}`}
                className="h-16 w-24 shrink-0 rounded-lg border border-zinc-200 object-cover"
              />
              <span className="text-sm text-zinc-500">Foto {i + 1}</span>
              <div className="ml-auto flex items-center gap-1.5">
                <BotonOrden etiqueta="↑" onClick={() => mover(i, -1)} disabled={i === 0} />
                <BotonOrden
                  etiqueta="↓"
                  onClick={() => mover(i, 1)}
                  disabled={i === fotos.length - 1}
                />
                <button
                  onClick={() => onEliminar(foto.id)}
                  disabled={ocupadoId === foto.id}
                  className="rounded-full border border-red-300 px-3 py-1.5 text-sm font-semibold text-red-700 transition-colors hover:bg-red-50 disabled:opacity-50"
                >
                  {ocupadoId === foto.id ? "…" : "Quitar"}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-6 rounded-2xl border border-dashed border-zinc-300 p-4">
        <p className="text-sm font-semibold text-zinc-700">Agregar foto</p>
        <p className="mt-1 text-xs text-zinc-400">
          Se muestra en el carrusel &quot;Nuestro trabajo&quot; de la web. JPG, PNG o WEBP (máx 4 MB).
        </p>
        {error && <p className="mt-2 text-sm font-medium text-red-600">{error}</p>}
        <label
          className="mt-3 inline-block cursor-pointer rounded-full px-4 py-1.5 text-sm font-semibold"
          style={{ background: PRIMARIO, color: TEXTO_PRIMARIO }}
        >
          {subiendo ? "Subiendo…" : "Subir foto"}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={onAgregar}
            disabled={subiendo}
            className="hidden"
          />
        </label>
      </div>
    </div>
  );
}

function BotonOrden({
  etiqueta,
  onClick,
  disabled,
}: {
  etiqueta: string;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="h-8 w-8 rounded-full border border-zinc-300 text-sm font-semibold text-zinc-700 transition-colors hover:border-zinc-400 disabled:opacity-30"
    >
      {etiqueta}
    </button>
  );
}

function CampoTexto({
  etiqueta,
  value,
  onChange,
  placeholder,
}: {
  etiqueta: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="grid gap-1">
      <span className="text-xs uppercase tracking-wide text-zinc-400">{etiqueta}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500"
      />
    </label>
  );
}

function CampoNumero({
  etiqueta,
  value,
  onChange,
  ancho,
  placeholder,
}: {
  etiqueta: string;
  value: string;
  onChange: (v: string) => void;
  ancho: string;
  placeholder?: string;
}) {
  return (
    <label className="grid gap-1">
      <span className="text-xs uppercase tracking-wide text-zinc-400">{etiqueta}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^0-9]/g, ""))}
        inputMode="numeric"
        placeholder={placeholder}
        className={`${ancho} rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-500`}
      />
    </label>
  );
}

// Subida de imagen para un servicio: sube al toque y devuelve la referencia.
// Sin imagen -> se muestra el aviso de "tarjeta básica".
function CampoImagen({
  valor,
  onCambio,
}: {
  valor: string | null;
  onCambio: (ref: string | null) => void;
}) {
  const [subiendo, setSubiendo] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onArchivo(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = ""; // permite volver a elegir el mismo archivo
    if (!f) return;
    setSubiendo(true);
    setError(null);
    try {
      const fd = new FormData();
      fd.append("file", f);
      const res = await subirImagenServicio(fd);
      if (res && res.ok) onCambio(res.ref);
      else
        setError(
          res && "error" in res && res.error === "tamano"
            ? "La imagen es muy pesada (máx 4 MB)."
            : "Formato no válido. Usá JPG, PNG o WEBP.",
        );
    } catch {
      setError("No se pudo subir la imagen. Probá de nuevo.");
    } finally {
      setSubiendo(false);
    }
  }

  return (
    <div>
      <p className="text-xs uppercase tracking-wide text-zinc-400">Imagen (opcional)</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-3">
        {valor ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={valor}
              alt="Vista previa"
              className="h-14 w-14 rounded-lg border border-zinc-200 object-cover"
            />
            <button
              type="button"
              onClick={() => onCambio(null)}
              className="rounded-full border border-zinc-300 px-3 py-1 text-sm font-medium text-zinc-600 transition-colors hover:border-zinc-400"
            >
              Quitar
            </button>
          </>
        ) : (
          <span className="text-sm text-zinc-400">Sin imagen · se muestra la tarjeta básica</span>
        )}
        <label className="cursor-pointer rounded-full border border-zinc-300 px-3 py-1 text-sm font-medium text-zinc-700 transition-colors hover:border-zinc-400">
          {subiendo ? "Subiendo…" : valor ? "Cambiar" : "Subir foto"}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={onArchivo}
            disabled={subiendo}
            className="hidden"
          />
        </label>
      </div>
      {error && <p className="mt-1 text-sm font-medium text-red-600">{error}</p>}
    </div>
  );
}
