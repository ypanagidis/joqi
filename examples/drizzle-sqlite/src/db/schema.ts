import { defineRelations } from "drizzle-orm/relations";
import { int, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull(),
  displayName: text("displayName"),
});

export const campaigns = sqliteTable("campaigns", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  ownerUserId: text("ownerUserId")
    .notNull()
    .references(() => users.id),
});

export const placements = sqliteTable("placements", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  status: text("status", { enum: ["active", "paused", "archived"] }).notNull(),
  budgetCents: int("budgetCents").notNull(),
  campaignId: text("campaignId")
    .notNull()
    .references(() => campaigns.id),
});

export const schema = {
  users,
  campaigns,
  placements,
};

export const relations = defineRelations(schema, (r) => ({
  placements: {
    campaign: r.one.campaigns({
      from: r.placements.campaignId,
      to: r.campaigns.id,
    }),
  },
  campaigns: {
    owner: r.one.users({
      from: r.campaigns.ownerUserId,
      to: r.users.id,
    }),
  },
}));
