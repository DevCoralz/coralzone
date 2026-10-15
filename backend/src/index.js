// Local/persistent-host entry point (Render, Railway, Fly, a VPS, bun run
// dev). Not used on Vercel — Vercel calls api/index.js directly and never
// executes this file, so app.listen() never runs there.
import app from "./app.js";

const PORT = process.env.PORT || 4000;

app.listen(PORT, () => {
  console.log(`CoralZone backend listening on port ${PORT}`);
});
