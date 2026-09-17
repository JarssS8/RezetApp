import { createClient } from "npm:@supabase/supabase-js@2.45.4";

/**
 * Recibe una foto (base64) de un producto y devuelve lo que Gemini cree
 * ver: nombre, cantidad, unidad y fecha de caducidad si está impresa. El
 * cliente valida el JSON con `domain/pantryImport.ts::mapGeminiRecognition`
 * antes de tocarlo — esta función no valida más allá de "es JSON".
 *
 * Requiere sesión válida (a diferencia de `send-timer-notifications`, que
 * es cron-only): la llama directamente un usuario logueado, desde el
 * navegador (`supabase.functions.invoke`) — a diferencia de esa función
 * cron-only, esta SÍ necesita cabeceras CORS: el navegador manda un
 * preflight `OPTIONS` antes del POST real con `Authorization`/`Content-Type`,
 * y sin responder ese preflight con las cabeceras correctas el navegador
 * bloquea la petición real antes de que la lógica de esta función importe.
 */
const GEMINI_MODEL = "gemini-3.6-flash";

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

const MAX_IMAGE_B64 = 2_000_000; // ~1,5 MB; el cliente manda <=1024px q0.85
const ALLOWED_MIME = new Set(["image/jpeg", "image/png", "image/webp"]);

const PROMPT = `Analiza la foto de un producto de alimentación y devuelve SOLO un JSON con esta forma exacta, sin texto adicional ni backticks:
{"name": string | null, "quantity": number | null, "unit": "g" | "ml" | "ud" | null, "expiresOn": string | null}
- "name": el nombre del producto tal como aparece en el envase.
- "quantity" y "unit": el contenido neto si se lee en el envase (usa "g" para peso, "ml" para volumen, "ud" si es una unidad suelta sin peso claro).
- "expiresOn": SOLO si ves una fecha de caducidad impresa, en formato "YYYY-MM-DD". Si no la ves, null. No la inventes.
Si no reconoces el producto, devuelve todos los campos como null.`;

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

  // Pertenencia a hogar: el mismo límite que aplican todas las RPC. Sin esto,
  // cualquiera con sesión y sin hogar llegaba a la clave de pago del operador.
  const { data: profileRow } = await callerClient
    .from("profile")
    .select("household_id")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (!profileRow?.household_id) {
    return json({ error: "forbidden" }, 403);
  }

  let body: { image?: string; mimeType?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid body" }, 400);
  }
  if (typeof body.image !== "string" || !body.image) {
    return json({ error: "missing image or mimeType" }, 400);
  }
  if (body.image.length > MAX_IMAGE_B64) {
    return json({ error: "image too large" }, 413);
  }
  if (typeof body.mimeType !== "string" || !ALLOWED_MIME.has(body.mimeType)) {
    return json({ error: "unsupported mimeType" }, 415);
  }

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const serviceClient = createClient(supabaseUrl, serviceKey);
  const { data: secretRows, error: secretError } = await serviceClient
    .from("app_secret")
    .select("value")
    .eq("key", "GEMINI_API_KEY");
  if (secretError || !secretRows?.[0]) {
    console.error("recognize-pantry-item: missing GEMINI_API_KEY secret", secretError);
    return json({ error: "missing GEMINI_API_KEY secret" }, 500);
  }
  const geminiKey = secretRows[0].value as string;

  const { data: allowed, error: quotaError } = await serviceClient.rpc("consume_recognition_quota", {
    p_profile: userData.user.id,
    p_limit: 30,
    p_window: "1 hour",
  });
  if (quotaError) {
    console.error("recognize-pantry-item: quota check failed", quotaError);
    return json({ error: "quota check failed" }, 500);
  }
  if (!allowed) {
    return json({ error: "rate limited" }, 429);
  }

  // Errores de red/DNS al llamar a Gemini no estaban capturados: sin este
  // try/catch, una excepción aquí se escapaba de Deno.serve sin cabeceras
  // CORS, y el navegador lo reportaba como fallo de CORS genérico en vez
  // de como el fallo de red que realmente era.
  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": geminiKey },
        body: JSON.stringify({
          contents: [
            {
              parts: [{ text: PROMPT }, { inline_data: { mime_type: body.mimeType, data: body.image } }],
            },
          ],
          generationConfig: { responseMimeType: "application/json" },
        }),
      },
    );
    if (!geminiRes.ok) {
      const detail = await geminiRes.text().catch(() => "");
      console.error(`recognize-pantry-item: gemini request failed (${geminiRes.status})`, detail);
      return json({ error: "gemini request failed", status: geminiRes.status }, 502);
    }

    const geminiJson = await geminiRes.json();
    const text = geminiJson.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof text !== "string") {
      console.error("recognize-pantry-item: empty gemini response", JSON.stringify(geminiJson));
      return json({ error: "empty gemini response" }, 502);
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch {
      console.error("recognize-pantry-item: gemini returned invalid json", text);
      return json({ error: "gemini returned invalid json" }, 502);
    }

    return json(parsed);
  } catch (err) {
    console.error("recognize-pantry-item: unexpected error calling gemini", err);
    return json({ error: "unexpected error" }, 500);
  }
});
