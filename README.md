# Allergy Guard

**Your Personalized Food Safety Assistant**

Allergy Guard helps people with food allergies make safer restaurant decisions. Users select their allergies and severity level, upload a restaurant menu photo or paste menu text, and Claude produces a safety briefing with risky dishes, hidden allergen concerns, safer swaps, and questions to ask restaurant staff.

## Why It Matters

Restaurant menus are not fixed ingredient labels. They include vague phrases like "house sauce," "chef special," "crispy," "aioli," and "shared fryer." Allergy Guard uses Claude to reason through these ambiguous contexts and help users ask better questions before ordering.

The goal is not to guarantee safety. The goal is to reduce uncertainty in a high-pressure moment.

## Core Features

- Allergy profile selection
- Severity levels: mild, moderate, severe, anaphylactic
- Restaurant menu photo upload
- Restaurant menu text paste
- Packaged food ingredient analysis
- Claude vision menu reading
- Hidden allergen detection
- Shared fryer, wok, grill, sauce, and garnish risk reasoning
- Select-your-dish traffic-light dashboard
- Safe Swaps for risky dishes
- Customer Query generation
- Waiter response analyzer
- Local safety knowledge files in `safety_logs/`

## Claude Reasoning

Claude checks for:

- Direct allergens
- Hidden allergen terms
- Ambiguous ingredients
- Cross-contact risks
- Shared equipment risks
- Staff uncertainty, such as "probably," "not sure," or "I think"
- Severity-aware risk escalation

For restaurant mode, Claude also identifies dish-level risks and generates three specific questions to ask staff.

## Safety Knowledge Files

The backend reads local safety reference files from:

```text
safety_logs/
```

Current files:

```text
safety_logs/hidden_allergens.txt
safety_logs/chicago_health_codes.md
```

These files act as a lightweight local "safety brain." Claude receives their contents as additional context during analysis. If a dish or staff response mentions processing contexts like shared fryers, house sauces, marinades, or vague staff answers, Claude can escalate the risk to `Ask More` or `High Risk`.

## Tech Stack

- HTML
- CSS
- JavaScript
- Node.js backend
- Anthropic Claude API
- Claude vision for menu image analysis
- Local file-based safety references

## Setup

Create a local environment file:

```bash
cp .env.example .env
```

Add your Anthropic API key:

```bash
ANTHROPIC_API_KEY="your_anthropic_key_here"
```

Start the app:

```bash
./start.sh
```

Open:

```text
http://127.0.0.1:4173/
```

## Deploy On Render

1. Push this project to GitHub.

2. In Render, create a new **Web Service**.

3. Connect your GitHub repository.

4. Use these settings:

```text
Runtime: Node
Build Command: npm install
Start Command: npm start
```

5. Add this environment variable in Render:

```text
ANTHROPIC_API_KEY=your_anthropic_key_here
```

Optional environment variables:

```text
CLAUDE_MODEL=claude-sonnet-4-20250514
PORT=10000
```

Render automatically provides `PORT`, so you usually do not need to set it yourself.

6. Deploy.

After deploy, open the Render URL. Do not commit `.env`; Render stores the API key securely in its environment settings.

## Demo Flow

1. Select one or more allergies.
2. Choose severity level.
3. Keep `Restaurant menu` selected.
4. Upload a menu photo or paste menu text.
5. Click `Check Menu`.
6. Wait while Claude simulates kitchen cross-contact scenarios.
7. Review the risk result.
8. Select a dish from the dashboard.
9. Review waiter questions, safer swaps, and the customer query.
10. Paste what the waiter said into the response analyzer.
11. Let Claude judge whether the answer is confirmed, uncertain, or unsafe.

## Sample Menu Text

```text
Chef special noodles with house sauce.
Crispy tofu from shared fryer.
Chicken satay with dipping sauce.
Server says the sauce is probably fine.
```

For an anaphylactic peanut allergy, Allergy Guard should flag this as high risk or ask-more because of house sauce, shared fryer, satay, and uncertain staff language.

## Image Quality Handling

If the uploaded menu image is blurry, cropped, too dark, or unreadable, Allergy Guard asks the user to reupload a clearer photo instead of guessing dish names.

Friendly guidance is shown before upload:

```text
Use a bright, steady photo where dish names and descriptions are readable.
```

## Safety Disclaimer

Food Allergy Guard is an AI-assisted guidance tool, not a medical device. Always carry your epinephrine and confirm with restaurant management. AI can misinterpret menu data.

Allergy Guard does not guarantee that any food is safe.
