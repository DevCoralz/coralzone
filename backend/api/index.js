// Vercel's Node runtime auto-detects any file under /api as a serverless
// function and calls its default export as the request handler. Express
// apps implement (req, res) the same way Node's http.Server does, so the
// app itself is a valid handler — no listen(), no extra adapter needed.
// vercel.json rewrites every path to this one function so Express's own
// router (app.get/app.post above) still decides what handles what.
import app from "../src/app.js";

export default app;
