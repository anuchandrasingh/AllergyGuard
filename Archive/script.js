const form = document.querySelector("#allergyForm");
const checkButton = document.querySelector("#checkButton");
const ingredientText = document.querySelector("#ingredientText");
const formError = document.querySelector("#formError");
const riskLabel = document.querySelector("#riskLabel");
const concernList = document.querySelector("#concernList");
const confidenceText = document.querySelector("#confidenceText");
const uncertaintyText = document.querySelector("#uncertaintyText");
const directList = document.querySelector("#directList");
const hiddenList = document.querySelector("#hiddenList");
const ambiguousList = document.querySelector("#ambiguousList");
const questionList = document.querySelector("#questionList");
const mappingList = document.querySelector("#mappingList");
const whyList = document.querySelector("#whyList");
const ingredientLabel = document.querySelector("#ingredientLabel");
const menuImageBlock = document.querySelector("#menuImageBlock");
const menuImage = document.querySelector("#menuImage");
const imagePreview = document.querySelector("#imagePreview");
const dishRiskCard = document.querySelector("#dishRiskCard");
const dishRiskList = document.querySelector("#dishRiskList");
const dishBriefingCard = document.querySelector("#dishBriefingCard");
const selectedDishText = document.querySelector("#selectedDishText");
const dishQuestionList = document.querySelector("#dishQuestionList");
const safeSwapText = document.querySelector("#safeSwapText");
const restaurantInsights = document.querySelector("#restaurantInsights");
const sharedPrepList = document.querySelector("#sharedPrepList");
const alternativeList = document.querySelector("#alternativeList");
const staffScriptText = document.querySelector("#staffScriptText");
const copyScriptButton = document.querySelector("#copyScriptButton");
const explanationText = document.querySelector("#explanationText");
const nextStepText = document.querySelector("#nextStepText");
const responseAnalyzerCard = document.querySelector("#responseAnalyzerCard");
const waiterResponse = document.querySelector("#waiterResponse");
const analyzeResponseButton = document.querySelector("#analyzeResponseButton");
const responseCertaintyBadge = document.querySelector("#responseCertaintyBadge");
const responseAnalysisText = document.querySelector("#responseAnalysisText");
const sampleButtons = document.querySelectorAll("[data-sample]");
const analysisStatus = document.querySelector("#analysisStatus");

let latestMenuItems = [];
let selectedDish = null;

const samples = {
  chocolate:
    "Dark chocolate, sugar, cocoa butter, whey powder, soy lecithin, natural vanilla flavor. May contain peanuts and tree nuts.",
  padThai:
    "Tamarind concentrate, fish sauce, soybean oil, garlic, chili, natural flavors, peanut seasoning packet packed separately.",
  shrimp:
    "Shrimp, wheat flour, egg whites, cornstarch, spices, soybean oil. Cooked in a shared fryer with fish and shellfish items.",
};

const fallbackTerms = {
  peanut: ["peanut", "groundnut", "arachis", "satay", "mandelonas"],
  "tree nut": ["almond", "cashew", "walnut", "pecan", "hazelnut", "pistachio", "macadamia", "praline", "marzipan"],
  dairy: ["milk", "whey", "casein", "caseinate", "lactose", "butter", "cream", "cheese", "ghee"],
  egg: ["egg", "albumin", "ovalbumin", "mayonnaise", "mayo", "meringue", "lysozyme"],
  soy: ["soy", "soya", "soybean", "tofu", "miso", "edamame", "tamari", "soy lecithin"],
  shellfish: ["shrimp", "crab", "lobster", "prawn", "clam", "oyster", "scallop", "mollusk", "crustacean"],
  wheat: ["wheat", "flour", "semolina", "durum", "spelt", "farro", "malt", "bread crumbs", "gluten"],
  corn: ["corn", "cornstarch", "corn syrup", "dextrose", "maltodextrin", "maize", "masa", "polenta"],
  mustard: ["mustard", "mustard seed", "mustard flour", "dijon", "yellow mustard", "brown mustard"],
  sulfites: ["sulfite", "sulfites", "sulphite", "sulphites", "sulfur dioxide", "sodium metabisulfite", "potassium bisulfite"],
};

