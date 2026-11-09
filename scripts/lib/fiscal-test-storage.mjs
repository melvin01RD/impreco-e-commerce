import { createServer } from "node:http";
import { createHash } from "node:crypto";

/** In-memory S3 wire stub, bound to loopback, only for the isolated fiscal test launcher. */
export async function startFiscalTestStorage() {
  const files = new Map();
  const server = createServer(async (request, response) => {
    const url = new URL(request.url, "http://127.0.0.1");
    if (!url.pathname.startsWith("/qa-private/fiscal-evidence/")) { response.writeHead(403).end(); return; }
    if (!request.headers.authorization && !url.searchParams.has("X-Amz-Signature")) { response.writeHead(403).end(); return; }
    if (request.method === "PUT") {
      const chunks = [];
      let size = 0;
      for await (const chunk of request) {
        size += chunk.length;
        if (size > 5 * 1024 * 1024) { response.writeHead(413).end(); return; }
        chunks.push(chunk);
      }
      const bytes = Buffer.concat(chunks);
      files.set(url.pathname, bytes);
      response.writeHead(200, { ETag: '"' + createHash("md5").update(bytes).digest("hex") + '"' }).end();
      return;
    }
    const file = files.get(url.pathname);
    if (!file) { response.writeHead(404).end(); return; }
    response.writeHead(200, { "Content-Length": file.length, "Content-Type": "application/pdf", "Content-Disposition": "attachment" });
    response.end(request.method === "HEAD" ? undefined : file);
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const endpoint = `http://127.0.0.1:${server.address().port}`;
  let closing;
  return { endpoint, close: () => closing ??= new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }) };
}
