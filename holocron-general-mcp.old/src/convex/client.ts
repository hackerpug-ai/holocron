/**
 * Convex client initialization
 */

import { ConvexHttpClient } from 'convex/browser';
import { HolocronConfig } from '../config/env.js';

export function createConvexClient(config: HolocronConfig): ConvexHttpClient {
  return new ConvexHttpClient(config.convexUrl);
}