const ambiguousTerms = ["natural flavors", "artificial flavors", "spices", "lecithin", "starch", "modified food starch", "flavoring"];

function selectedAllergies() {
  return [...document.querySelectorAll("input[name='allergy']:checked")].map((input) => input.value);
}

function selectedSeverity() {
  return document.querySelector("input[name='severity']:checked").value;
}

function selectedMode() {
  return document.querySelector("input[name='inputMode']:checked").value;
}

function updateModeCopy() {
  const isRestaurant = selectedMode() === "restaurant";
  ingredientLabel.textContent = isRestaurant ? "Restaurant menu item or server notes" : "Ingredient list or product description";
  menuImageBlock.classList.toggle("hidden", !isRestaurant);
  ingredientText.placeholder = isRestaurant
    ? "Paste menu text, e.g. Pad Thai with house sauce, crispy tofu, optional peanuts. Server said the oil is probably fine..."
    : "Paste ingredients here, e.g. enriched wheat flour, whey, soy lecithin, natural flavors...";
  checkButton.textContent = isRestaurant ? "Check Menu" : "Check Food";
  analysisStatus.textContent = isRestaurant
    ? "Restaurant menu scan is ready. Upload a menu photo or paste menu text."
    : "Packaged food check is ready. Paste an ingredient list.";
}

function readImageFile(file) {
  return new Promise((resolve, reject) => {
    if (!file) {
      resolve(null);
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.addEventListener("load", () => {
      const maxDimension = 1600;
      const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));
      const width = Math.max(1, Math.round(image.width * scale));
      const height = Math.max(1, Math.round(image.height * scale));
      const canvas = document.createElement("canvas");
      const context = canvas.getContext("2d");

      canvas.width = width;
      canvas.height = height;
      context.drawImage(image, 0, 0, width, height);
      URL.revokeObjectURL(objectUrl);

      const dataUrl = canvas.toDataURL("image/jpeg", 0.82);
      const [, base64] = dataUrl.split(",");
      resolve({ mediaType: "image/jpeg", base64 });
    });

    image.addEventListener("error", () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Could not read menu image"));
    });

    image.src = objectUrl;
  });
}

function setLoading(isLoading) {
  checkButton.disabled = isLoading;
  if (isLoading) {
    checkButton.textContent = selectedMode() === "restaurant" ? "Scanning Menu..." : "Checking...";
    analysisStatus.textContent =
      selectedMode() === "restaurant"
        ? "Claude is simulating kitchen cross-contact scenarios... please wait."
        : "Claude is checking direct, hidden, and ambiguous allergen terms...";
    return;
  }

  checkButton.textContent = selectedMode() === "restaurant" ? "Check Menu" : "Check Food";
}

function setRisk(label) {
  const normalized = label.toLowerCase();
  riskLabel.className = "risk-label";
  if (normalized.includes("high")) riskLabel.classList.add("high");
  else if (normalized.includes("ask")) riskLabel.classList.add("ask");
  else if (normalized.includes("lower")) riskLabel.classList.add("lower");
  else riskLabel.classList.add("empty");
  riskLabel.textContent = label;
}

function riskClass(label) {
  const normalized = String(label || "").toLowerCase();
  if (normalized.includes("high")) return "high";
  if (normalized.includes("ask")) return "ask";
  if (normalized.includes("lower")) return "lower";
  return "ask";
}

