<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/c72337ba-d869-431b-9103-3776cddb45ac

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set `OPENAI_API_KEY` and `OPENAI_MODEL` in [.env.local](.env.local). Optionally set `OPENAI_BASE_URL` to use any OpenAI-compatible provider (Ollama, Groq, Together, OpenRouter, ...).
3. Run the app:
   `npm run dev`
