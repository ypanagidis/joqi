import { defineRelations } from "drizzle-orm/relations";
import { integer, pgEnum, pgTable, varchar } from "drizzle-orm/pg-core";

export const placementStatus = pgEnum("placement_status", ["active", "paused", "archived"]);

export const users = pgTable("users", {
  id: varchar("id", { length: 36 }).primaryKey(),
  email: varchar("email", { length: 255 }).notNull(),
  displayName: varchar("displayName", { length: 255 }),
});

export const campaigns = pgTable("campaigns", {
  id: varchar("id", { length: 36 }).primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  ownerUserId: varchar("ownerUserId", { length: 36 })
    .notNull()
    .references(() => users.id),
});

export const placements = pgTable("placements", {
  id: varchar("id", { length: 36 }).primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  status: placementStatus("status").notNull(),
  budgetCents: integer("budgetCents").notNull(),
  campaignId: varchar("campaignId", { length: 36 })
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
