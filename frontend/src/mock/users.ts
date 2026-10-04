import type { User } from "@/lib/types";

// The account you get by logging in with the demo phone number.
export const DEMO_USER_ID = "u0";
export const DEMO_PHONE = "9876500000";

const SEED: Omit<User, "avatarUrl" | "phoneVerified" | "baseRatingCount">[] = [
  {
    id: "u0",
    handle: "aarav",
    name: "Aarav Mehta",
    city: "Mumbai",
    bio: "Weekend footballer, weekday coder. Always up for a plan.",
    phone: DEMO_PHONE,
    interests: ["sports", "party", "outdoor"],
    idVerified: true,
    baseRating: 4.8,
    baseHostedCount: 4,
  },
  {
    id: "u1",
    handle: "priya",
    name: "Priya Nair",
    city: "Mumbai",
    bio: "Throws the rooftop parties your friends keep talking about.",
    phone: "9876500001",
    interests: ["party", "celebration", "event"],
    idVerified: true,
    baseRating: 4.9,
    baseHostedCount: 12,
  },
  {
    id: "u2",
    handle: "rohan",
    name: "Rohan Kulkarni",
    city: "Pune",
    bio: "Sahyadri trek lead. 60+ forts and counting.",
    phone: "9876500002",
    interests: ["outdoor", "sports"],
    idVerified: true,
    baseRating: 4.7,
    baseHostedCount: 23,
  },
  {
    id: "u3",
    handle: "sneha",
    name: "Sneha Patil",
    city: "Thane",
    bio: "Board game hoarder. Will teach you Catan, will not let you win.",
    phone: "9876500003",
    interests: ["indoor", "event"],
    idVerified: false,
    baseRating: 4.6,
    baseHostedCount: 8,
  },
  {
    id: "u4",
    handle: "kabir",
    name: "Kabir Shah",
    city: "Navi Mumbai",
    bio: "Gym at 6, badminton at 6. AM and PM.",
    phone: "9876500004",
    interests: ["gym", "sports"],
    idVerified: false,
    baseRating: 4.5,
    baseHostedCount: 15,
  },
  {
    id: "u5",
    handle: "ananya",
    name: "Ananya Iyer",
    city: "Mumbai",
    bio: "Yoga teacher. Mornings in the park, evenings by the sea.",
    phone: "9876500005",
    interests: ["gym", "outdoor", "celebration"],
    idVerified: true,
    baseRating: 4.9,
    baseHostedCount: 31,
  },
  {
    id: "u6",
    handle: "vikram",
    name: "Vikram Desai",
    city: "Pune",
    bio: "Box cricket captain looking for a decent opening bowler.",
    phone: "9876500006",
    interests: ["sports", "party"],
    idVerified: false,
    baseRating: 4.4,
    baseHostedCount: 6,
  },
  {
    id: "u7",
    handle: "meera",
    name: "Meera Joshi",
    city: "Thane",
    bio: "Runs open mics and founder meetups across MMR.",
    phone: "9876500007",
    interests: ["event", "indoor", "party"],
    idVerified: true,
    baseRating: 4.7,
    baseHostedCount: 19,
  },
];

// Stock portraits live in public/images/avatars, one per user id.
export const SEED_USERS: User[] = SEED.map((user) => ({
  ...user,
  avatarUrl: `/images/avatars/${user.id}.jpg`,
  phoneVerified: true,
  baseRatingCount: user.baseHostedCount * 3,
}));

// Accepted friendships as [a, b] pairs.
export const SEED_FRIENDSHIPS: [string, string][] = [
  ["u0", "u1"],
  ["u0", "u2"],
  ["u0", "u3"],
  ["u1", "u5"],
  ["u2", "u6"],
  ["u3", "u7"],
  ["u4", "u6"],
];

// Pending requests as [from, to], so the demo user has one waiting.
export const SEED_PENDING_REQUESTS: [string, string][] = [["u5", "u0"]];
