import "server-only";
import mongoose from "mongoose";
import { config } from "@/server/config";
import { ensureSrvResolvable } from "@/server/dns";

// One connection per server instance, cached on globalThis so Next's dev
// reloads and Vercel's warm invocations reuse it. The pool is kept small
// because many instances may exist at once (Atlas M0 allows 500 connections).
const MAX_POOL = 5;

interface Cached {
  promise: Promise<typeof mongoose> | null;
  memoryUri: string | null;
}

const globalRef = globalThis as unknown as { __noknokDb?: Cached };
const cached: Cached = (globalRef.__noknokDb ??= { promise: null, memoryUri: null });

// Development without MONGODB_URI: start an empty in-memory replica set so
// transactions work. Data lives until the dev server exits.
async function memoryUri(): Promise<string> {
  if (cached.memoryUri) return cached.memoryUri;
  const { MongoMemoryReplSet } = await import("mongodb-memory-server");
  const replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  cached.memoryUri = replSet.getUri("noknok");
  return cached.memoryUri;
}

export async function connectDb(): Promise<typeof mongoose> {
  if (!cached.promise) {
    cached.promise = (async () => {
      const uri = config.MONGODB_URI || (await memoryUri());
      await ensureSrvResolvable(uri);
      mongoose.set("strictQuery", true);
      return mongoose.connect(uri, {
        maxPoolSize: MAX_POOL,
        serverSelectionTimeoutMS: 5000,
      });
    })().catch((error) => {
      cached.promise = null;
      throw error;
    });
  }
  return cached.promise;
}

// Runs fn inside a transaction. Mongoose sessions must be passed to every
// query inside (`.session(session)`), which is why services take it explicitly.
export async function withTx<T>(fn: (session: mongoose.ClientSession) => Promise<T>): Promise<T> {
  await connectDb();
  const session = await mongoose.startSession();
  try {
    let result!: T;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}
