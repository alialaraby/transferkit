import { createServer } from "node:http";

const parcels = new Map([["parcel-1", "pending"]]);

const server = createServer((request, response) => {
  if (request.url === "/health") {
    response.writeHead(200, { "content-type": "text/plain" });
    response.end("ok");
    return;
  }
  if (request.url?.startsWith("/parcels/")) {
    const id = request.url.slice("/parcels/".length);
    const status = parcels.get(id);
    response.writeHead(status ? 200 : 404, { "content-type": "text/plain" });
    response.end(status ?? "missing");
    return;
  }
  response.writeHead(404);
  response.end("unknown route");
});

server.listen(Number(process.env.PORT ?? 3000));
