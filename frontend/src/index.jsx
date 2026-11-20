// Debe ir primero: regula el reloj de animación (ahorro de energía con la app sin usar)
import "@/lib/rafGovernor";
import React from "react";
import ReactDOM from "react-dom/client";
import "@/index.css";
import App from "@/App";

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
