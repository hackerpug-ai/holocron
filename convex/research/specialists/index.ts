/**
 * Research Specialists Registry
 *
 * US-IMP-002: Research Agent Specialists
 * US-IMP-011: Product/Service Finder Specialists
 *
 * Exports all specialist implementations for easy importing.
 */

export {
  type AcademicReport,
  executeAcademicResearch,
} from './academic';
export {
  executeProductFinder,
  type ProductReport,
} from './product_finder';
export {
  executeServiceFinder,
  type ServiceReport,
} from './service_finder';
export {
  executeTechnicalResearch,
  type TechnicalReport,
} from './technical';
