import "server-only";
import Database from "better-sqlite3";
import { existsSync, mkdirSync } from "node:fs";
import path from "node:path";

// ============================================================================
// Conexión a SQLite. Un solo archivo por deploy (una barbería = una base).
// Capa fina y aislada: si algún día migramos a Postgres, se toca solo acá y
// lib/turnos.ts, no el resto de la app.
// ============================================================================

// La base vive en /data dentro del proyecto. Se puede sobreescribir con la
// variable de entorno DB_PATH (útil en el VPS para apuntar a un disco/volumen).
// Ruta leída de forma perezosa (en el primer uso), no al importar el módulo,
// para que tests puedan fijar DB_PATH antes de la primera consulta.
function rutaDb(): string {
  return process.env.DB_PATH || path.join(process.cwd(), "data", "turnos.db");
}

let _db: Database.Database | null = null;

export function db(): Database.Database {
  if (_db) return _db;

  const dbPath = rutaDb();
  const dir = path.dirname(dbPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const database = new Database(dbPath);
  database.pragma("journal_mode = WAL"); // mejor concurrencia lectura/escritura
  database.pragma("foreign_keys = ON");
  inicializarEsquema(database);

  _db = database;
  return _db;
}

function inicializarEsquema(database: Database.Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS turnos (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      negocio_slug   TEXT    NOT NULL,
      servicio_id    TEXT    NOT NULL,
      barbero_id     TEXT    NOT NULL,
      fecha          TEXT    NOT NULL,           -- YYYY-MM-DD (día local del negocio)
      inicio_min     INTEGER NOT NULL,           -- minutos desde medianoche
      fin_min        INTEGER NOT NULL,           -- inicio_min + duración del servicio
      cliente_nombre   TEXT  NOT NULL,
      cliente_telefono TEXT  NOT NULL,
      token          TEXT,                       -- código secreto para ver/cancelar el turno
      estado         TEXT    NOT NULL DEFAULT 'reservado', -- reservado | cancelado
      creado_en      TEXT    NOT NULL DEFAULT (datetime('now'))
    );

    -- Búsqueda rápida de turnos de un día/barbero.
    CREATE INDEX IF NOT EXISTS idx_turnos_lookup
      ON turnos (negocio_slug, barbero_id, fecha, estado);

    -- Servicios editables desde el panel (Fase 2.1). Se siembran la primera vez
    -- desde config/negocio.ts (ver lib/servicios.ts). El id es estable porque los
    -- turnos lo referencian; por eso los "borrados" son soft-delete (activo = 0).
    CREATE TABLE IF NOT EXISTS servicios (
      negocio_slug TEXT    NOT NULL,
      id           TEXT    NOT NULL,
      nombre       TEXT    NOT NULL,
      precio_ars   INTEGER NOT NULL,
      duracion_min INTEGER NOT NULL,
      imagen       TEXT,                       -- ruta en /public (opcional)
      orden        INTEGER NOT NULL DEFAULT 0, -- orden de aparición
      activo       INTEGER NOT NULL DEFAULT 1, -- 0 = dado de baja (oculto, pero resuelve históricos)
      PRIMARY KEY (negocio_slug, id)
    );

    -- Barberos editables desde el panel (Fase 2.1, ladrillo 2). Se siembran la
    -- primera vez desde config/negocio.ts (ver lib/barberos.ts). Igual que
    -- servicios: soft-delete para no romper turnos históricos.
    -- El horario todavía es compartido (config), no vive acá: eso es el
    -- ladrillo 3.
    CREATE TABLE IF NOT EXISTS barberos (
      negocio_slug TEXT    NOT NULL,
      id           TEXT    NOT NULL,
      nombre       TEXT    NOT NULL,
      clave        TEXT    NOT NULL,
      orden        INTEGER NOT NULL DEFAULT 0,
      activo       INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (negocio_slug, id)
    );

    -- Qué barberos realizan cada servicio (muchos a muchos). Sin fila = no lo
    -- hace. Resuelve el caso "no todos los barberos hacen tintura".
    CREATE TABLE IF NOT EXISTS servicios_barberos (
      negocio_slug TEXT NOT NULL,
      servicio_id  TEXT NOT NULL,
      barbero_id   TEXT NOT NULL,
      PRIMARY KEY (negocio_slug, servicio_id, barbero_id)
    );

    -- Horario propio de cada barbero (Fase 2.1, ladrillo 3). Una fila por franja
    -- (día + desde/hasta). Sin fila para un día = ese barbero no trabaja ese día.
    -- El id incluye 'desde' en la PK para soportar turnos partidos (ej. corte de
    -- mediodía) sin cambiar el esquema. Se siembra la primera vez desde el horario
    -- de config/negocio.ts.
    CREATE TABLE IF NOT EXISTS barberos_horarios (
      negocio_slug TEXT    NOT NULL,
      barbero_id   TEXT    NOT NULL,
      dia          INTEGER NOT NULL,   -- 0=domingo ... 6=sábado (Date.getDay())
      desde        TEXT    NOT NULL,   -- "HH:MM"
      hasta        TEXT    NOT NULL,   -- "HH:MM"
      PRIMARY KEY (negocio_slug, barbero_id, dia, desde)
    );

    -- Galería del carrusel (Fase 2.1, Paso B). Editable desde el panel. Se siembra
    -- la primera vez desde config/negocio.ts. 'orden' define la secuencia.
    CREATE TABLE IF NOT EXISTS galeria (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      negocio_slug TEXT    NOT NULL,
      imagen       TEXT    NOT NULL,
      orden        INTEGER NOT NULL DEFAULT 0
    );

    -- Flags internos por negocio (ej. "la galería ya se sembró") para no repetir
    -- siembras después de que el dueño borre todo intencionalmente.
    CREATE TABLE IF NOT EXISTS app_meta (
      negocio_slug TEXT NOT NULL,
      clave        TEXT NOT NULL,
      valor        TEXT NOT NULL,
      PRIMARY KEY (negocio_slug, clave)
    );
  `);

  migrarColumnaToken(database);
  migrarColumnasConfirmacion(database);

  database.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_turnos_token ON turnos (token);
  `);
}

