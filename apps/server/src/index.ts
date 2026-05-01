import { app } from "./app.ts";

const port = Number(process.env.PORT ?? 3000);
app.listen(port);
console.log(`server listening on http://localhost:${port}`);

export type { App } from "./app.ts";
