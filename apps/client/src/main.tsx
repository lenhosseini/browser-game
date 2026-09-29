import { DbConnection } from "@game/bindings";
import { DATABASE_NAME, LOCAL_HOST } from "@game/shared";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { SpacetimeDBProvider } from "spacetimedb/react";

import App from "./App.tsx";

const host = import.meta.env.VITE_SPACETIMEDB_HOST ?? LOCAL_HOST;
const tokenKey = `${host}/${DATABASE_NAME}/auth_token`;

const connectionBuilder = DbConnection.builder()
  .withUri(host)
  .withDatabaseName(DATABASE_NAME)
  .withToken(localStorage.getItem(tokenKey) || undefined)
  .onConnect((_connection, _identity, token) => {
    localStorage.setItem(tokenKey, token);
  });

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <SpacetimeDBProvider connectionBuilder={connectionBuilder}>
      <App />
    </SpacetimeDBProvider>
  </StrictMode>,
);