/** Agrega la columna token a bases viejas (creadas antes de esta feature). */
function migrarColumnaToken(database: Database.Database): void {
  const columnas = database
    .prepare(`PRAGMA table_info(turnos)`)
    .all() as { name: string }[];
  if (!columnas.some((c) => c.name === "token")) {
    database.exec(`ALTER TABLE turnos ADD COLUMN token TEXT`);
  }
}

/**
 * Confirmación del turno por WhatsApp (Servicio 2, ladrillo 3a).
 * - requiere_confirmacion: 1 si el turno se creó con confirmación activada.
 * - confirmado: 1 cuando el cliente respondió SÍ por WhatsApp.
 * Un turno sigue siendo estado='reservado' (ocupa el horario) mientras está
 * pendiente; si expira o el cliente dice NO, pasa a estado='expirado' (libera
 * el horario y NO cuenta como cancelación en métricas). Turnos viejos quedan
 * con requiere_confirmacion=0 → no se los toca.
 */
function migrarColumnasConfirmacion(database: Database.Database): void {
  const columnas = database
    .prepare(`PRAGMA table_info(turnos)`)
    .all() as { name: string }[];
  const tiene = (n: string) => columnas.some((c) => c.name === n);
  if (!tiene("requiere_confirmacion")) {
    database.exec(`ALTER TABLE turnos ADD COLUMN requiere_confirmacion INTEGER NOT NULL DEFAULT 0`);
  }
  if (!tiene("confirmado")) {
    database.exec(`ALTER TABLE turnos ADD COLUMN confirmado INTEGER NOT NULL DEFAULT 0`);
  }
}
