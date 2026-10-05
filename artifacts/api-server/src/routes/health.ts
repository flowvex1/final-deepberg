import { Router, type IRouter } from "express";
import { pool } from "@workspace/db";
import { AI_ENABLED } from "@workspace/integrations-openai-ai-server";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  res.json({
    status: "ok",
    services: {
      ai: AI_ENABLED ? "configured" : "disabled",
      economicCalendar: process.env.FINNHUB_API_KEY ? "configured" : "disabled",
    },
  });
});

router.get("/readyz", async (_req, res) => {
  try {
    await pool.query("select 1");
    res.json({ status: "ready" });
  } catch {
    res.status(503).json({ status: "unavailable", service: "database" });
  }
});

export default router;
