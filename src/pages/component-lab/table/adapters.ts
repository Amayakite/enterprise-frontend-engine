import type { Product } from "@/api/reference-lab/types";
import type { OrderLabPayload, OrderLabResult } from "@/api/order-lab/types";
import { multiplyDecimals, roundDecimal } from "@/utils/decimal";
import type { OrderModel, OrderLine, OrderContext } from "./types";

export function createLine(): OrderLine {
  return {
    clientKey: crypto.randomUUID(),
    id: null,
    productId: null,
    quantity: 1,
    price: 0,
    amount: 0,
    note: "",
  };
}
export function lineAmount(quantity: number, price: number) {
  return roundDecimal(multiplyDecimals(quantity, price), 2).toNumber();
}
export function appendProducts(
  lines: readonly OrderLine[],
  products: readonly Product[]
): OrderLine[] {
  const keys = new Set(lines.map((row) => row.productId));
  const appended: OrderLine[] = [];
  for (const product of products) {
    if (keys.has(product.id)) continue;
    keys.add(product.id);
    appended.push({
      ...createLine(),
      productId: product.id,
      price: product.price,
      amount: lineAmount(1, product.price),
    });
  }
  return [...lines, ...appended];
}
export function toOrderPayload(order: OrderModel, context: OrderContext): OrderLabPayload {
  return {
    id: order.id,
    organizationId: context.organizationId,
    title: order.header.title.trim(),
    customerId: order.header.customerId,
    lines: order.lines.map(({ id, productId, quantity, price, note }) => ({
      id,
      productId,
      quantity,
      price,
      note,
    })),
  };
}
export function hydrateOrder(result: OrderLabResult): OrderModel {
  return {
    id: result.id,
    header: { title: result.title, customerId: result.customerId },
    lines: result.lines.map((line) => ({
      ...createLine(),
      ...line,
      amount: lineAmount(line.quantity, line.price),
    })),
  };
}
