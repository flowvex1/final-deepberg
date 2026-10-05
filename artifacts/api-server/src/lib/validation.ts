import type { Request, Response, NextFunction } from "express";

const SYMBOL_PATTERN = /^[A-Z0-9^.-]{1,15}$/;

export function validateSymbolParam(req: Request, res: Response, next: NextFunction) {
  const raw = req.params.symbol;
  const symbol = String(raw ?? "").trim().toUpperCase();
  if (!SYMBOL_PATTERN.test(symbol)) {
    res.status(400).json({ error: "Invalid ticker symbol" });
    return;
  }
  req.params.symbol = symbol;
  next();
}

export function boundedText(value: unknown, maxLength: number): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  if (!text || text.length > maxLength) return null;
  return text;
}
