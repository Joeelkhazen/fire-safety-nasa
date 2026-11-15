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

  const model = process.env.GEMINI_MODEL || "gemini-3.8-flash";

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey
        },
        body: JSON.stringify({
          contents: [{ role: "user", parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0.3,
            maxOutputTokens: 4096
          }
        })
      }
    );

    const data = await response.json();

    if (!response.ok || data.error) {
      const msg = data.error?.message || `Gemini request failed (${response.status})`;
      return res.status(response.status === 429 ? 429 : 500).json({ error: msg });
    }

    const text = (data.candidates?.[0]?.content?.parts || [])
      .map((p) => p.text || "")
      .join("")
      .trim();

    if (!text) {
      return res.status(502).json({
        error: data.promptFeedback?.blockReason
          ? `Gemini blocked the prompt (${data.promptFeedback.blockReason}).`
          : "No response generated from Gemini."
      });
    }

    return res.status(200).json({ text });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
