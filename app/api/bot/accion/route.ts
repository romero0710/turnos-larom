import { NextResponse } from "next/server";
import { confirmarTurno, expirarTurno } from "@/lib/turnos";

// Acción sobre un turno pendiente (ladrillo 3a). Protegida por x-bot-secret.
// Body: { id: number, accion: "confirmar" | "expirar" }

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const secret = process.env.BOT_API_SECRET || "";
  if (!secret || (req.headers.get("x-bot-secret") || "") !== secret) {
    return NextResponse.json({ error: "no autorizado" }, { status: 401 });
  }

  let body: { id?: number; accion?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "json inválido" }, { status: 400 });
  }

  const id = Number(body.id);
  if (!Number.isInteger(id)) {
    return NextResponse.json({ error: "id inválido" }, { status: 400 });
  }

  if (body.accion === "confirmar") {
    return NextResponse.json({ ok: confirmarTurno(id) });
  }
  if (body.accion === "expirar") {
    return NextResponse.json({ ok: expirarTurno(id) });
  }
  return NextResponse.json({ error: "acción inválida" }, { status: 400 });
}
