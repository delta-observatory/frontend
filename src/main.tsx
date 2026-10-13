import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { applyCssTokens } from "./theme";
import "./styles.css";

applyCssTokens(document.documentElement);
createRoot(document.getElementById("root")!).render(<StrictMode><App /></StrictMode>);
