import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { registerSW } from "virtual:pwa-register";
import { App } from "./App";
import "./styles.css";

// Register the service worker (offline-capable PWA — R-015/R-025). A no-op in
// dev (devOptions disabled); on the built site it precaches the app and
// auto-updates when a new build is deployed. Nothing is sent anywhere.
registerSW({ immediate: true });

const rootElement = document.getElementById("root");
if (!rootElement) throw new Error("Missing #root element");

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
