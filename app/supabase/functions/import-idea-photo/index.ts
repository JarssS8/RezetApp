import { createClient } from "npm:@supabase/supabase-js@2.45.4";

/**
 * Descarga la foto de una idea del catálogo Cecotec y la sube al `recipe-photos`
 * del hogar, para que guardar una idea como receta propia no se quede sin foto.
 * Hace falta un paso de servidor: el bucket S3 de Cecotec no manda cabeceras
 * CORS, así que el navegador no puede leer la imagen con `fetch()` directo
 * (ver `IdeaDetail.tsx`). El host de origen va en una lista cerrada —
 * `url` la manda el cliente, y sin ese filtro esta función sería un SSRF
 * abierto a cualquier URL que alguien logueado quisiera hacerle pedir.
 */
const ALLOWED_HOSTS = new Set(["ecom-media-manager-prod.s3.amazonaws.com"]);
const MAX_BYTES = 8 * 1024 * 1024;
const EXT_BY_TYPE: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: CORS_HEADERS });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return json({ error: "unauthorized" }, 401);
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await callerClient.auth.getUser();
  if (userError || !userData.user) {
    return json({ error: "unauthorized" }, 401);
  }

  let body: { url?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid body" }, 400);
  }
  if (!body.url) {
    return json({ error: "missing url" }, 400);
  }

  let source: URL;
  try {
    source = new URL(body.url);
  } catch {
    return json({ error: "invalid url" }, 400);
  }
  if (source.protocol !== "https:" || !ALLOWED_HOSTS.has(source.hostname)) {
    return json({ error: "url host not allowed" }, 400);
  }

  const { data: profile, error: profileError } = await callerClient
    .from("profile")
    .select("household_id")
    .eq("id", userData.user.id)
    .single();
  if (profileError || !profile?.household_id) {
    return json({ error: "no household" }, 400);
  }

  try {
    const photoRes = await fetch(source);
    if (!photoRes.ok) {
      return json({ error: "photo fetch failed", status: photoRes.status }, 502);
    }
    const contentType = photoRes.headers.get("content-type")?.split(";")[0]?.trim() ?? "";
    const ext = EXT_BY_TYPE[contentType];
    if (!ext) {
      return json({ error: "unsupported content type", contentType }, 502);
    }
    const bytes = new Uint8Array(await photoRes.arrayBuffer());
    if (bytes.byteLength === 0 || bytes.byteLength > MAX_BYTES) {
      return json({ error: "photo too large or empty" }, 502);
    }

    const path = `${profile.household_id}/${crypto.randomUUID()}.${ext}`;
    const { error: uploadError } = await callerClient.storage
      .from("recipe-photos")
      .upload(path, bytes, { contentType, cacheControl: "3600", upsert: false });
    if (uploadError) {
      console.error("import-idea-photo: storage upload failed", uploadError);
      return json({ error: "upload failed" }, 500);
    }

    return json({ path });
  } catch (err) {
    console.error("import-idea-photo: unexpected error", err);
    return json({ error: "unexpected error" }, 500);
  }
});
