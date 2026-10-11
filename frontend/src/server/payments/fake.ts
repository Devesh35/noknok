import "server-only";
import type { PaymentGateway } from "@/server/payments/gateway";

// Development and tests: money is "taken" instantly, so a paid join becomes
// going in the same request and no payments document is written. The /dev
// page's "fail next payment" knob is checked in joins.ts.
export const fakeGateway: PaymentGateway = {
  provider: "fake",
  async createOrder({ merchantOrderId }) {
    return { providerOrderId: `fake_${merchantOrderId}`, handoff: { kind: "captured" } };
  },
  resume() {
    return { kind: "captured" };
  },
  async verifyCheckout() {
    return { state: "pending" };
  },
  async refund(payment) {
    return { providerRefundId: `fake_refund_${payment._id}` };
  },
  async parseWebhook() {
    return null;
  },
};
