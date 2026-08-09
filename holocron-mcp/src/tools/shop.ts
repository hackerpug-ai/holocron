/**
 * Shop tools — delegated to platform MCP (S31-05).
 */
import type { PlatformMcpClient } from "../platform/mcp-client.ts";

export interface ShopProductsInput {
  query: string;
  retailers?: string[];
  condition?: "new" | "used" | "any";
  priceMin?: number;
  priceMax?: number;
  verifiedOnly?: boolean;
}

export interface GetShopSessionInput {
  sessionId: string;
}

export interface GetShopListingsInput {
  sessionId: string;
  limit?: number;
  excludeDuplicates?: boolean;
  sortBy?: "price" | "dealScore" | "createdAt";
}

export async function shopProducts(
  client: PlatformMcpClient,
  input: ShopProductsInput
): Promise<unknown> {
  return client.callTool("shop_products", { ...input });
}

export async function getShopSession(
  client: PlatformMcpClient,
  input: GetShopSessionInput
): Promise<unknown> {
  return client.callTool("get_shop_session", { sessionId: input.sessionId });
}

export async function getShopListings(
  client: PlatformMcpClient,
  input: GetShopListingsInput
): Promise<unknown> {
  return client.callTool("get_shop_listings", { ...input });
}
