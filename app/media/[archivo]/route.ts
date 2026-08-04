import { leerImagen } from "@/lib/uploads";

// Sirve las imágenes subidas desde la carpeta de datos (no son estáticos de
// /public). Dinámica: el archivo puede aparecer/cambiar en runtime.
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ archivo: string }> },
): Promise<Response> {
  const { archivo } = await params;
  const img = await leerImagen(archivo);
  if (!img) return new Response("No encontrado", { status: 404 });

  return new Response(new Uint8Array(img.buf), {
    status: 200,
    headers: {
      "Content-Type": img.contentType,
      // Nombre único por subida => se puede cachear agresivo.
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
