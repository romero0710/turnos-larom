"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { negocio } from "@/config/negocio";
import {
  formatearPrecio,
  nombreDiaLargo,
  proximosDiasHabiles,
} from "@/lib/disponibilidad";
import { confirmarReserva, obtenerHorarios } from "@/app/actions/turnos";
import type { Barbero, Servicio } from "@/lib/tipos";

const PRIMARIO = negocio.marca.primario;
const TEXTO_PRIMARIO = negocio.marca.primarioTextoOscuro ? "#111827" : "#ffffff";

type Paso = 1 | 2 | 3 | 4 | 5;

interface ReservaProps {
  servicios: Servicio[];
  barberos: Barbero[];
  barberosPorServicio: Record<string, string[]>; // servicioId -> ids de barberos que lo hacen
  confirmacionWhatsApp?: boolean; // el turno se confirma por WhatsApp (SÍ o seña)
}

export default function Reserva({ servicios, barberos, barberosPorServicio, confirmacionWhatsApp }: ReservaProps) {
  const [montado, setMontado] = useState(false);
  const [paso, setPaso] = useState<Paso>(1);

  const [servicioId, setServicioId] = useState<string | null>(null);
  const [barberoId, setBarberoId] = useState<string | null | undefined>(undefined); // undefined=sin elegir, null="cualquiera"
  const [fechaIso, setFechaIso] = useState<string | null>(null);
  const [hora, setHora] = useState<string | null>(null);
  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [confirmado, setConfirmado] = useState(false);

  // Horarios reales (traídos del servidor, ya descontando turnos tomados).
  const [horarios, setHorarios] = useState<string[]>([]);
  const [cargandoHorarios, setCargandoHorarios] = useState(false);

  // Estado del alta de turno.
  const [enviando, setEnviando] = useState(false);
  const [errorReserva, setErrorReserva] = useState<string | null>(null);
  const [barberoAsignado, setBarberoAsignado] = useState<string | null>(null);
  const [tokenTurno, setTokenTurno] = useState<string | null>(null);

  // Si venís desde la home con un servicio ya elegido (?servicio=corte),
  // lo preseleccionamos y saltamos directo al paso "con quién".
  useEffect(() => {
    setMontado(true);
    const params = new URLSearchParams(window.location.search);
    const servicioUrl = params.get("servicio");
    if (servicioUrl && servicios.some((s) => s.id === servicioUrl)) {
      setServicioId(servicioUrl);
      setPaso(2);
    }
  }, [servicios]);

  const servicio = useMemo(
    () => servicios.find((s) => s.id === servicioId) ?? null,
    [servicios, servicioId],
  );
  // Días con atención. Si el cliente eligió un barbero puntual, se calculan con
  // el horario de ESE barbero (no todos trabajan los mismos días). Si eligió
  // "cualquiera" (null) o todavía no eligió, se usa la unión de todos.
  const dias = useMemo(() => {
    if (!montado) return [];
    const paraDias =
      typeof barberoId === "string" ? barberos.filter((b) => b.id === barberoId) : barberos;
    return proximosDiasHabiles({ ...negocio, barberos: paraDias }, 14);
  }, [montado, barberos, barberoId]);
  const fecha = fechaIso ? new Date(fechaIso) : null;

  // Barberos que hacen el servicio elegido (para el paso "¿Con quién?").
  const barberosDelServicio = useMemo(() => {
    if (!servicioId) return [];
    const habilitados = new Set(barberosPorServicio[servicioId] ?? []);
    return barberos.filter((b) => habilitados.has(b.id));
  }, [barberos, barberosPorServicio, servicioId]);

  const cargarHorarios = useCallback(async () => {
    if (!servicioId || !fechaIso || barberoId === undefined) return;
    setCargandoHorarios(true);
    try {
      const hs = await obtenerHorarios(servicioId, barberoId ?? null, fechaIso);
      setHorarios(hs);
    } catch {
      setHorarios([]);
    } finally {
      setCargandoHorarios(false);
    }
  }, [servicioId, barberoId, fechaIso]);

  useEffect(() => {
    void cargarHorarios();
  }, [cargarHorarios]);

  const nombreBarbero =
    barberoId == null
      ? "Cualquiera disponible"
      : (barberos.find((b) => b.id === barberoId)?.nombre ?? "");

  async function onConfirmar() {
    if (!servicio || !fechaIso || !hora) return;
    setEnviando(true);
    setErrorReserva(null);
    try {
      const res = await confirmarReserva({
        servicioId: servicio.id,
        barberoId: barberoId ?? null,
        fechaIso,
        hora,
        nombre,
        telefono,
      });
      if (res.ok) {
        setBarberoAsignado(res.barberoNombre);
        setTokenTurno(res.token);
        setConfirmado(true);
      } else if (res.error === "tomado") {
        setErrorReserva("Uy, ese horario se acaba de ocupar. Elegí otro, porfa 🙏");
        setHora(null);
        setPaso(4);
        void cargarHorarios();
      } else {
        setErrorReserva("No pudimos guardar el turno. Probá de nuevo en un momento.");
      }
    } catch {
      setErrorReserva("No pudimos guardar el turno. Revisá tu conexión y probá de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  if (!montado) {
    return <div className="py-24 text-center text-zinc-400">Cargando…</div>;
  }

  if (confirmado && servicio && fecha && hora) {
    return (
      <div className="mx-auto max-w-lg px-6 py-16 text-center">
        <div
          className="mx-auto flex h-16 w-16 items-center justify-center rounded-full text-3xl"
          style={{ background: PRIMARIO, color: TEXTO_PRIMARIO }}
        >
          ✓
        </div>
        <h1 className="mt-6 text-2xl font-bold">¡Turno reservado!</h1>
        <p className="mt-2 text-zinc-500">Te esperamos, {nombre.split(" ")[0] || "crack"}.</p>

        {confirmacionWhatsApp && (
          <div className="mt-6 rounded-2xl border border-amber-300 bg-amber-50 p-5 text-left">
            <p className="text-sm font-semibold text-amber-900">
              📲 Revisá tu WhatsApp para confirmar
            </p>
            <p className="mt-1 text-sm text-amber-800">
              Te enviamos un mensaje para dejar el turno confirmado. Seguí los pasos que te
              indica; si no lo confirmás, el horario puede liberarse.
            </p>
          </div>
        )}

        <div className="mt-8 rounded-2xl border border-zinc-200 p-6 text-left">
          <Fila etiqueta="Servicio" valor={`${servicio.nombre} · ${servicio.duracionMin} min`} />
          <Fila etiqueta="Precio" valor={formatearPrecio(servicio.precioArs)} />
          <Fila etiqueta="Barbero" valor={barberoAsignado ?? nombreBarbero} />
          <Fila
            etiqueta="Día"
            valor={`${nombreDiaLargo(fecha)} ${fecha.getDate()}/${fecha.getMonth() + 1}`}
          />
          <Fila etiqueta="Hora" valor={`${hora} hs`} />
        </div>

        {tokenTurno && (
          <div className="mt-6 rounded-2xl border border-zinc-200 bg-zinc-50 p-5 text-left">
            <p className="text-sm font-semibold">¿Necesitás cancelar?</p>
            <p className="mt-1 text-sm text-zinc-500">
              Guardá este link para ver o cancelar tu turno (hasta 2 horas antes):
            </p>
            <Link
              href={`/turno/${tokenTurno}`}
              className="mt-3 inline-block w-full rounded-full border px-5 py-2.5 text-center text-sm font-semibold transition-colors hover:bg-white"
              style={{ borderColor: PRIMARIO }}
            >
              Ver o cancelar mi turno
            </Link>
          </div>
        )}

        <Link
          href="/"
          className="mt-6 inline-block rounded-full px-6 py-3 text-sm font-semibold"
          style={{ background: PRIMARIO, color: TEXTO_PRIMARIO }}
        >
          Volver al inicio
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-6 py-12">
      <div className="mb-8 flex items-center justify-between">
        <Link href="/" className="text-sm text-zinc-500 hover:text-zinc-800">
          ← {negocio.nombre}
        </Link>
        <span className="text-sm font-medium text-zinc-400">Paso {paso} de 5</span>
      </div>

      <BarraProgreso paso={paso} />

      {/* Paso 1: Servicio */}
      {paso === 1 && (
        <Bloque titulo="¿Qué te vas a hacer?">
          <div className="grid gap-3">
            {servicios.map((s) => (
              <Opcion
                key={s.id}
                seleccionada={servicioId === s.id}
                onClick={() => {
                  setServicioId(s.id);
                  setBarberoId(undefined); // el barbero elegido puede no hacer este servicio
                  setHora(null);
                  setPaso(2);
                }}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold">{s.nombre}</p>
                    <p className="text-sm text-zinc-500">{s.duracionMin} min</p>
                  </div>
                  <span className="font-bold">{formatearPrecio(s.precioArs)}</span>
                </div>
              </Opcion>
            ))}
          </div>
        </Bloque>
      )}

      {/* Paso 2: Barbero */}
      {paso === 2 && (
        <Bloque titulo="¿Con quién?">
          <div className="grid gap-3 sm:grid-cols-2">
            <Opcion
              seleccionada={barberoId === null}
              onClick={() => {
                setBarberoId(null);
                setHora(null);
                setPaso(3);
              }}
            >
              <p className="font-semibold">Cualquiera disponible</p>
              <p className="text-sm text-zinc-500">El primero que tenga lugar</p>
            </Opcion>
            {barberosDelServicio.map((b) => (
                <Opcion
                  key={b.id}
                  seleccionada={barberoId === b.id}
                  onClick={() => {
                    setBarberoId(b.id);
                    setHora(null);
                    setPaso(3);
                  }}
                >
                  <p className="font-semibold">{b.nombre}</p>
                </Opcion>
              ))}
          </div>
          {barberosDelServicio.length === 0 && (
            <p className="mt-3 text-sm text-amber-700">
              Por ahora nadie tiene este servicio habilitado. Probá con otro o consultá en el local.
            </p>
          )}
          <BotonVolver onClick={() => setPaso(1)} />
        </Bloque>
      )}

      {/* Paso 3: Día */}
      {paso === 3 && (
        <Bloque titulo="Elegí el día">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {dias.map((d) => {
              const iso = d.toISOString();
              return (
                <Opcion
                  key={iso}
                  seleccionada={fechaIso === iso}
                  onClick={() => {
                    setFechaIso(iso);
                    setHora(null);
                    setPaso(4);
                  }}
                >
                  <p className="text-sm text-zinc-500">{nombreDiaLargo(d)}</p>
                  <p className="text-lg font-semibold">
                    {d.getDate()}/{d.getMonth() + 1}
                  </p>
                </Opcion>
              );
            })}
          </div>
          <BotonVolver onClick={() => setPaso(2)} />
        </Bloque>
      )}

      {/* Paso 4: Hora */}
      {paso === 4 && (
        <Bloque titulo="Elegí el horario">
          {errorReserva && (
            <p className="mb-4 rounded-lg bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
              {errorReserva}
            </p>
          )}
          {cargandoHorarios ? (
            <p className="text-zinc-400">Buscando horarios libres…</p>
          ) : horarios.length === 0 ? (
            <p className="text-zinc-500">No hay horarios disponibles ese día. Probá con otro.</p>
          ) : (
            <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
              {horarios.map((h) => (
                <button
                  key={h}
                  onClick={() => {
                    setHora(h);
                    setPaso(5);
                  }}
                  className="rounded-lg border border-zinc-200 py-2 text-sm font-medium transition-colors hover:border-zinc-400"
                  style={hora === h ? { background: PRIMARIO, color: TEXTO_PRIMARIO } : undefined}
                >
                  {h}
                </button>
              ))}
            </div>
          )}
          <BotonVolver onClick={() => setPaso(3)} />
        </Bloque>
      )}

      {/* Paso 5: Datos */}
      {paso === 5 && servicio && fecha && hora && (
        <Bloque titulo="Tus datos">
          <div className="mb-6 rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm">
            <Fila etiqueta="Servicio" valor={`${servicio.nombre} · ${formatearPrecio(servicio.precioArs)}`} />
            <Fila etiqueta="Barbero" valor={nombreBarbero} />
            <Fila
              etiqueta="Cuándo"
              valor={`${nombreDiaLargo(fecha)} ${fecha.getDate()}/${fecha.getMonth() + 1} · ${hora} hs`}
            />
          </div>
          <div className="grid gap-4">
            <label className="grid gap-1">
              <span className="text-sm font-medium">Nombre y apellido</span>
              <input
                value={nombre}
                onChange={(e) => setNombre(e.target.value)}
                placeholder="Juan Pérez"
                className="rounded-lg border border-zinc-300 px-3 py-2 outline-none focus:border-zinc-500"
              />
            </label>
            <label className="grid gap-1">
              <span className="text-sm font-medium">WhatsApp</span>
              <input
                value={telefono}
                onChange={(e) => setTelefono(e.target.value)}
                placeholder="11 2345 6789"
                inputMode="tel"
                className="rounded-lg border border-zinc-300 px-3 py-2 outline-none focus:border-zinc-500"
              />
            </label>
          </div>
          {errorReserva && (
            <p className="mt-4 rounded-lg bg-amber-50 px-4 py-3 text-sm font-medium text-amber-800">
              {errorReserva}
            </p>
          )}
          <button
            disabled={nombre.trim().length < 2 || telefono.trim().length < 6 || enviando}
            onClick={onConfirmar}
            className="mt-6 w-full rounded-full py-3 text-base font-semibold transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
            style={{ background: PRIMARIO, color: TEXTO_PRIMARIO }}
          >
            {enviando ? "Guardando…" : "Confirmar turno"}
          </button>
          <BotonVolver onClick={() => setPaso(4)} />
        </Bloque>
      )}
    </div>
  );
}

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="mt-8">
      <h1 className="mb-5 text-2xl font-bold tracking-tight">{titulo}</h1>
      {children}
    </div>
  );
}

function Opcion({
  seleccionada,
  onClick,
  children,
}: {
  seleccionada: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="rounded-2xl border p-4 text-left transition-colors hover:border-zinc-400"
      style={{ borderColor: seleccionada ? PRIMARIO : "#e4e4e7" }}
    >
      {children}
    </button>
  );
}

function BotonVolver({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="mt-6 text-sm text-zinc-500 hover:text-zinc-800"
    >
      ← Volver
    </button>
  );
}

function BarraProgreso({ paso }: { paso: number }) {
  return (
    <div className="flex gap-1.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <span
          key={n}
          className="h-1.5 flex-1 rounded-full"
          style={{ background: n <= paso ? PRIMARIO : "#e4e4e7" }}
        />
      ))}
    </div>
  );
}

function Fila({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div className="flex items-center justify-between py-1">
      <span className="text-zinc-500">{etiqueta}</span>
      <span className="font-medium text-zinc-900">{valor}</span>
    </div>
  );
}
