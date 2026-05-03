import { app } from "./app.ts";

const port = Number(process.env.PORT ?? 3000);
const hostname = process.env.HOST ?? "0.0.0.0";
app.listen({ port, hostname });
console.log(`server listening on http://${hostname}:${port}`);

export type { App } from "./app.ts";
