import { defineRelations } from "drizzle-orm/relations";
import { int, mysqlEnum, mysqlTable, varchar } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: varchar("id", { length: 36 }).primaryKey(),
  email: varchar("email", { length: 255 }).notNull(),
  displayName: varchar("displayName", { length: 255 }),
});

export const campaigns = mysqlTable("campaigns", {
  id: varchar("id", { length: 36 }).primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  ownerUserId: varchar("ownerUserId", { length: 36 })
    .notNull()
    .references(() => users.id),
});

export const placements = mysqlTable("placements", {
  id: varchar("id", { length: 36 }).primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  status: mysqlEnum("status", ["active", "paused", "archived"]).notNull(),
  budgetCents: int("budgetCents").notNull(),
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
