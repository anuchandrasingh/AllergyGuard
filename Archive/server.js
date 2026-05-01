const http = require("http");
const fs = require("fs");
const path = require("path");

loadLocalEnv();

const PORT = Number(process.env.PORT || 4173);
const MODEL = process.env.CLAUDE_MODEL || "claude-sonnet-4-20250514";
const FALLBACK_MODELS = ["claude-sonnet-4-20250514"];
const VISION_FALLBACK_MODELS = ["claude-sonnet-4-20250514"];
const ANTHROPIC_VERSION = "2023-06-01";
const PUBLIC_DIR = __dirname;
const SAFETY_LOGS_DIR = path.join(__dirname, "safety_logs");

const mimeTypes = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

const analysisTool = {
  name: "record_allergy_analysis",
  description: "Record a structured food allergy risk analysis.",
  input_schema: {
    type: "object",
    properties: {
      risk: { type: "string", enum: ["High Risk", "Ask More", "Lower Risk"] },
      concerns: { type: "array", items: { type: "string" } },
      image_quality: { type: "string", enum: ["clear", "unclear", "not_applicable"] },
      menu_items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            risk: { type: "string", enum: ["High Risk", "Ask More", "Lower Risk"] },
            reason: { type: "string" },
            questions_to_ask: { type: "array", items: { type: "string" } },
            safe_swap: { type: "string" },
          },
          required: ["name", "risk", "reason", "questions_to_ask", "safe_swap"],
        },
      },
      shared_prep_warnings: { type: "array", items: { type: "string" } },
      safer_alternatives: { type: "array", items: { type: "string" } },
      staff_script: { type: "string" },
      confidence: { type: "string" },
      uncertainty_level: { type: "string" },
      direct_allergens: { type: "array", items: { type: "string" } },
      hidden_allergens: { type: "array", items: { type: "string" } },
      ambiguous_ingredients: { type: "array", items: { type: "string" } },
      allergy_mapping: { type: "array", items: { type: "string" } },
      why_flagged: { type: "array", items: { type: "string" } },
      questions_to_ask: { type: "array", items: { type: "string" } },
      explanation: { type: "string" },
      next_step: { type: "string" },
    },
    required: [
      "risk",
      "concerns",
      "image_quality",
      "menu_items",
      "shared_prep_warnings",
      "safer_alternatives",
      "staff_script",
      "confidence",
      "uncertainty_level",
      "direct_allergens",
      "hidden_allergens",
      "ambiguous_ingredients",
      "allergy_mapping",
      "why_flagged",
      "questions_to_ask",
      "explanation",
      "next_step",
    ],
  },
};

const responseTool = {
  name: "record_waiter_response_analysis",
  description: "Record a structured analysis of a waiter response.",
  input_schema: {
    type: "object",
    properties: {
      certainty: { type: "string", enum: ["Confirmed", "Uncertain", "Unsafe"] },
      analysis: { type: "string" },
      recommendation: { type: "string" },
    },
    required: ["certainty", "analysis", "recommendation"],
  },
};

function loadLocalEnv() {
  const envPath = path.join(__dirname, ".env");

  if (!fs.existsSync(envPath)) return;

  const lines = fs.readFileSync(envPath, "utf8").split(/\r?\n/);
  lines.forEach((line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;

    const equalsIndex = trimmed.indexOf("=");
    if (equalsIndex === -1) return;

    const key = trimmed.slice(0, equalsIndex).trim();
    let value = trimmed.slice(equalsIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    if (key && !process.env[key]) {
      process.env[key] = value;
    }
  });
}

function sendJson(res, status, payload) {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" });
  res.end(JSON.stringify(payload));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk;
      if (body.length > 12_000_000) {
        reject(new Error("Request body too large"));
        req.destroy();
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });
}

function loadSafetyKnowledge() {
  if (!fs.existsSync(SAFETY_LOGS_DIR)) return "";

  return fs
    .readdirSync(SAFETY_LOGS_DIR)
    .filter((file) => /\.(md|txt)$/i.test(file))
    .sort()
    .map((file) => {
      const filePath = path.join(SAFETY_LOGS_DIR, file);
      const text = fs.readFileSync(filePath, "utf8").slice(0, 6000);
      return `--- ${file} ---\n${text}`;
    })
    .join("\n\n");
}

