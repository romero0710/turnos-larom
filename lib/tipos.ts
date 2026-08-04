// Tipos base del molde de reservas. Una sola definición para todos los clientes.
// La app es "config-driven": cada negocio es un objeto Negocio (ver config/negocio.ts).

// Día de semana según Date.getDay(): 0=domingo ... 6=sábado
export type DiaSemana = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface Servicio {
  id: string;
  nombre: string;
  precioArs: number;
  duracionMin: number;
  imagen?: string; // foto de fondo de la tarjeta (ruta en /public)
}

export interface RangoHorario {
  desde: string; // "HH:MM" 24h
  hasta: string; // "HH:MM" 24h
}

// Cada barbero tiene SU horario. En el MVP los 3 comparten el mismo,
// pero el modelo ya soporta horarios distintos por barbero (Fase 2: panel del dueño).
export interface Barbero {
  id: string;
  nombre: string;
  activo: boolean;
  horario: Partial<Record<DiaSemana, RangoHorario[]>>; // día -> rangos; ausente/vacío = no trabaja
  clave?: string; // clave propia para entrar al panel y ver solo sus turnos (Fase 2)
}

// Quién está usando el panel. Tipo "puro" (sin server-only) para poder
// compartirlo entre el server (auth) y el cliente (UI del panel).
export type SesionPanel =
  | { tipo: "dueno" }
  | { tipo: "barbero"; barberoId: string; barberoNombre: string };

export interface Marca {
  primario: string; // color de acento (hex)
  primarioTextoOscuro: boolean; // true si sobre el color primario conviene texto oscuro
}

export interface Negocio {
  slug: string;
  nombre: string;
  rubro: string;
  descripcion: string;
  telefono?: string;
  direccion?: string;
  mapaEmbedUrl?: string;
  instagram?: string;
  marca: Marca;
  servicios: Servicio[];
  barberos: Barbero[];
  intervaloSlotMin: number; // paso de la grilla de horarios (ej: 15 min)
  imagenes?: {
    logo?: string; // ruta en /public
    portada?: string; // foto de fondo del hero (ej: local desde afuera)
    galeria?: string[]; // fotos de trabajos (cortes, barba)
  };
}
