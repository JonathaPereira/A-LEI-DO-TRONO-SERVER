import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { fileURLToPath } from "node:url";
const root = fileURLToPath(new URL(".", import.meta.url));
const mime = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".json": "application/json; charset=utf-8",
  ".ttf": "font/ttf",
  ".woff2": "font/woff2",
};
const port = Number(process.env.PORT || 5173);
const server = createServer(async (req, res) => {
  try {
    if (!["GET", "HEAD"].includes(req.method)) {
      res.writeHead(405);
      return res.end();
    }
    const pathname = decodeURIComponent(
      new URL(req.url, "http://localhost").pathname,
    );
    const file = resolve(
      root,
      "." + (pathname === "/" ? "/index.html" : pathname),
    );
    const relative = file.slice(root.length);
    if (
      !file.startsWith(root) ||
      relative
        .split(sep)
        .some(
          (p) =>
            p.startsWith(".") ||
            ["node_modules", "tests", "artifacts"].includes(p),
        ) ||
      !mime[extname(file)]
    ) {
      res.writeHead(404);
      return res.end("Não encontrado");
    }
    if (!(await stat(file)).isFile()) throw Error("Not a file");
    const bytes = await readFile(file);
    res.writeHead(200, {
      "Content-Type": mime[extname(file)],
      "Cache-Control": "no-cache",
      "X-Content-Type-Options": "nosniff",
      "Content-Length": bytes.length,
    });
    res.end(req.method === "HEAD" ? undefined : bytes);
  } catch {
    res.writeHead(404);
    res.end("Não encontrado");
  }
});
server.listen(port, "0.0.0.0", () =>
  console.log(`NEXUS · servidor de desenvolvimento na porta ${port}`),
);
for (const s of ["SIGINT", "SIGTERM"]) process.on(s, () => server.close());