function extractJson(text) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : trimmed;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");

  if (start === -1 || end === -1) {
    throw new Error("Claude response did not contain JSON");
  }

  const json = candidate.slice(start, end + 1);
  try {
    return JSON.parse(json);
  } catch (error) {
    return JSON.parse(repairJson(json));
  }
}

function repairJson(json) {
  return json
    .replace(/,\s*([}\]])/g, "$1")
    .replace(/"\s*\n\s*"/g, '",\n"')
    .replace(/]\s*\n\s*"/g, '],\n"')
    .replace(/}\s*\n\s*"/g, '},\n"')
    .replace(/"(\s*)\{/g, '",$1{')
    .replace(/"(\s*)\[/g, '",$1[')
    .replace(/}\s*\{/g, "},{")
    .replace(/]\s*\[/g, "],[");
}

function normalizeResult(result) {
  const allowedRisk = new Set(["High Risk", "Ask More", "Lower Risk"]);
  const risk = allowedRisk.has(result.risk) ? result.risk : "Ask More";
  const list = (value, limit = 8) =>
    Array.isArray(value) ? value.map(String).filter(Boolean).slice(0, limit) : [];
  const concerns = list(result.concerns);
  const confidence = String(result.confidence || "").trim() || inferConfidence(risk, concerns);
  const uncertainty =
    String(result.uncertainty_level || "").trim() || inferUncertainty(risk, concerns, result.menu_items);

  return {
    risk,
    concerns,
    image_quality: ["clear", "unclear", "not_applicable"].includes(result.image_quality)
      ? result.image_quality
      : "not_applicable",
    menu_items: Array.isArray(result.menu_items)
      ? result.menu_items
          .map((item) => ({
            name: String(item?.name || "").slice(0, 120),
            risk: allowedRisk.has(item?.risk) ? item.risk : "Ask More",
            reason: String(item?.reason || "").slice(0, 260),
            questions_to_ask: list(item?.questions_to_ask, 3),
            safe_swap: String(item?.safe_swap || "").slice(0, 220),
          }))
          .filter((item) => item.name)
          .slice(0, 12)
      : [],
    shared_prep_warnings: list(result.shared_prep_warnings, 8),
    safer_alternatives: list(result.safer_alternatives, 8),
    staff_script: String(result.staff_script || "").slice(0, 900),
    confidence: confidence.slice(0, 80),
    uncertainty_level: uncertainty.slice(0, 120),
    direct_allergens: list(result.direct_allergens),
    hidden_allergens: list(result.hidden_allergens),
    ambiguous_ingredients: list(result.ambiguous_ingredients),
    allergy_mapping: list(result.allergy_mapping, 10),
    why_flagged: list(result.why_flagged, 8),
    questions_to_ask: list(result.questions_to_ask, 4),
    explanation: String(result.explanation || "").slice(0, 1500),
    next_step: String(result.next_step || "").slice(0, 700),
  };
}

function inferConfidence(risk, concerns) {
  if (risk === "High Risk" && concerns.length) return "High";
  if (risk === "Ask More") return "Medium";
  return "Low-Medium";
}

function inferUncertainty(risk, concerns, menuItems) {
  if (risk === "High Risk" && concerns.length) {
    return "Direct or strong concern found in the menu text.";
  }

  if (risk === "Ask More") {
    return "Some ingredients, prep details, or staff protocols need confirmation.";
  }

  if (Array.isArray(menuItems) && menuItems.length) {
    return "Lower visible risk, but prep and hidden ingredients still need confirmation.";
  }

  return "Lower visible risk based on provided text, not a safety guarantee.";
}

function buildPrompt(allergies, severity, ingredientText, mode, hasImage) {
  const safetyKnowledge = loadSafetyKnowledge();
  const modeInstructions =
    mode === "restaurant"
      ? `This is a restaurant menu or server-note analysis. ${hasImage ? "Read the menu image carefully, including stylized text, section headings, small notes, and multi-column layout." : ""} Identify dish names when possible. Look beyond explicit ingredients. Consider vague menu phrases like house sauce, chef special, crispy, fried, aioli, pesto, marinade, curry, garnish, seasonal, natural flavors, and server uncertainty such as probably, should be, I think, not sure, or usually. Reason about cross-contact risks from shared fryers, shared woks, grills, prep stations, sauces, garnishes, and staff uncertainty.`
      : `This is a packaged food ingredient-label analysis. Focus on direct ingredients, hidden allergen terms, ambiguous ingredients, and manufacturing/source uncertainty.`;

  return `You are Food Allergy Guard, an allergy risk analysis assistant.

Analyze the ingredient list or product description for these allergies:
${allergies.map((allergy) => `- ${allergy}`).join("\n")}

Severity level: ${severity}

Input type: ${mode === "restaurant" ? "restaurant menu" : "packaged food"}

${modeInstructions}

Local safety knowledge files:
${safetyKnowledge || "No local safety knowledge files found."}

Input text:
"""${ingredientText}"""

Check for:
- direct allergens
- hidden allergen terms, including casein, whey, albumin, lecithin, malt, semolina, ghee, mayonnaise, fish sauce, corn syrup, dextrose, maltodextrin, mustard seed, mustard flour, sulfur dioxide, sodium metabisulfite, potassium bisulfite, natural flavor sources, and similar terms
- unclear or ambiguous ingredients, including natural flavors, artificial flavors, spices, flavoring, lecithin, starches, shared facility wording, and vague product descriptions

Return only valid JSON with this exact shape:
{
  "risk": "High Risk" | "Ask More" | "Lower Risk",
  "concerns": ["short ingredient concern"],
  "image_quality": "clear" | "unclear" | "not_applicable",
  "menu_items": [{"name": "dish name", "risk": "High Risk" | "Ask More" | "Lower Risk", "reason": "short reason", "questions_to_ask": ["specific waiter question"], "safe_swap": "lower-risk swap from the same menu or ordering pattern"}],
  "shared_prep_warnings": ["shared fryer, wok, grill, prep station, sauce, or garnish concern"],
  "safer_alternatives": ["menu item or ordering pattern that appears lower risk, with caveat"],
  "staff_script": "short script the diner can say to restaurant staff",
  "confidence": "High" | "Medium-High" | "Medium" | "Low-Medium" | "Low",
  "uncertainty_level": "short description of what is known or unknown",
  "direct_allergens": ["direct allergen term and matching allergy"],
  "hidden_allergens": ["hidden allergen term and matching allergy"],
  "ambiguous_ingredients": ["unclear ingredient and why it needs confirmation"],
  "allergy_mapping": ["selected allergy: matching ingredient or no direct match"],
  "why_flagged": ["plain-language reason this result received its risk label"],
  "questions_to_ask": ["specific question the user should ask"],
  "explanation": "simple plain-language explanation that says whether the concern is direct or uncertain and why the product was flagged",
  "next_step": "simple practical next step, without claiming the product is completely safe"
}

Risk rules:
- Use "High Risk" if there is a direct allergen or a strong hidden allergen term for the selected allergy.
- Use "Ask More" if the issue is unclear, ambiguous, or depends on source/manufacturing details.
- Use "Lower Risk" only if no direct, hidden, or ambiguous concern appears. Never say safe, completely safe, or guaranteed safe.
- If severity is severe or anaphylactic, treat ambiguous source terms, staff uncertainty, and shared equipment as more serious. Prefer Ask More or High Risk when confirmation is missing.
- If severity is mild, still explain concerns, but do not minimize risk or claim safety.
- If an uploaded image is blurry, cropped, too dark, too small, or not readable enough to identify dish names, set image_quality to "unclear", set risk to "Ask More", and tell the user to reupload a clearer image. Do not guess dish names from an unreadable image.
- For restaurant menu images, include the most relevant risky or uncertain dishes in menu_items. Do not list every lower-risk dish unless it helps explain the overall result.
- For every High Risk or Ask More restaurant dish, include exactly 3 questions_to_ask for restaurant staff.
- For High Risk restaurant dishes, include a safe_swap suggesting a Green/Lower Risk dish or simpler ordering pattern if possible.
- For restaurant mode, always include shared_prep_warnings when fryer, wok, grill, sauce station, garnish, or staff uncertainty could matter.
- For restaurant mode, include safer_alternatives only as "appears lower risk" options, never as guaranteed safe.
- For restaurant mode, staff_script should be one concise paragraph the user can read to a waiter or manager.
- The confidence value should describe confidence in the text analysis, not confidence that the food is safe.
- confidence and uncertainty_level must never be blank. If uncertain, use "Medium" confidence and explain what still needs confirmation.
- Use the Local safety knowledge files as additional context. If hidden_allergens.txt identifies a dish name, preparation context, house sauce, shared fryer, shared wok, grill, marinade, garnish station, vague staff answer, or similar processing context as risky for a selected allergy, increase risk to Ask More or High Risk automatically.

JSON output rules:
- Return one minified JSON object only.
- Do not use markdown fences.
- Do not include comments or explanatory text outside JSON.
- Escape quotation marks inside strings.
- Every array item must be separated by a comma.`;
}

async function analyzeWithClaude(allergies, severity, ingredientText, mode, image) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("Missing ANTHROPIC_API_KEY");
  }

  const prompt = buildPrompt(allergies, severity, ingredientText, mode, Boolean(image));
  const content = image
    ? [
        {
          type: "image",
          source: {
            type: "base64",
            media_type: image.mediaType,
            data: image.base64,
          },
        },
        { type: "text", text: prompt },
      ]
    : prompt;

  const fallbackModels = image ? VISION_FALLBACK_MODELS : FALLBACK_MODELS;
  const models = [MODEL, ...fallbackModels.filter((model) => model !== MODEL)];
  let lastError = null;

  for (const model of models) {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model,
        max_tokens: 700,
        tools: [analysisTool],
        tool_choice: { type: "tool", name: "record_allergy_analysis" },
        messages: [{ role: "user", content }],
      }),
    });

    const payload = await response.json();

    if (!response.ok) {
      const message = payload?.error?.message || `Claude API returned ${response.status}`;
      lastError = new Error(message);
      if (/model/i.test(message)) continue;
      throw lastError;
    }

    const toolUse = payload.content?.find((block) => block.type === "tool_use" && block.name === "record_allergy_analysis");
    if (toolUse?.input) {
      return normalizeResult(toolUse.input);
    }

    const text = payload.content
      ?.filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n");

    if (!text) {
      throw new Error("Claude response was empty");
    }

    try {
      return normalizeResult(extractJson(text));
    } catch (error) {
      lastError = error;
      continue;
    }
  }

  throw lastError || new Error("No Claude model returned valid JSON");
}

