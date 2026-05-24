import { db, databasePath } from "./index.ts";
import { campaigns, placements, users } from "./schema.ts";

db.$client.exec(`
  create table if not exists users (
    id text primary key,
    email text not null,
    displayName text
  );

  create table if not exists campaigns (
    id text primary key,
    name text not null,
    ownerUserId text not null references users(id)
  );

  create table if not exists placements (
    id text primary key,
    name text not null,
    status text not null,
    budgetCents integer not null,
    campaignId text not null references campaigns(id)
  );
`);

await db.delete(placements);
await db.delete(campaigns);
await db.delete(users);

await db.insert(users).values([
  { id: "user-1", email: "ada@example.com", displayName: "Ada Lovelace" },
  { id: "user-2", email: "grace@example.com", displayName: "Grace Hopper" },
]);

await db.insert(campaigns).values([
  { id: "campaign-spring", name: "Spring Launch", ownerUserId: "user-1" },
  { id: "campaign-winter", name: "Winter Retention", ownerUserId: "user-2" },
]);

await db.insert(placements).values([
  {
    id: "placement-1",
    name: "Homepage Hero",
    status: "active",
    budgetCents: 15000,
    campaignId: "campaign-spring",
  },
  {
    id: "placement-2",
    name: "Sidebar Promo",
    status: "active",
    budgetCents: 7500,
    campaignId: "campaign-spring",
  },
  {
    id: "placement-3",
    name: "Email Footer",
    status: "paused",
    budgetCents: 20000,
    campaignId: "campaign-winter",
  },
]);

db.$client.close();

console.log(`Seeded QueryKit SQLite database at ${databasePath}.`);
