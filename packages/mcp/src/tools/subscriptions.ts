/**
 * Subscription tools — delegated to platform MCP (S31-05).
 */
import type { PlatformMcpClient } from "../platform/mcp-client.ts";

export interface AddSubscriptionInput {
  sourceType: string;
  identifier: string;
  name?: string;
  url?: string;
  feedUrl?: string;
  configJson?: Record<string, unknown>;
}

export interface RemoveSubscriptionInput {
  subscriptionId: string;
}

export interface ListSubscriptionsInput {
  sourceType?: string;
  autoResearchOnly?: boolean;
}

export interface CheckSubscriptionsInput {
  subscriptionId?: string;
}

export interface GetSubscriptionContentInput {
  subscriptionId: string;
  limit?: number;
  status?: string;
}

export interface SetSubscriptionFilterInput {
  subscriptionId: string;
  filterType: string;
  value: unknown;
}

export interface GetSubscriptionFiltersInput {
  subscriptionId?: string;
  sourceType?: string;
}

export async function addSubscription(
  client: PlatformMcpClient,
  input: AddSubscriptionInput
): Promise<unknown> {
  return client.callTool("add_subscription", { ...input });
}

export async function removeSubscription(
  client: PlatformMcpClient,
  input: RemoveSubscriptionInput
): Promise<unknown> {
  return client.callTool("remove_subscription", {
    subscriptionId: input.subscriptionId,
  });
}

export async function listSubscriptions(
  client: PlatformMcpClient,
  input: ListSubscriptionsInput
): Promise<unknown> {
  return client.callTool("list_subscriptions", { ...input });
}

export async function checkSubscriptions(
  client: PlatformMcpClient,
  input: CheckSubscriptionsInput
): Promise<unknown> {
  return client.callTool("check_subscriptions", { ...input });
}

export async function getSubscriptionContent(
  client: PlatformMcpClient,
  input: GetSubscriptionContentInput
): Promise<unknown> {
  return client.callTool("get_subscription_content", { ...input });
}

export async function setSubscriptionFilter(
  client: PlatformMcpClient,
  input: SetSubscriptionFilterInput
): Promise<unknown> {
  return client.callTool("set_subscription_filter", { ...input });
}

export async function getSubscriptionFilters(
  client: PlatformMcpClient,
  input: GetSubscriptionFiltersInput
): Promise<unknown> {
  return client.callTool("get_subscription_filters", { ...input });
}
