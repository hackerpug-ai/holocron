/**
 * Assimilation tools — delegated to platform MCP (S31-05).
 */
import type { PlatformMcpClient } from "../platform/mcp-client.ts";

export interface StartAssimilationInput {
  repositoryUrl: string;
  profile?: "fast" | "standard" | "thorough";
  autoApprove?: boolean;
}

export interface AssimilationSessionIdInput {
  sessionId: string;
}

export interface RejectAssimilationPlanInput {
  sessionId: string;
  feedback?: string;
}

export interface SteerAssimilationInput {
  sessionId: string;
  note: string;
}

export async function startAssimilation(
  client: PlatformMcpClient,
  input: StartAssimilationInput
): Promise<unknown> {
  return client.callTool("start_assimilation", {
    repositoryUrl: input.repositoryUrl,
    ...(input.profile !== undefined && { profile: input.profile }),
    ...(input.autoApprove !== undefined && { autoApprove: input.autoApprove }),
  });
}

export async function approveAssimilationPlan(
  client: PlatformMcpClient,
  input: AssimilationSessionIdInput
): Promise<unknown> {
  return client.callTool("approve_assimilation_plan", { sessionId: input.sessionId });
}

export async function rejectAssimilationPlan(
  client: PlatformMcpClient,
  input: RejectAssimilationPlanInput
): Promise<unknown> {
  return client.callTool("reject_assimilation_plan", {
    sessionId: input.sessionId,
    ...(input.feedback !== undefined && { feedback: input.feedback }),
  });
}

export async function getAssimilationStatus(
  client: PlatformMcpClient,
  input: AssimilationSessionIdInput
): Promise<unknown> {
  return client.callTool("get_assimilation_status", { sessionId: input.sessionId });
}

export async function cancelAssimilation(
  client: PlatformMcpClient,
  input: AssimilationSessionIdInput
): Promise<unknown> {
  return client.callTool("cancel_assimilation", { sessionId: input.sessionId });
}

export async function steerAssimilation(
  client: PlatformMcpClient,
  input: SteerAssimilationInput
): Promise<unknown> {
  return client.callTool("steer_assimilation", {
    sessionId: input.sessionId,
    note: input.note,
  });
}
