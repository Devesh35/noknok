import "server-only";
import mongoose, { type Model, type Schema } from "mongoose";

// One Mongoose schema per collection (BACKEND_PLAN.md §2), split by domain:
// core.ts (users, auth, activities, joins), social.ts, system.ts. _id values
// are the prefixed random strings the app already uses. Money is integer paise.

export const opts = { strict: "throw" as const, timestamps: true, versionKey: false as const };

// Next dev reloads modules; reuse a model if it was already compiled.
export function model<T>(name: string, schema: Schema<T>): Model<T> {
  return (mongoose.models[name] as Model<T>) ?? mongoose.model<T>(name, schema);
}
