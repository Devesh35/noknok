import type { Metadata } from "next";
import { Suspense } from "react";
import { PayReturnView } from "@/views/PayReturnView";

export const metadata: Metadata = { title: "Confirming your payment" };

// Where redirect gateways (PhonePe) and UPI app switches in the mobile shell
// bring the joiner back: /pay/return?mo=<merchantOrderId>.
export default function Page() {
  return (
    <Suspense fallback={null}>
      <PayReturnView />
    </Suspense>
  );
}
