import "server-only";
import { newId } from "@/lib/ids";
import type { AppNotification, NotificationType } from "@/lib/types";
import { connectDb } from "@/server/db";
import { toNotification } from "@/server/dto";
import { NotificationModel } from "@/server/models";
import { nowDate } from "@/server/clock";

const PAGE = 50;

// Creates a notification. With a key the write is an upsert, so scheduled
// notifications (reminders, review prompts) are created once however often
// the clock runs. Not for use inside a transaction.
export async function notify(
  userId: string,
  type: NotificationType,
  title: string,
  body: string,
  href: string,
  key?: string,
): Promise<void> {
  await connectDb();
  const fields = { type, title, body, href, read: false, createdAt: nowDate(), updatedAt: nowDate() };
  if (!key) {
    await NotificationModel.create({ _id: newId("n"), userId, ...fields });
    return;
  }
  await NotificationModel.updateOne(
    { userId, key },
    { $setOnInsert: { _id: newId("n"), userId, key, ...fields } },
    { upsert: true, timestamps: false },
  );
}

export async function notificationsFor(userId: string): Promise<AppNotification[]> {
  await connectDb();
  const docs = await NotificationModel.find({ userId }).sort({ createdAt: -1 }).limit(PAGE).lean();
  return docs.map(toNotification);
}

export async function unreadCount(userId: string): Promise<number> {
  await connectDb();
  return NotificationModel.countDocuments({ userId, read: false });
}

export async function markRead(userId: string, id: string): Promise<void> {
  await connectDb();
  await NotificationModel.updateOne({ _id: id, userId }, { $set: { read: true } });
}

export async function markAllRead(userId: string): Promise<void> {
  await connectDb();
  await NotificationModel.updateMany({ userId, read: false }, { $set: { read: true } });
}
