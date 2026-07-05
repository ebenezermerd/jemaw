import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import {
  MutationCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { MotionConfig } from "framer-motion";
import { App } from "./App.js";
import { ToastProvider, notifyToast } from "./ui/Toast.js";
import { applyTheme } from "./lib/theme.js";
import { goFullscreen } from "./telegram.js";
import "./styles/tokens.css";

applyTheme();
goFullscreen();

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } },
  // Every failed mutation surfaces as a top toast, so errors are never silent
  // even on screens without their own inline error handling.
  mutationCache: new MutationCache({
    onError: (err) => {
      notifyToast(
        err instanceof Error ? err.message : "Something went wrong.",
        "error",
      );
    },
  }),
});

const root = document.getElementById("root");
if (!root) throw new Error("#root not found");

createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      {/* reducedMotion="user" → Framer respects the OS setting globally (§12.8 #5). */}
      <MotionConfig reducedMotion="user">
        <ToastProvider>
          <App />
        </ToastProvider>
      </MotionConfig>
    </QueryClientProvider>
  </StrictMode>,
);
