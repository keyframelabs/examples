import React from "react";
import ReactDOM from "react-dom/client";

import { App } from "./App";
import { InterviewStoreProvider } from "@/components/InterviewStoreProvider";
import "./index.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <InterviewStoreProvider>
      <App />
    </InterviewStoreProvider>
  </React.StrictMode>
);