async function handleAnalyze(req, res) {
  try {
    const rawBody = await readBody(req);
    const body = JSON.parse(rawBody || "{}");
    const allergies = Array.isArray(body.allergies) ? body.allergies.map(String) : [];
    const severity = ["mild", "moderate", "severe", "anaphylactic"].includes(body.severity)
      ? body.severity
      : "moderate";
    const ingredientText = String(body.ingredientText || "").trim();
    const mode = body.mode === "restaurant" ? "restaurant" : "packaged";
    const image = body.image && typeof body.image === "object" ? body.image : null;

    if (!allergies.length) {
      sendJson(res, 400, { error: "Select at least one allergy." });
      return;
    }

    if (!ingredientText && !image) {
      sendJson(res, 400, { error: "Ingredient text or menu image is required." });
      return;
    }

    if (image) {
      const allowedMediaTypes = new Set(["image/png", "image/jpeg", "image/webp"]);
      if (!allowedMediaTypes.has(image.mediaType) || typeof image.base64 !== "string") {
        sendJson(res, 400, { error: "Upload a PNG, JPEG, or WebP menu image." });
        return;
      }
    }

    const result = await analyzeWithClaude(allergies, severity, ingredientText, mode, image);
    sendJson(res, 200, result);
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Analysis failed" });
  }
}