function setCertaintyBadge(certainty) {
  const value = certainty || "No Check";
  const normalized = value.toLowerCase();
  responseCertaintyBadge.className = "certainty-badge";

  if (normalized.includes("confirm")) responseCertaintyBadge.classList.add("confirmed");
  else if (normalized.includes("safe")) responseCertaintyBadge.classList.add("safe");
  else if (normalized.includes("uncertain")) responseCertaintyBadge.classList.add("uncertain");
  else if (normalized.includes("unsafe")) responseCertaintyBadge.classList.add("unsafe");
  else responseCertaintyBadge.classList.add("empty");

  responseCertaintyBadge.textContent = value;
}

function renderConcerns(concerns) {
  const list = concerns?.length ? concerns : ["No item reported."];
  concernList.replaceChildren(
    ...list.map((concern) => {
      const item = document.createElement("li");
      item.textContent = concern;
      return item;
    })
  );
}

function renderList(element, items) {
  const list = items?.length ? items : ["None found in this analysis."];
  element.replaceChildren(
    ...list.map((text) => {
      const item = document.createElement("li");
      item.textContent = text;
      return item;
    })
  );
}

function renderDishRisks(dishes) {
  dishRiskCard.classList.toggle("hidden", !dishes?.length);
  responseAnalyzerCard.classList.toggle("hidden", !dishes?.length);
  latestMenuItems = dishes || [];
  selectedDish = null;
  dishBriefingCard.classList.toggle("hidden", !dishes?.length);
  selectedDishText.textContent = "Select a dish from the traffic light dashboard.";
  renderList(dishQuestionList, []);
  safeSwapText.textContent = "";
  setCertaintyBadge("No Check");
  responseAnalysisText.textContent = "Select a dish, ask the question, then paste the answer here.";
  if (!dishes?.length) return;

  dishRiskList.replaceChildren(
    ...dishes.map((dish, index) => {
      const item = document.createElement("li");
      const button = document.createElement("button");
      const name = dish.name || "Menu item";
      const risk = dish.risk || "Ask More";
      const reason = dish.reason || "Claude flagged this item for review.";
      button.type = "button";
      button.className = `dish-button ${riskClass(risk)}`;
      button.dataset.index = String(index);
      button.innerHTML = `<strong>${risk}: ${name}</strong><span>${reason}</span>`;
      button.addEventListener("click", () => selectDish(index));
      item.append(button);
      return item;
    })
  );
}

function selectDish(index) {
  selectedDish = latestMenuItems[index];
  if (!selectedDish) return;

  selectedDishText.textContent = `${selectedDish.name}: ${selectedDish.risk}. ${selectedDish.reason}`;
  renderList(dishQuestionList, selectedDish.questions_to_ask?.length ? selectedDish.questions_to_ask : [
    "Can you confirm all ingredients and preparation steps for this dish?",
    "Is this prepared on shared equipment with my allergen?",
    "Can a manager or chef verify this before I order?",
  ]);
  safeSwapText.textContent = selectedDish.safe_swap
    ? `Safe Swap: ${selectedDish.safe_swap}`
    : "Safe Swap: Ask for a simpler grilled or steamed item with sauce and garnish removed, then confirm prep controls.";
  responseAnalysisText.textContent = "Paste the waiter's answer below for a final certainty check.";
}

function renderRestaurantInsights(result) {
  const hasRestaurantData =
    result.shared_prep_warnings?.length || result.safer_alternatives?.length || result.staff_script;

  restaurantInsights.classList.toggle("hidden", !hasRestaurantData);
  if (!hasRestaurantData) return;

  renderList(sharedPrepList, result.shared_prep_warnings);
  renderList(alternativeList, result.safer_alternatives);
  staffScriptText.textContent =
    result.staff_script ||
    "I have a severe allergy. Could you please ask the kitchen to confirm ingredients and cross-contact controls?";
}

