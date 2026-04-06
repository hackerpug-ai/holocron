/**
 * TS-003: Replace status v.string() with v.union(v.literal(...)) in schema
 *
 * Verifies that the schema uses strict union literals for status fields
 * in researchSessions, deepResearchSessions, deepResearchIterations, and tasks.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const schemaPath = join(process.cwd(), 'convex', 'schema.ts');
const schemaContent = readFileSync(schemaPath, 'utf-8');

describe('TS-003: Status fields use v.union(v.literal(...))', () => {
  /**
   * AC-1: researchSessions status uses v.union(v.literal(...))
   */
  it('researchSessions status uses v.union(v.literal(...))', () => {
    // Find the researchSessions table definition
    const researchSessionsMatch = schemaContent.match(
      /researchSessions:\s*defineTable\(\{[\s\S]*?\}\)/
    );
    expect(researchSessionsMatch).not.toBeNull();

    const tableBlock = researchSessionsMatch![0];
    // status field must use v.union with v.literal
    expect(tableBlock).toMatch(/status:\s*v\.union\(\s*v\.literal\(/);
    // status field must NOT be plain v.string()
    expect(tableBlock).not.toMatch(/status:\s*v\.string\(\)/);
  });

  /**
   * AC-2: deepResearchSessions status uses v.union(v.literal(...))
   */
  it('deepResearchSessions status uses v.union(v.literal(...))', () => {
    const deepResearchSessionsMatch = schemaContent.match(
      /deepResearchSessions:\s*defineTable\(\{[\s\S]*?\}\)/
    );
    expect(deepResearchSessionsMatch).not.toBeNull();

    const tableBlock = deepResearchSessionsMatch![0];
    expect(tableBlock).toMatch(/status:\s*v\.union\(\s*v\.literal\(/);
    expect(tableBlock).not.toMatch(/status:\s*v\.string\(\)/);
  });

  /**
   * AC-3: tasks status uses v.union(v.literal(...))
   */
  it('tasks status uses v.union(v.literal(...))', () => {
    const tasksMatch = schemaContent.match(
      /\btasks:\s*defineTable\(\{[\s\S]*?\}\)/
    );
    expect(tasksMatch).not.toBeNull();

    const tableBlock = tasksMatch![0];
    expect(tableBlock).toMatch(/status:\s*v\.union\(\s*v\.literal\(/);
    expect(tableBlock).not.toMatch(/status:\s*v\.string\(\)/);
  });

  /**
   * AC-4: deepResearchIterations status uses v.union(v.literal(...))
   * Note: The spec mentions subscriptionSources but that table has no status field.
   * deepResearchIterations is the 4th table with status: v.string() in this area.
   */
  it('deepResearchIterations status uses v.union(v.literal(...))', () => {
    const deepResearchIterationsMatch = schemaContent.match(
      /deepResearchIterations:\s*defineTable\(\{[\s\S]*?\}\)/
    );
    expect(deepResearchIterationsMatch).not.toBeNull();

    const tableBlock = deepResearchIterationsMatch![0];
    expect(tableBlock).toMatch(/status:\s*v\.union\(\s*v\.literal\(/);
    expect(tableBlock).not.toMatch(/status:\s*v\.string\(\)/);
  });

  /**
   * AC-5: At least 4 status fields use v.union in the schema (covers all four tables)
   */
  it('schema has at least 4 status fields using v.union', () => {
    const unionStatusMatches = schemaContent.match(/status:\s*v\.union\(\s*v\.literal\(/g);
    expect(unionStatusMatches).not.toBeNull();
    expect(unionStatusMatches!.length).toBeGreaterThanOrEqual(4);
  });
});
