import "server-only";
import type {
  Activity,
  AppNotification,
  FriendRequest,
  Join,
  Me,
  Review,
  User,
} from "@/lib/types";
import type {
  ActivityDoc,
  FriendRequestDoc,
  JoinDoc,
  NotificationDoc,
  ReviewDoc,
  UserDoc,
} from "@/server/models";

// Documents never cross the API boundary as-is: every field a response carries
// is named here, so a new column stays private until someone adds it.

export function iso(date: Date): string {
  return date.toISOString();
}

export function toUser(doc: UserDoc): User {
  return {
    id: doc._id,
    handle: doc.handle,
    name: doc.name,
    avatarUrl: doc.avatarUrl,
    city: doc.city,
    bio: doc.bio,
    interests: doc.interests,
    phoneVerified: doc.phoneVerified,
    idVerified: doc.idVerified,
  };
}

export function toMe(doc: UserDoc): Me {
  return {
    ...toUser(doc),
    phone: doc.phone,
    email: doc.email,
    settings: {
      push: doc.settings.push,
      email: doc.settings.email,
      sms: doc.settings.sms,
      whatsapp: doc.settings.whatsapp,
      joinedVisibility: doc.settings.joinedVisibility,
    },
    blockedIds: doc.blockedIds,
  };
}

export interface ActivityOptions {
  includeInviteToken?: boolean;
  // The viewer may not open this plan: where it is and what it says stay hidden.
  locked?: boolean;
}

export function toActivity(doc: ActivityDoc, options: ActivityOptions = {}): Activity {
  const locked = options.locked ?? false;
  const [lng, lat] = doc.location?.coordinates ?? [undefined, undefined];
  return {
    id: doc._id,
    // The lock page shows only when, which city and who hosts.
    title: locked ? "A private plan" : doc.title,
    category: doc.category,
    subcategory: doc.subcategory,
    description: locked ? "" : doc.description,
    hostId: doc.hostId,
    coverUrl: locked ? undefined : doc.coverUrl,
    venueName: locked ? "" : doc.venueName,
    address: locked ? "" : doc.address,
    city: doc.city,
    area: locked ? undefined : doc.area,
    lat: locked ? undefined : lat,
    lng: locked ? undefined : lng,
    startsAt: iso(doc.startsAt),
    endsAt: iso(doc.endsAt),
    priceP: doc.priceP,
    capacity: doc.capacity,
    visibility: doc.visibility,
    tags: locked ? [] : doc.tags,
    status: doc.status,
    waitlistMode: doc.waitlistMode,
    refundCutoffHours: doc.refundCutoffHours,
    shortCode: doc.shortCode,
    inviteToken: options.includeInviteToken ? doc.inviteToken : undefined,
    setting: doc.setting,
    beginnerFriendly: doc.beginnerFriendly,
    quick: doc.quick,
    goingCount: doc.goingCount,
    waitlistCount: doc.waitlistCount,
    interestedCount: doc.interestedCount,
    createdAt: iso(doc.createdAt),
  };
}

export function toJoin(doc: JoinDoc): Join {
  return {
    id: doc._id,
    activityId: doc.activityId,
    userId: doc.userId,
    status: doc.status,
    createdAt: iso(doc.createdAt),
    ticketP: doc.ticketP,
    feeP: doc.feeP,
    hostShareP: doc.hostShareP,
    refundedP: doc.refundedP,
    invitedBy: doc.invitedBy,
    checkedInAt: doc.checkedInAt ? iso(doc.checkedInAt) : undefined,
  };
}

export function toFriendRequest(doc: FriendRequestDoc): FriendRequest {
  return {
    id: doc._id,
    fromId: doc.fromId,
    toId: doc.toId,
    status: doc.status,
    createdAt: iso(doc.createdAt),
  };
}

export function toNotification(doc: NotificationDoc): AppNotification {
  return {
    id: doc._id,
    userId: doc.userId,
    type: doc.type,
    title: doc.title,
    body: doc.body,
    href: doc.href,
    createdAt: iso(doc.createdAt),
    read: doc.read,
  };
}

export function toReview(doc: ReviewDoc): Review {
  return {
    id: doc._id,
    activityId: doc.activityId,
    hostId: doc.hostId,
    userId: doc.userId,
    rating: doc.rating,
    tags: doc.tags,
    createdAt: iso(doc.createdAt),
  };
}

// Amounts in notification copy. Whole rupees stay whole; fees can add paise.
export function rupees(amountP: number): string {
  const value = amountP / 100;
  return `₹${Number.isInteger(value) ? value : value.toFixed(2)}`;
}