function renderResult(result) {
  if (result.image_quality === "unclear") {
    analysisStatus.textContent =
      "Claude had trouble reading the menu photo. Try reuploading a brighter, closer image with the full menu in frame.";
  } else {
    analysisStatus.textContent =
      selectedMode() === "restaurant"
        ? "Claude processed the menu. Select a dish to review questions, swaps, and next steps."
        : "Claude processed the ingredient text. Review the risk result and explanation.";
  }
  setRisk(result.risk || "Ask More");
  renderConcerns(result.concerns?.length ? result.concerns : ["No specific concerning ingredient was named, but confirm with the manufacturer if uncertain."]);
  renderDishRisks(result.menu_items);
  renderRestaurantInsights(result);
  confidenceText.textContent = result.confidence || "Not provided";
  uncertaintyText.textContent = result.uncertainty_level || "Not provided";
  renderList(directList, result.direct_allergens);
  renderList(hiddenList, result.hidden_allergens);
  renderList(ambiguousList, result.ambiguous_ingredients);
  renderList(questionList, result.questions_to_ask);
  renderList(mappingList, result.allergy_mapping);
  renderList(whyList, result.why_flagged);
  explanationText.textContent = result.explanation || "The analysis could not provide a detailed explanation.";
  nextStepText.textContent =
    result.next_step || "Do not treat this as a safety guarantee. Check the package label and contact the manufacturer if needed.";
}

function fallbackAnalyze(allergies, text) {
  const lowerText = text.toLowerCase();
  const directConcerns = [];
  const uncertainConcerns = [];
  const mapping = [];

  allergies.forEach((allergy) => {
    fallbackTerms[allergy].forEach((term) => {
      if (lowerText.includes(term)) {
        directConcerns.push(`${term} may indicate ${allergy}`);
        mapping.push(`${allergy}: matched "${term}"`);
      }
    });
  });

  ambiguousTerms.forEach((term) => {
    if (lowerText.includes(term)) uncertainConcerns.push(`${term} is unclear and may need manufacturer confirmation`);
  });

  const hasDirect = directConcerns.length > 0;
  const hasUncertain = uncertainConcerns.length > 0;
  const risk = hasDirect ? "High Risk" : hasUncertain ? "Ask More" : "Lower Risk";

  return {
    risk,
    concerns: [...directConcerns, ...uncertainConcerns],
    confidence: hasDirect ? "Medium-High" : hasUncertain ? "Medium" : "Low-Medium",
    uncertainty_level: hasUncertain ? "Elevated because the ingredient source is unclear" : "Lower, based only on visible text",
    direct_allergens: directConcerns,
    hidden_allergens: directConcerns.filter((concern) => /whey|casein|albumin|lecithin|malt|semolina|ghee|mayo|mayonnaise/i.test(concern)),
    ambiguous_ingredients: uncertainConcerns,
    allergy_mapping: mapping.length ? mapping : allergies.map((allergy) => `${allergy}: no direct match found in local fallback`),
    why_flagged: hasDirect
      ? ["A selected allergy matched one or more ingredient terms.", "The result is high risk because direct or hidden allergen language appeared."]
      : hasUncertain
        ? ["The ingredient list contains vague terms that can hide source ingredients.", "The result is Ask More because source details need confirmation."]
        : ["No direct, hidden, or ambiguous term was found by local fallback.", "The result is Lower Risk, not a safety guarantee."],
    questions_to_ask: hasUncertain
      ? ["Can the manufacturer confirm the source of the ambiguous ingredients for my selected allergy?"]
      : ["Can the manufacturer confirm this product is appropriate for my selected allergy profile?"],
    shared_prep_warnings: [],
    safer_alternatives: [],
    staff_script: "",
    explanation: hasDirect
      ? "One or more ingredient terms directly match the selected allergy profile. Avoid relying on this product unless a qualified source confirms it is appropriate for your allergy."
      : hasUncertain
        ? "No direct allergen match was found, but the ingredient list contains broad terms that can hide source ingredients. Ask the manufacturer for details before eating."
        : "No direct or common hidden allergen term was found for the selected profile. This is lower risk, not a guarantee that the product is safe.",
    next_step: hasDirect
      ? "Do not eat this unless your clinician or the manufacturer confirms it is safe for your allergy."
      : "Check the full label every time and contact the manufacturer if the wording is unclear.",
  };
}

