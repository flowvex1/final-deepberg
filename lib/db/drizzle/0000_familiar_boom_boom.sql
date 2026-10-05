CREATE TABLE "options_history" (
	"id" serial PRIMARY KEY NOT NULL,
	"symbol" text NOT NULL,
	"date" date NOT NULL,
	"put_call_ratio" real NOT NULL,
	"total_call_volume" integer NOT NULL,
	"total_put_volume" integer NOT NULL,
	"call_premium" real NOT NULL,
	"put_premium" real NOT NULL,
	"unusual_count" integer NOT NULL,
	"current_price" real NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX "options_history_symbol_date_idx" ON "options_history" USING btree ("symbol","date");