import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "@carbon/styles/css/styles.css";
import "./styles.scss";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