async function analyzeFood(allergies, severity, text, mode, image) {
  const response = await fetch("/api/analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ allergies, severity, ingredientText: text, mode, image }),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || "Analysis failed");
  }

  return payload;
}

async function analyzeWaiterResponse(allergies, severity, dish, responseText) {
  const response = await fetch("/api/analyze-response", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ allergies, severity, dish, responseText }),
  });

  const payload = await response.json();
  if (!response.ok) {
    throw new Error(payload.error || "Response analysis failed");
  }

  return payload;
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  formError.textContent = "";

  const allergies = selectedAllergies();
  const severity = selectedSeverity();
  const mode = selectedMode();
  const text = ingredientText.value.trim();
  const image = await readImageFile(menuImage.files[0]);

  if (!allergies.length) {
    formError.textContent = "Select at least one allergy.";
    return;
  }

  if (!text && !image) {
    formError.textContent =
      mode === "restaurant" ? "Paste menu text or upload a menu photo." : "Paste an ingredient list or product description.";
    return;
  }

  setLoading(true);

  try {
    const result = await analyzeFood(allergies, severity, text, mode, image);
    renderResult(result);
  } catch (error) {
    const result = fallbackAnalyze(allergies, text);
    renderResult(result);
    formError.textContent = `Claude API unavailable: ${error.message}. Showing local fallback analysis.`;
  } finally {
    setLoading(false);
  }
});

document.querySelectorAll("input[name='inputMode']").forEach((input) => {
  input.addEventListener("change", updateModeCopy);
});

menuImage.addEventListener("change", () => {
  const file = menuImage.files[0];
  if (!file) {
    imagePreview.replaceChildren(Object.assign(document.createElement("span"), { textContent: "No menu photo selected." }));
    analysisStatus.textContent = "Restaurant menu scan is ready. Upload a menu photo or paste menu text.";
    return;
  }

  const image = document.createElement("img");
  image.alt = "Selected menu preview";
  image.src = URL.createObjectURL(file);
  imagePreview.replaceChildren(image);
  analysisStatus.textContent = "Menu photo uploaded. Click Check Menu so Claude can read and analyze it.";
});

sampleButtons.forEach((button) => {
  button.addEventListener("click", () => {
    ingredientText.value = samples[button.dataset.sample];
    formError.textContent = "";
    ingredientText.focus();
  });
});

copyScriptButton.addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(staffScriptText.textContent);
    copyScriptButton.textContent = "Copied";
    setTimeout(() => {
      copyScriptButton.textContent = "Copy";
    }, 1200);
  } catch {
    formError.textContent = "Could not copy script. You can still select the text manually.";
  }
});

analyzeResponseButton.addEventListener("click", async () => {
  formError.textContent = "";
  if (!selectedDish) {
    formError.textContent = "Select a dish from the dashboard first.";
    return;
  }

  const allergies = selectedAllergies();
  const severity = selectedSeverity();
  const responseText = waiterResponse.value.trim();
  if (!responseText) {
    formError.textContent = "Paste what the waiter said.";
    return;
  }

  analyzeResponseButton.disabled = true;
  analyzeResponseButton.textContent = "Analyzing...";
  try {
    const result = await analyzeWaiterResponse(allergies, severity, selectedDish, responseText);
    setCertaintyBadge(result.certainty || "Uncertain");
    responseAnalysisText.textContent = `${result.analysis || "No analysis returned."} ${result.recommendation || ""}`;
  } catch (error) {
    setCertaintyBadge("No Check");
    responseAnalysisText.textContent = `Could not run Claude response analysis: ${error.message}`;
  } finally {
    analyzeResponseButton.disabled = false;
    analyzeResponseButton.textContent = "Analyze Response";
  }
});

updateModeCopy();
