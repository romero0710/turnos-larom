import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { negocio } from "@/config/negocio";
import { obtenerServicio } from "@/lib/servicios";
import { obtenerBarbero } from "@/lib/barberos";

// API interna para el bot de WhatsApp (Servicio 2). Devuelve los turnos
// reservados próximos, para disparar recordatorios. Protegida por secreto
// compartido (header x-bot-secret). No es una API pública.

export const dynamic = "force-dynamic";

// Argentina no tiene horario de verano: offset fijo UTC-3.
const TZ_OFFSET_MIN = 180;

interface FilaProx {
  id: number;
  servicio_id: string;
  barbero_id: string;
  fecha: string; // YYYY-MM-DD (hora local del negocio)
  inicio_min: number;
  cliente_nombre: string;
  cliente_telefono: string;
  token: string;
}

export async function GET(req: Request) {
  const secret = process.env.BOT_API_SECRET || "";
  const auth = req.headers.get("x-bot-secret") || "";
  if (!secret || auth !== secret) {
    return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  }

  const url = new URL(req.url);
  const horas = Math.min(Math.max(parseInt(url.searchParams.get("horas") || "3", 10) || 3, 1), 24);
  const ahora = Date.now();
  const hasta = ahora + horas * 3_600_000;

  const filas = db()
    .prepare(
      `SELECT id, servicio_id, barbero_id, fecha, inicio_min, cliente_nombre, cliente_telefono, token
       FROM turnos
       WHERE negocio_slug = ? AND estado = 'reservado'`,
    )
    .all(negocio.slug) as FilaProx[];

  const turnos = [];
  for (const f of filas) {
    const [y, m, d] = f.fecha.split("-").map(Number);
    const hh = Math.floor(f.inicio_min / 60);
    const mm = f.inicio_min % 60;
    // La hora del turno es local (UTC-3). La paso a epoch absoluto (UTC).
    const inicioEpochMs = Date.UTC(y, m - 1, d, hh, mm) + TZ_OFFSET_MIN * 60_000;
    if (inicioEpochMs < ahora || inicioEpochMs > hasta) continue;
    turnos.push({
      id: f.id,
      nombre: f.cliente_nombre,
      telefono: f.cliente_telefono,
      servicio: obtenerServicio(f.servicio_id)?.nombre ?? f.servicio_id,
      barbero: obtenerBarbero(f.barbero_id)?.nombre ?? f.barbero_id,
      fecha: f.fecha,
      hora: `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`,
      inicioEpochMs,
      token: f.token,
    });
  }

  turnos.sort((a, b) => a.inicioEpochMs - b.inicioEpochMs);
  return NextResponse.json({ negocio: negocio.nombre, turnos });
}
