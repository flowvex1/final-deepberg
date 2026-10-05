import express, { type ErrorRequestHandler, type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import pinoHttp from "pino-http";
import path from "node:path";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();
app.set("trust proxy", 1);

const allowedOrigins = (process.env.APP_ORIGIN ?? "http://localhost:5174")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginResourcePolicy: { policy: "cross-origin" },
}));
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes(origin)) return callback(null, true);
    callback(new Error("Origin not allowed"));
  },
}));
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: true, limit: "100kb" }));

const apiLimiter = rateLimit({
  windowMs: 60_000,
  limit: process.env.NODE_ENV === "test" ? 10_000 : 600,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again shortly." },
});

const aiLimiter = rateLimit({
  windowMs: 60_000,
  limit: process.env.NODE_ENV === "test" ? 10_000 : 12,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "AI request limit reached. Please try again in a minute." },
});

app.use("/api", apiLimiter);
app.use("/api/ask-deepberg", aiLimiter);
app.use("/api/analysis", aiLimiter);
app.use("/api/options", (req, res, next) => {
  if (req.method === "POST") {
    aiLimiter(req, res, next);
    return;
  }
  next();
});
app.use("/api/recap", aiLimiter);
app.use("/api", router);

app.use("/api/{*path}", (_req, res) => {
  res.status(404).json({ error: "API route not found" });
});

const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  logger.error({ err }, "Unhandled request error");
  if (res.headersSent) return;
  res.status(500).json({ error: "Internal server error" });
};

app.use(errorHandler);

if (process.env.NODE_ENV === "production") {
  const frontendDir = path.resolve(
    __dirname,
    "../../stock-analyzer/dist/public",
  );
  app.use(express.static(frontendDir, { index: false }));
  app.get("/{*path}", (_req, res) => {
    res.sendFile(path.join(frontendDir, "index.html"));
  });
}

export default app;