function buildResponsePrompt(allergies, severity, dish, responseText) {
  return `You are Food Allergy Guard. Analyze a restaurant staff response for allergy safety certainty.

Allergies:
${allergies.map((allergy) => `- ${allergy}`).join("\n")}

Severity level: ${severity}

Selected dish:
${JSON.stringify(dish)}

What the waiter said:
"""${responseText}"""

Evaluate certainty, tone, and protocol quality. Treat words like probably, should be, I think, usually, maybe, not sure, and I guess as uncertainty. For severe or anaphylactic allergy, uncertain staff answers should usually be "Unsafe" unless a manager or chef confirmed a concrete protocol. Return one minified JSON object only:
{"certainty":"Confirmed"|"Uncertain"|"Unsafe","analysis":"plain-language explanation of why the response is or is not reliable","recommendation":"specific next step for the diner"}`;
}

async function analyzeWaiterResponseWithClaude(allergies, severity, dish, responseText) {
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("Missing ANTHROPIC_API_KEY");
  }

  const models = [MODEL, ...FALLBACK_MODELS.filter((model) => model !== MODEL)];
  let lastError = null;

  for (const model of models) {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": ANTHROPIC_VERSION,
      },
      body: JSON.stringify({
        model,
        max_tokens: 350,
        tools: [responseTool],
        tool_choice: { type: "tool", name: "record_waiter_response_analysis" },
        messages: [{ role: "user", content: buildResponsePrompt(allergies, severity, dish, responseText) }],
      }),
    });

    const payload = await response.json();
    if (!response.ok) {
      const message = payload?.error?.message || `Claude API returned ${response.status}`;
      lastError = new Error(message);
      if (/model/i.test(message)) continue;
      throw lastError;
    }

    const toolUse = payload.content?.find(
      (block) => block.type === "tool_use" && block.name === "record_waiter_response_analysis"
    );
    if (toolUse?.input) {
      return {
        certainty: String(toolUse.input.certainty || "Uncertain").slice(0, 40),
        analysis: String(toolUse.input.analysis || "").slice(0, 900),
        recommendation: String(toolUse.input.recommendation || "").slice(0, 700),
      };
    }

    const text = payload.content
      ?.filter((block) => block.type === "text")
      .map((block) => block.text)
      .join("\n");

    if (!text) throw new Error("Claude response was empty");

    try {
      const parsed = extractJson(text);
      return {
        certainty: String(parsed.certainty || "Uncertain").slice(0, 40),
        analysis: String(parsed.analysis || "").slice(0, 900),
        recommendation: String(parsed.recommendation || "").slice(0, 700),
      };
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError || new Error("No Claude model returned valid JSON");
}

