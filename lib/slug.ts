import "server-only";
import { randomBytes } from "node:crypto";

/** Genera un id estable y legible a partir de un nombre, con sufijo aleatorio. */
export function generarId(nombre: string, fallback = "item"): string {
  const base =
    nombre
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "") // saca acentos (marcas diacríticas)
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 20) || fallback;
  return `${base}-${randomBytes(3).toString("hex")}`;
}
