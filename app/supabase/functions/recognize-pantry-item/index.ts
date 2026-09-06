import { createClient } from "npm:@supabase/supabase-js@2.45.4";

/**
 * Recibe una foto (base64) de un producto y devuelve lo que Gemini cree
 * ver: nombre, cantidad, unidad y fecha de caducidad si está impresa. El
 * cliente valida el JSON con `domain/pantryImport.ts::mapGeminiRecognition`
 * antes de tocarlo — esta función no valida más allá de "es JSON".
 *
 * Requiere sesión válida (a diferencia de `send-timer-notifications`, que
 * es cron-only): la llama directamente un usuario logueado.
 */
const GEMINI_MODEL = "gemini-2.0-flash";

const PROMPT = `Analiza la foto de un producto de alimentación y devuelve SOLO un JSON con esta forma exacta, sin texto adicional ni backticks:
{"name": string | null, "quantity": number | null, "unit": "g" | "ml" | "ud" | null, "expiresOn": string | null}
- "name": el nombre del producto tal como aparece en el envase.
- "quantity" y "unit": el contenido neto si se lee en el envase (usa "g" para peso, "ml" para volumen, "ud" si es una unidad suelta sin peso claro).
- "expiresOn": SOLO si ves una fecha de caducidad impresa, en formato "YYYY-MM-DD". Si no la ves, null. No la inventes.
Si no reconoces el producto, devuelve todos los campos como null.`;

Deno.serve(async (req) => {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const callerClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userData, error: userError } = await callerClient.auth.getUser();
  if (userError || !userData.user) {
    return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 });
  }

  let body: { image?: string; mimeType?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid body" }), { status: 400 });
  }
  if (!body.image || !body.mimeType) {
    return new Response(JSON.stringify({ error: "missing image or mimeType" }), { status: 400 });
  }

  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const serviceClient = createClient(supabaseUrl, serviceKey);
  const { data: secretRows, error: secretError } = await serviceClient
    .from("app_secret")
    .select("value")
    .eq("key", "GEMINI_API_KEY");
  if (secretError || !secretRows?.[0]) {
    return new Response(JSON.stringify({ error: "missing GEMINI_API_KEY secret" }), { status: 500 });
  }
  const geminiKey = secretRows[0].value as string;

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
    return new Response(JSON.stringify({ error: "gemini request failed" }), { status: 502 });
  }

  const geminiJson = await geminiRes.json();
  const text = geminiJson.candidates?.[0]?.content?.parts?.[0]?.text;
  if (typeof text !== "string") {
    return new Response(JSON.stringify({ error: "empty gemini response" }), { status: 502 });
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return new Response(JSON.stringify({ error: "gemini returned invalid json" }), { status: 502 });
  }

  return new Response(JSON.stringify(parsed), { headers: { "Content-Type": "application/json" } });
});
