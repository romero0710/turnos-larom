import type { Negocio, RangoHorario, DiaSemana } from "@/lib/tipos";

// ============================================================================
// CONFIG DEL CLIENTE — Don Gambino (caso modelo / demo)
// Para un cliente nuevo: se copia este archivo y se cambian los datos. La app no.
// ============================================================================

// Horario compartido en el MVP: Lunes a Sábado 10:00–20:00.
// (Fase 2: cada barbero podrá tener el suyo desde el panel del dueño.)
export const HORARIO_LUN_A_SAB: Partial<Record<DiaSemana, RangoHorario[]>> = {
  1: [{ desde: "10:00", hasta: "20:00" }], // lunes
  2: [{ desde: "10:00", hasta: "20:00" }],
  3: [{ desde: "10:00", hasta: "20:00" }],
  4: [{ desde: "10:00", hasta: "20:00" }],
  5: [{ desde: "10:00", hasta: "20:00" }],
  6: [{ desde: "10:00", hasta: "20:00" }], // sábado
  // 0 (domingo): cerrado
};

export const negocio: Negocio = {
  slug: "don-gambino",
  nombre: "Don Gambino",
  rubro: "Barbería",
  descripcion:
    "Barbería clásica de barrio. Cortes, barba y buena atención. Reservá tu turno online en 30 segundos.",
  telefono: "",
  direccion: "",
  mapaEmbedUrl: "",
  instagram: "",
  marca: {
    primario: "#c9a227", // dorado clásico de barbería
    primarioTextoOscuro: true,
  },
  intervaloSlotMin: 15,
  imagenes: {
    logo: "/fotos/logo.jpg",
    portada: "/fotos/barberia.jpeg",
    galeria: ["/fotos/corte-de-pelo.jpeg", "/fotos/barba-y-corte.jpg"],
  },
  servicios: [
    { id: "corte", nombre: "Corte", precioArs: 15000, duracionMin: 30, imagen: "/fotos/corte-de-pelo.jpeg" },
    { id: "corte-barba", nombre: "Corte y barba", precioArs: 20000, duracionMin: 45, imagen: "/fotos/barba-y-corte.jpg" },
    { id: "barba", nombre: "Barba", precioArs: 6000, duracionMin: 20, imagen: "/fotos/barba-y-corte.jpg" },
  ],
  // La clave del dueño (ve TODOS los turnos) va aparte, en la env var PANEL_PASSWORD.
  // Cada barbero tiene la suya y ve solo lo suyo. Cambiá estas claves por cliente.
  barberos: [
    { id: "lucas", nombre: "Lucas", activo: true, horario: HORARIO_LUN_A_SAB, clave: "lucas25" },
    { id: "joel", nombre: "Joel", activo: true, horario: HORARIO_LUN_A_SAB, clave: "joel25" },
    { id: "agustin", nombre: "Agustín", activo: true, horario: HORARIO_LUN_A_SAB, clave: "agus25" },
  ],
};
