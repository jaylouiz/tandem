// Entry of the static demo (`npm run build:demo`): the backend first, so the app's first request already finds it.
import "./backend.ts";
import "../web/main.tsx";
