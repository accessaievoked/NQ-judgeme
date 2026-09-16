import { PrismaClient } from "@prisma/client";
import { decrypt, encrypt } from "./crypto.server";

function encryptSessionFields(data: Record<string, unknown>) {
  if (typeof data.accessToken === "string" && data.accessToken) {
    data.accessToken = encrypt(data.accessToken);
  }
  if (typeof data.refreshToken === "string" && data.refreshToken) {
    data.refreshToken = encrypt(data.refreshToken);
  }
}

function decryptSessionRow<T>(row: T): T {
  if (!row || typeof row !== "object") return row;
  const data = row as Record<string, unknown>;
  if (typeof data.accessToken === "string" && data.accessToken) {
    data.accessToken = decrypt(data.accessToken);
  }
  if (typeof data.refreshToken === "string" && data.refreshToken) {
    data.refreshToken = decrypt(data.refreshToken);
  }
  return row;
}

/**
 * The session-storage adapter (@shopify/shopify-app-session-storage-prisma)
 * does raw `prisma.session` CRUD and expects plaintext in/out. This extension
 * encrypts accessToken/refreshToken transparently around that boundary so the
 * adapter itself never needs to change and access tokens are never persisted
 * as plaintext.
 */
function createPrismaClient() {
  return new PrismaClient().$extends({
    name: "encrypted-session-tokens",
    query: {
      session: {
        async upsert({ args, query }) {
          const seen = new Set<object>();
          for (const candidate of [args.create, args.update]) {
            if (candidate && typeof candidate === "object" && !seen.has(candidate)) {
              seen.add(candidate);
              encryptSessionFields(candidate as Record<string, unknown>);
            }
          }
          return query(args);
        },
        async create({ args, query }) {
          if (args.data) encryptSessionFields(args.data as Record<string, unknown>);
          return query(args);
        },
        async update({ args, query }) {
          if (args.data) encryptSessionFields(args.data as Record<string, unknown>);
          return query(args);
        },
        async findUnique({ args, query }) {
          return decryptSessionRow(await query(args));
        },
        async findFirst({ args, query }) {
          return decryptSessionRow(await query(args));
        },
        async findMany({ args, query }) {
          const rows = await query(args);
          return (rows as unknown[]).map((row) => decryptSessionRow(row));
        },
      },
    },
  });
}

// `$extends` returns a type that is structurally a PrismaClient (same model
// delegates, same call signatures) but isn't nominally assignable to it —
// Prisma's typings don't carry `$on` through extensions. Session storage and
// the rest of the app only ever use the standard model delegate methods, so
// this cast is safe and keeps `PrismaClient` as the one type used everywhere.
declare global {
  // eslint-disable-next-line no-var
  var prismaGlobal: PrismaClient | undefined;
}

const prisma = global.prismaGlobal ?? (createPrismaClient() as unknown as PrismaClient);

if (process.env.NODE_ENV !== "production") {
  global.prismaGlobal = prisma;
}

export default prisma;
