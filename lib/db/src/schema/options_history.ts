import { pgTable, serial, text, real, integer, date, timestamp, uniqueIndex } from "drizzle-orm/pg-core";

export const optionsHistory = pgTable(
  "options_history",
  {
    id: serial("id").primaryKey(),
    symbol: text("symbol").notNull(),
    date: date("date").notNull(),
    putCallRatio: real("put_call_ratio").notNull(),
    totalCallVolume: integer("total_call_volume").notNull(),
    totalPutVolume: integer("total_put_volume").notNull(),
    callPremium: real("call_premium").notNull(),
    putPremium: real("put_premium").notNull(),
    unusualCount: integer("unusual_count").notNull(),
    currentPrice: real("current_price").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [uniqueIndex("options_history_symbol_date_idx").on(t.symbol, t.date)]
);

export type OptionsHistoryRow = typeof optionsHistory.$inferSelect;
export type InsertOptionsHistory = typeof optionsHistory.$inferInsert;
