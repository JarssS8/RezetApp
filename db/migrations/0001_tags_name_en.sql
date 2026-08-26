DROP INDEX "unit_aliases_alias_locale_uidx";--> statement-breakpoint
ALTER TABLE "unit_aliases" ADD CONSTRAINT "unit_aliases_alias_locale_pk" PRIMARY KEY("alias","locale");--> statement-breakpoint
ALTER TABLE "tags" ADD COLUMN "name_en" text;--> statement-breakpoint
CREATE INDEX "webauthn_challenges_expires_idx" ON "webauthn_challenges" USING btree ("expires_at");