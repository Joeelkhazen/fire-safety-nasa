export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "ANTHROPIC_API_KEY is missing in Vercel Environment Variables." });
  }

  const prompt = String(req.body?.prompt || "").slice(0, 25000);
  if (!prompt) {
    return res.status(400).json({ error: "No prompt provided." });
  }

  try {
    const host = ["api", "anthropic", "com"].join(".");
    const apiUrl = "https://" + host + "/v1/messages";
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1024,
        messages: [{ role: "user", content: prompt }]
      })
    });

    const data = await response.json();

    if (data.error) {
      return res.status(500).json({ error: data.error.message });
    }

    const text =
      data.content?.find((block) => block.type === "text")?.text ||
      "No response generated from Claude.";

    return res.status(200).json({ text });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
}
