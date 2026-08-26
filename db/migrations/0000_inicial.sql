CREATE EXTENSION IF NOT EXISTS pg_trgm;--> statement-breakpoint
CREATE TYPE "public"."ai_provider" AS ENUM('none', 'anthropic', 'openai', 'openai_compatible');--> statement-breakpoint
CREATE TYPE "public"."base_unit" AS ENUM('g', 'ml', 'ud');--> statement-breakpoint
CREATE TYPE "public"."webauthn_challenge_kind" AS ENUM('register', 'login');--> statement-breakpoint
CREATE TYPE "public"."difficulty" AS ENUM('easy', 'medium', 'hard');--> statement-breakpoint
CREATE TYPE "public"."food_source" AS ENUM('off', 'usda', 'manual', 'ai');--> statement-breakpoint
CREATE TYPE "public"."household_role" AS ENUM('owner', 'member');--> statement-breakpoint
CREATE TYPE "public"."mcp_profile" AS ENUM('basic', 'full');--> statement-breakpoint
CREATE TYPE "public"."meal_slot" AS ENUM('breakfast', 'lunch', 'dinner', 'snack');--> statement-breakpoint
CREATE TYPE "public"."pantry_location" AS ENUM('fridge', 'freezer', 'pantry');--> statement-breakpoint
CREATE TYPE "public"."proposal_source" AS ENUM('ai', 'rules', 'mcp');--> statement-breakpoint
CREATE TYPE "public"."proposal_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."theme" AS ENUM('system', 'light', 'dark');--> statement-breakpoint
CREATE TYPE "public"."unit_system" AS ENUM('metric', 'imperial');--> statement-breakpoint
CREATE TABLE "foods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid,
	"name_es" text NOT NULL,
	"name_en" text NOT NULL,
	"search_name_es" text NOT NULL,
	"search_name_en" text NOT NULL,
	"aliases" text[] DEFAULT '{}'::text[] NOT NULL,
	"default_unit" "base_unit" DEFAULT 'g' NOT NULL,
	"kcal_100g" numeric(12, 3),
	"protein_100g" numeric(12, 3),
	"carbs_100g" numeric(12, 3),
	"fat_100g" numeric(12, 3),
	"fiber_100g" numeric(12, 3),
	"source" "food_source" DEFAULT 'manual' NOT NULL,
	"source_ref" text,
	"barcode" text,
	"allergens" text[] DEFAULT '{}'::text[] NOT NULL,
	"grams_per_cup" numeric(12, 3),
	"grams_per_tbsp" numeric(12, 3),
	"grams_per_unit" numeric(12, 3),
	"density_g_per_ml" numeric(12, 3),
	"seasonal_months" integer[] DEFAULT '{}'::int[] NOT NULL,
	"is_estimated" boolean DEFAULT false NOT NULL,
	"merged_into_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"parent_id" uuid
);
--> statement-breakpoint
CREATE TABLE "unit_aliases" (
	"alias" text NOT NULL,
	"locale" text NOT NULL,
	"unit" "base_unit" NOT NULL,
	"factor_to_base" numeric(12, 3) NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "household_invites" (
	"token" text PRIMARY KEY NOT NULL,
	"household_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "household_members" (
	"household_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" "household_role" DEFAULT 'member' NOT NULL,
	"dietary_flags" text[] DEFAULT '{}'::text[] NOT NULL,
	"allergens" text[] DEFAULT '{}'::text[] NOT NULL,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "household_members_household_id_user_id_pk" PRIMARY KEY("household_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "households" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"default_servings" integer DEFAULT 2 NOT NULL,
	"expiry_alert_days" integer DEFAULT 3 NOT NULL,
	"ai_provider" "ai_provider" DEFAULT 'none' NOT NULL,
	"ai_model" text,
	"ai_base_url" text,
	"ai_api_key_enc" "bytea",
	"ai_monthly_cap_cents" integer DEFAULT 0 NOT NULL,
	"ai_structured_output" boolean DEFAULT true NOT NULL,
	"shoplist_list_token" text,
	"shoplist_fn_url" text,
	"shoplist_secret_enc" "bytea",
	"shoplist_last_pushed_at" timestamp with time zone,
	"plan_rules" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"household_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_agent" text
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text,
	"display_name" text NOT NULL,
	"avatar_url" text,
	"locale" text DEFAULT 'es' NOT NULL,
	"units" "unit_system" DEFAULT 'metric' NOT NULL,
	"theme" "theme" DEFAULT 'system' NOT NULL,
	"accent" text DEFAULT 'huerta' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "webauthn_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"challenge" text NOT NULL,
	"user_id" uuid,
	"kind" "webauthn_challenge_kind" NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "webauthn_credentials" (
	"credential_id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"public_key" "bytea" NOT NULL,
	"counter" integer DEFAULT 0 NOT NULL,
	"transports" text[] DEFAULT '{}'::text[] NOT NULL,
	"device_type" text NOT NULL,
	"backed_up" boolean DEFAULT false NOT NULL,
	"name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "cooking_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"recipe_id" uuid NOT NULL,
	"entry_id" uuid,
	"servings_cooked" integer NOT NULL,
	"cooked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"kcal_per_serving_snapshot" numeric(12, 3),
	"pantry_deductions" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"warnings" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "meal_plan_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"date" date NOT NULL,
	"slot" "meal_slot" NOT NULL,
	"recipe_id" uuid,
	"custom_title" text,
	"servings" integer NOT NULL,
	"leftover_of_entry_id" uuid,
	"time_budget_minutes" integer,
	"cooked_at" timestamp with time zone,
	"skipped_at" timestamp with time zone,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meal_plan_entries_title_or_recipe" CHECK (recipe_id IS NOT NULL OR custom_title IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "pantry_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"food_id" uuid NOT NULL,
	"quantity" numeric(12, 3) NOT NULL,
	"unit" "base_unit" NOT NULL,
	"location" "pantry_location" DEFAULT 'pantry' NOT NULL,
	"expires_at" date,
	"opened_at" timestamp with time zone,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "pantry_items_quantity_nonnegative" CHECK (quantity >= 0)
);
--> statement-breakpoint
CREATE TABLE "plan_proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"created_by_user_id" uuid,
	"created_by_token_id" uuid,
	"source" "proposal_source" NOT NULL,
	"payload" jsonb NOT NULL,
	"status" "proposal_status" DEFAULT 'pending' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone,
	"resolved_by_user_id" uuid,
	CONSTRAINT "plan_proposals_one_creator" CHECK ((created_by_user_id IS NOT NULL) <> (created_by_token_id IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "collections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"name" text NOT NULL,
	"query" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recipe_ingredients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipe_id" uuid NOT NULL,
	"food_id" uuid,
	"raw_text" text NOT NULL,
	"quantity" numeric(12, 3),
	"unit" "base_unit",
	"display_quantity" numeric(12, 3),
	"display_unit" text,
	"preparation" text,
	"group_label" text,
	"step_index" integer,
	"scales_linearly" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "recipe_steps" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"recipe_id" uuid NOT NULL,
	"index" integer NOT NULL,
	"text" text NOT NULL,
	"timer_seconds" integer,
	"image_url" text
);
--> statement-breakpoint
CREATE TABLE "recipe_tags" (
	"recipe_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	CONSTRAINT "recipe_tags_recipe_id_tag_id_pk" PRIMARY KEY("recipe_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "recipes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"servings_base" integer DEFAULT 2 NOT NULL,
	"prep_minutes" integer,
	"cook_minutes" integer,
	"difficulty" "difficulty",
	"source_url" text,
	"image_urls" text[] DEFAULT '{}'::text[] NOT NULL,
	"notes" text,
	"yield_grams" numeric(12, 3),
	"kcal_per_serving" numeric(12, 3),
	"protein_per_serving" numeric(12, 3),
	"carbs_per_serving" numeric(12, 3),
	"fat_per_serving" numeric(12, 3),
	"fiber_per_serving" numeric(12, 3),
	"kcal_100g" numeric(12, 3),
	"nutrition_is_estimated" boolean DEFAULT false NOT NULL,
	"times_cooked" integer DEFAULT 0 NOT NULL,
	"last_cooked_at" timestamp with time zone,
	"search_vector" "tsvector" GENERATED ALWAYS AS (to_tsvector('spanish', coalesce(title, '') || ' ' || coalesce(description, '')) || to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, ''))) STORED,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_usage_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"operation" text NOT NULL,
	"tokens_in" integer DEFAULT 0 NOT NULL,
	"tokens_out" integer DEFAULT 0 NOT NULL,
	"cost_cents" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "api_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"household_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"name" text NOT NULL,
	"token_hash" text NOT NULL,
	"scopes" text[] DEFAULT '{}'::text[] NOT NULL,
	"mcp_profile" "mcp_profile" DEFAULT 'basic' NOT NULL,
	"last_used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"revoked_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"endpoint" text NOT NULL,
	"keys" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "push_subscriptions_endpoint_unique" UNIQUE("endpoint")
);
--> statement-breakpoint
ALTER TABLE "foods" ADD CONSTRAINT "foods_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_invites" ADD CONSTRAINT "household_invites_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_invites" ADD CONSTRAINT "household_invites_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_members" ADD CONSTRAINT "household_members_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "household_members" ADD CONSTRAINT "household_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webauthn_challenges" ADD CONSTRAINT "webauthn_challenges_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "webauthn_credentials" ADD CONSTRAINT "webauthn_credentials_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cooking_log" ADD CONSTRAINT "cooking_log_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cooking_log" ADD CONSTRAINT "cooking_log_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cooking_log" ADD CONSTRAINT "cooking_log_entry_id_meal_plan_entries_id_fk" FOREIGN KEY ("entry_id") REFERENCES "public"."meal_plan_entries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_plan_entries" ADD CONSTRAINT "meal_plan_entries_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "meal_plan_entries" ADD CONSTRAINT "meal_plan_entries_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pantry_items" ADD CONSTRAINT "pantry_items_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pantry_items" ADD CONSTRAINT "pantry_items_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_proposals" ADD CONSTRAINT "plan_proposals_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_proposals" ADD CONSTRAINT "plan_proposals_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_proposals" ADD CONSTRAINT "plan_proposals_resolved_by_user_id_users_id_fk" FOREIGN KEY ("resolved_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collections" ADD CONSTRAINT "collections_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_ingredients" ADD CONSTRAINT "recipe_ingredients_food_id_foods_id_fk" FOREIGN KEY ("food_id") REFERENCES "public"."foods"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_steps" ADD CONSTRAINT "recipe_steps_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_tags" ADD CONSTRAINT "recipe_tags_recipe_id_recipes_id_fk" FOREIGN KEY ("recipe_id") REFERENCES "public"."recipes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipe_tags" ADD CONSTRAINT "recipe_tags_tag_id_tags_id_fk" FOREIGN KEY ("tag_id") REFERENCES "public"."tags"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recipes" ADD CONSTRAINT "recipes_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_usage_log" ADD CONSTRAINT "ai_usage_log_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_household_id_households_id_fk" FOREIGN KEY ("household_id") REFERENCES "public"."households"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "foods_household_idx" ON "foods" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "foods_barcode_idx" ON "foods" USING btree ("barcode");--> statement-breakpoint
CREATE INDEX "foods_search_es_trgm_idx" ON "foods" USING gin ("search_name_es" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "foods_search_en_trgm_idx" ON "foods" USING gin ("search_name_en" gin_trgm_ops);--> statement-breakpoint
CREATE UNIQUE INDEX "foods_source_ref_uidx" ON "foods" USING btree ("source","source_ref") WHERE source_ref IS NOT NULL AND household_id IS NULL;--> statement-breakpoint
CREATE INDEX "tags_household_idx" ON "tags" USING btree ("household_id");--> statement-breakpoint
CREATE UNIQUE INDEX "tags_household_slug_uidx" ON "tags" USING btree ("household_id","slug") NULLS NOT DISTINCT;--> statement-breakpoint
CREATE UNIQUE INDEX "unit_aliases_alias_locale_uidx" ON "unit_aliases" USING btree ("alias","locale");--> statement-breakpoint
CREATE INDEX "household_invites_household_idx" ON "household_invites" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "household_members_user_idx" ON "household_members" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_household_idx" ON "sessions" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "webauthn_credentials_user_idx" ON "webauthn_credentials" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "cooking_log_household_cooked_idx" ON "cooking_log" USING btree ("household_id","cooked_at");--> statement-breakpoint
CREATE INDEX "meal_plan_entries_household_date_idx" ON "meal_plan_entries" USING btree ("household_id","date");--> statement-breakpoint
CREATE INDEX "pantry_items_household_food_idx" ON "pantry_items" USING btree ("household_id","food_id");--> statement-breakpoint
CREATE INDEX "pantry_items_household_expires_idx" ON "pantry_items" USING btree ("household_id","expires_at");--> statement-breakpoint
CREATE INDEX "plan_proposals_household_status_idx" ON "plan_proposals" USING btree ("household_id","status");--> statement-breakpoint
CREATE INDEX "collections_household_idx" ON "collections" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "recipe_ingredients_recipe_idx" ON "recipe_ingredients" USING btree ("recipe_id");--> statement-breakpoint
CREATE INDEX "recipe_ingredients_food_idx" ON "recipe_ingredients" USING btree ("food_id");--> statement-breakpoint
CREATE INDEX "recipe_ingredients_raw_text_idx" ON "recipe_ingredients" USING gin (to_tsvector('simple', "raw_text"));--> statement-breakpoint
CREATE INDEX "recipe_steps_recipe_idx" ON "recipe_steps" USING btree ("recipe_id");--> statement-breakpoint
CREATE INDEX "recipes_household_idx" ON "recipes" USING btree ("household_id");--> statement-breakpoint
CREATE INDEX "recipes_search_idx" ON "recipes" USING gin ("search_vector");--> statement-breakpoint
CREATE INDEX "ai_usage_log_household_created_idx" ON "ai_usage_log" USING btree ("household_id","created_at");--> statement-breakpoint
CREATE INDEX "api_tokens_household_idx" ON "api_tokens" USING btree ("household_id");--> statement-breakpoint
CREATE UNIQUE INDEX "api_tokens_hash_uidx" ON "api_tokens" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "push_subscriptions_user_idx" ON "push_subscriptions" USING btree ("user_id");
--> statement-breakpoint
ALTER TABLE "plan_proposals" ADD CONSTRAINT "plan_proposals_created_by_token_id_fk" FOREIGN KEY ("created_by_token_id") REFERENCES "api_tokens"("id");
--> statement-breakpoint
ALTER TABLE "meal_plan_entries" ADD CONSTRAINT "meal_plan_entries_leftover_fk" FOREIGN KEY ("leftover_of_entry_id") REFERENCES "meal_plan_entries"("id");
--> statement-breakpoint
ALTER TABLE "foods" ADD CONSTRAINT "foods_merged_into_fk" FOREIGN KEY ("merged_into_id") REFERENCES "foods"("id");
--> statement-breakpoint
ALTER TABLE "tags" ADD CONSTRAINT "tags_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "tags"("id");
