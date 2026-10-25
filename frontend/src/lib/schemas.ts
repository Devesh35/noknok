// Request bodies, validated on the server and typed on the client. Pure zod;
// no I/O, so both sides may import it.
import { z } from "zod";
import { SUBCATEGORIES } from "@/lib/activity";
import { CATEGORIES_LIST, CITIES } from "@/lib/types";

export const phoneSchema = z
  .string()
  .regex(/^\d{10}$/, "Enter a 10-digit phone number");
const city = z.enum(CITIES);
const category = z.enum(CATEGORIES_LIST);
const isoDate = z.iso.datetime({ offset: true });

// The subcategory must belong to the chosen category.
const subcategoryFits: [
  (a: { category: z.infer<typeof category>; subcategory: string }) => boolean,
  { message: string; path: string[] },
] = [
  (a) => SUBCATEGORIES[a.category].some((s) => s.value === a.subcategory),
  { message: "Pick a subcategory", path: ["subcategory"] },
];

// The Firebase ID token the browser got after entering the SMS code.
export const firebaseExchangeInput = z.object({
  idToken: z.string().min(20).max(8192),
});

// The phone number comes from the signup token, which the server signed after
// Firebase proved the number; the client can't pick a different one.
export const registerInput = z.object({
  signupToken: z.string().min(1).max(1024),
  name: z.string().trim().min(1).max(60),
  city,
});
export type RegisterInput = z.infer<typeof registerInput>;

export const HANDLE_PATTERN = /^[a-z0-9_]{3,20}$/;

export const profilePatch = z
  .object({
    name: z.string().trim().min(1).max(60),
    handle: z
      .string()
      .trim()
      .toLowerCase()
      .regex(HANDLE_PATTERN, "3-20 letters, numbers or _"),
    bio: z.string().trim().max(200),
    city,
    // An image uploaded through POST /api/images; null clears the photo.
    avatarUrl: z
      .string()
      .regex(/^\/api\/images\/[A-Za-z0-9_-]+$/, "Upload a photo first")
      .nullable()
      .optional(),
    interests: z.array(category).max(9),
  })
  .partial();
export type ProfilePatch = z.infer<typeof profilePatch>;

export const settingsPatch = z
  .object({
    push: z.boolean(),
    email: z.boolean(),
    sms: z.boolean(),
    whatsapp: z.boolean(),
    joinedVisibility: z.enum(["everyone", "friends", "nobody"]),
  })
  .partial();
export type SettingsPatch = z.infer<typeof settingsPatch>;

export const activityInput = z
  .object({
    title: z.string().trim().min(3).max(80),
    category,
    subcategory: z.string(),
    description: z.string().trim().max(2000),
    coverUrl: z.string().optional(),
    venueName: z.string().trim().min(1).max(80),
    address: z.string().trim().max(200),
    city,
    area: z.string().trim().max(40).optional(),
    lat: z.number().optional(),
    lng: z.number().optional(),
    startsAt: isoDate,
    endsAt: isoDate,
    priceP: z.number().int().min(0).max(100_000_00),
    capacity: z.number().int().min(1).max(500),
    visibility: z.enum(["friends", "friends_of_friends", "open"]),
    setting: z.enum(["indoor", "outdoor"]),
    beginnerFriendly: z.boolean(),
    tags: z.array(z.string().trim().min(1).max(60)).max(10),
    waitlistMode: z.enum(["auto", "approval"]),
    refundCutoffHours: z
      .number()
      .int()
      .min(0)
      .max(24 * 14),
  })
  .refine(...subcategoryFits)
  .refine((a) => Date.parse(a.endsAt) > Date.parse(a.startsAt), {
    message: "It has to end after it starts",
    path: ["endsAt"],
  });
export type ActivityInput = z.infer<typeof activityInput>;

export const quickPlanInput = z
  .object({
    title: z.string().trim().min(3).max(80),
    category,
    subcategory: z.string(),
    startsAt: isoDate,
    venueName: z.string().trim().min(1).max(80),
    city,
    area: z.string().trim().max(40).optional(), // suburb, e.g. "Andheri"
    need: z.number().int().min(1).max(50), // how many more people the host wants
  })
  .refine(...subcategoryFits);
export type QuickPlanInput = z.infer<typeof quickPlanInput>;

export const activityListQuery = z.object({
  city: city.optional(),
  category: category.optional(),
  visibility: z.enum(["friends", "friends_of_friends", "open"]).optional(),
  date: z.enum(["any", "today", "tomorrow", "weekend", "week"]).default("any"),
  setting: z.enum(["indoor", "outdoor"]).optional(),
  free: z.coerce.boolean().optional(),
  beginner: z.coerce.boolean().optional(),
  q: z.string().trim().max(80).optional(),
  includeLocked: z.coerce.boolean().optional(),
  hostId: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(50),
});
export type ActivityListQuery = z.infer<typeof activityListQuery>;

export const inviteOpenInput = z.object({
  token: z.string().nullable(),
  refId: z.string().nullable(),
});

// Razorpay's signed triple after the modal, or our order id after a redirect
// gateway (or a UPI app switch) brings the joiner back to /pay/return.
export const paymentVerifyInput = z.union([
  z.object({
    razorpay_order_id: z.string().min(1),
    razorpay_payment_id: z.string().min(1),
    razorpay_signature: z.string().min(1),
  }),
  z.object({ merchantOrderId: z.string().regex(/^[A-Za-z0-9_-]{1,63}$/) }),
]);

export const checkInInput = z.object({ ticketId: z.string().trim().min(1) });
export const friendRequestInput = z.object({ toId: z.string() });
export const reviewInput = z.object({
  rating: z.number().int().min(1).max(5),
  tags: z.array(z.string().max(40)).max(10),
});
export const reportInput = z.object({
  targetType: z.enum(["activity", "user"]),
  targetId: z.string(),
  reason: z.string().trim().min(1).max(500),
});

export const devSettingsPatch = z
  .object({
    autoAcceptFriends: z.boolean(),
    feeModel: z.enum(["joiner", "host"]),
    feePercent: z.number().min(0).max(30),
    timeOffsetMs: z.number().int(),
    failNextPayment: z.boolean(),
  })
  .partial();