async function handleAnalyzeResponse(req, res) {
  try {
    const rawBody = await readBody(req);
    const body = JSON.parse(rawBody || "{}");
    const allergies = Array.isArray(body.allergies) ? body.allergies.map(String) : [];
    const severity = ["mild", "moderate", "severe", "anaphylactic"].includes(body.severity)
      ? body.severity
      : "moderate";
    const dish = body.dish && typeof body.dish === "object" ? body.dish : {};
    const responseText = String(body.responseText || "").trim();

    if (!allergies.length || !responseText) {
      sendJson(res, 400, { error: "Allergy profile and waiter response are required." });
      return;
    }

    sendJson(res, 200, await analyzeWaiterResponseWithClaude(allergies, severity, dish, responseText));
  } catch (error) {
    sendJson(res, 500, { error: error.message || "Response analysis failed" });
  }
}

function serveStatic(req, res) {
  const requestPath = req.url === "/" ? "/index.html" : decodeURIComponent(req.url.split("?")[0]);
  const filePath = path.normalize(path.join(PUBLIC_DIR, requestPath));

  if (!filePath.startsWith(PUBLIC_DIR) || path.basename(filePath) === "server.js") {
    res.writeHead(404);
    res.end("Not found");
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      res.writeHead(404);
      res.end("Not found");
      return;
    }

    const contentType = mimeTypes[path.extname(filePath)] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": contentType });
    res.end(req.method === "HEAD" ? undefined : data);
  });
}

const server = http.createServer((req, res) => {
  if (req.method === "POST" && req.url === "/api/analyze") {
    handleAnalyze(req, res);
    return;
  }

  if (req.method === "POST" && req.url === "/api/analyze-response") {
    handleAnalyzeResponse(req, res);
    return;
  }

  if (req.method === "GET" || req.method === "HEAD") {
    serveStatic(req, res);
    return;
  }

  res.writeHead(405);
  res.end("Method not allowed");
});

server.listen(PORT, () => {
  console.log(`Food Allergy Guard running at http://127.0.0.1:${PORT}/`);
});
