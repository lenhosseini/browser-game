import { spawn, spawnSync } from "node:child_process";

const ADDRESS = "127.0.0.1:3000";

const server = spawn("spacetime", ["start", "--listen-addr", ADDRESS], { stdio: "inherit" });
server.on("exit", (code) => process.exit(code ?? 0));
for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => server.kill(signal));
}

async function waitForServer() {
  for (;;) {
    try {
      if ((await fetch(`http://${ADDRESS}/v1/ping`)).ok) return;
    } catch {
      // Not listening yet.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

await waitForServer();
for (const task of ["stdb:publish", "stdb:generate"]) {
  const { status } = spawnSync("vp", ["run", task], { stdio: "inherit" });
  if (status !== 0) {
    server.kill("SIGTERM");
    process.exit(status ?? 1);
  }
}
console.log(`Module published. SpacetimeDB is running on ${ADDRESS}.`);
