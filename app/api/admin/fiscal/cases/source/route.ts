import { withApi } from "@/lib/api/handler";
import { NotFoundError } from "@/lib/api/errors";
import { Order } from "@/models/order.model";
import { objectIdSchema } from "@/lib/fiscal/manual/contracts";
import { manualResponse } from "@/lib/fiscal/manual/http";
export const GET = withApi({ auth: "admin" }, async ({ request }) => manualResponse(async () => {
  const id = objectIdSchema.parse(request.nextUrl.searchParams.get("orderId"));
  const order = await Order.findById(id).select("orderNumber currency status items.name items.price items.quantity subtotal discount tax shippingCost total").lean();
  if (!order) throw new NotFoundError("Pedido");
  return order;
}));
