export const config = { maxDuration: 60 };

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "GEMINI_API_KEY is missing in Vercel Environment Variables." });
  }

  const prompt = String(req.body?.prompt || "").slice(0, 25000);
  if (!prompt) {
    return res.status(400).json({ error: "No prompt provided." });
  }

  // Try the main model, then a fallback if Google is overloaded.
  const main = process.env.GEMINI_MODEL || "gemini-3.8-flash";
  const fallback = process.env.GEMINI_FALLBACK_MODEL || "gemini-flash-latest";
  const attempts = [main, fallback];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  let lastStatus = 500;
  let lastMsg = "Gemini request failed.";

  for (let i = 0; i < attempts.length; i++) {
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 24000);
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${attempts[i]}:generateContent`,
        {
          method: "POST",
          signal: ctrl.signal,
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.3, maxOutputTokens: 4096 }
          })
        }
      );
      const data = await response.json().catch(() => ({}));
      clearTimeout(timer);

      if (response.ok && !data.error) {
        const text = (data.candidates?.[0]?.content?.parts || [])
          .map((p) => p.text || "")
          .join("")
          .trim();
        if (text) return res.status(200).json({ text });
        return res.status(502).json({
          error: data.promptFeedback?.blockReason
            ? `Gemini blocked the prompt (${data.promptFeedback.blockReason}).`
            : "No response generated from Gemini."
        });
      }

      lastStatus = response.status;
      lastMsg = data.error?.message || `Gemini request failed (${response.status})`;
      // Only retry on overload / rate limit / server errors.
      if (![429, 500, 502, 503, 504].includes(response.status)) break;
    } catch (err) {
      lastMsg = err.name === "AbortError" ? "Gemini took too long to answer." : err.message;
    }
    if (i < attempts.length - 1) await sleep(700 * (i + 1));
  }

  return res.status(lastStatus === 429 ? 429 : 503).json({
    error: "Gemini is busy right now. Wait a few seconds and try again. (" + lastMsg + ")"
  });
}
