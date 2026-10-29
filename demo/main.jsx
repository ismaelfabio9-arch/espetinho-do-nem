import React from "react";
import ReactDOM from "react-dom/client";
import "../src/index.css";
import App from "../src/App";
import { demoHasData } from "./fakeFirestore";
import { seedDemo } from "./seed";
import { DemoBanner } from "./DemoBanner";

if (!demoHasData()) seedDemo();

ReactDOM.createRoot(document.getElementById("root")).render(
  <>
    <DemoBanner />
    <App />
  </>
);
