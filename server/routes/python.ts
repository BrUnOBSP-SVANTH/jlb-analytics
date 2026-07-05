import { Router } from "express";
import type { Request, Response } from "express";

const PYTHON_API_URL = process.env.PYTHON_API_URL ?? "http://localhost:8000";

function getUserLevel(req: Request): number {
  const raw = req.headers["x-user-level"];
  const level = parseInt(Array.isArray(raw) ? raw[0] : raw ?? "1", 10);
  return isNaN(level) || level < 1 || level > 5 ? 1 : level;
}

async function proxyToPython(req: Request, res: Response, targetPath: string, userLevel: number): Promise<void> {
  try {
    const url = `${PYTHON_API_URL}${targetPath}`;
    const response = await fetch(url, {
      method: req.method,
      headers: { "Content-Type": "application/json", "X-User-Level": String(userLevel) },
      body: req.method !== "GET" ? JSON.stringify(req.body) : undefined,
      signal: AbortSignal.timeout(15_000),
    });
    const data = await response.json();
    if (!response.ok) { res.status(response.status).json(data); return; }
    res.json(data);
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown error";
    if (msg.includes("ECONNREFUSED") || msg.includes("fetch failed")) {
      res.status(503).json({ error: "python_unavailable", message: "Serviço de modelos indisponível. Inicie o FastAPI: cd python && python pipeline.py" });
    } else {
      console.error("[Python proxy] error:", msg);
      res.status(500).json({ error: "proxy_error", message: msg });
    }
  }
}

const router = Router();

router.all("/level:n(\\d)/*", async (req, res) => {
  await proxyToPython(req, res, req.path, getUserLevel(req));
});

router.get("/models/health", async (req, res) => {
  await proxyToPython(req, res, "/health", 1);
});

export default router;
