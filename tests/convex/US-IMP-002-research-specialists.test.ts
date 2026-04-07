/**
 * US-IMP-002: Research Agent Specialists
 *
 * Tests verify that research queries are routed to appropriate specialist agents
 * based on domain detection, and that specialists generate domain-specific reports.
 *
 * AC-1: User submits research query → Query analyzed → Query is routed to appropriate specialist
 * AC-2: Academic query submitted → Domain detected → Academic specialist generates academic-focused report
 * AC-3: Technical query submitted → Domain detected → Technical specialist generates technical report
 * AC-4: No clear domain → Query ambiguous → Generalist agent handles query
 */

import { describe, it, expect } from "vitest";
import path from "path";
import fs from "fs";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const specialistsPath = path.resolve(
  __dirname,
  "../../convex/research/specialists"
);
const dispatcherPath = path.resolve(
  __dirname,
  "../../convex/research/dispatcher.ts"
);
const researchActionsPath = path.resolve(
  __dirname,
  "../../convex/research/actions.ts"
);

function readDispatcher(): string {
  return fs.readFileSync(dispatcherPath, "utf-8");
}

function readResearchActions(): string {
  return fs.readFileSync(researchActionsPath, "utf-8");
}

function specialistsDirExists(): boolean {
  return fs.existsSync(specialistsPath);
}

function listSpecialistFiles(): string[] {
  if (!specialistsDirExists()) return [];
  return fs.readdirSync(specialistsPath).filter(f => f.endsWith('.ts'));
}

// ---------------------------------------------------------------------------
// AC-1: User submits research query → Query analyzed → Query is routed to appropriate specialist
// ---------------------------------------------------------------------------
describe("AC-1: Query analyzed and routed to appropriate specialist", () => {
  it("should have specialists directory", () => {
    expect(specialistsDirExists()).toBe(true);
  });

  it("should export detectSpecialist from dispatcher", () => {
    const src = readDispatcher();
    // Accept both 'export const' and 'export function' syntax
    expect(src).toMatch(/export (const|function) detectSpecialist/);
    expect(src).toContain('export type SpecialistType');
  });

  it("should define specialist types including academic, technical, and generalist", () => {
    const src = readDispatcher();
    expect(src).toContain('type SpecialistType');
    expect(src).toContain('"academic"');
    expect(src).toContain('"technical"');
    expect(src).toContain('"generalist"');
  });

  it("should implement domain detection logic in detectSpecialist", () => {
    const src = readDispatcher();
    const detectFunction = src.substring(
      src.indexOf('export function detectSpecialist'),
      src.indexOf('export function', src.indexOf('export function detectSpecialist') + 1) || src.length
    );
    // Should look for academic keywords
    expect(detectFunction).toMatch(/academic|research|paper|study/i);
    // Should look for technical keywords
    expect(detectFunction).toMatch(/technical|implement|code|api|programming/i);
  });

  it("should have specialist implementations in specialists directory", () => {
    const files = listSpecialistFiles();
    expect(files.length).toBeGreaterThan(0);
    // Should have at least academic and technical specialists
    const fileNames = files.join(' ');
    expect(fileNames).toMatch(/academic/i);
    expect(fileNames).toMatch(/technical/i);
  });
});

// ---------------------------------------------------------------------------
// AC-2: Academic query submitted → Domain detected → Academic specialist generates academic-focused report
// ---------------------------------------------------------------------------
describe("AC-2: Academic specialist generates academic-focused report", () => {
  it("should have academic specialist implementation", () => {
    const files = listSpecialistFiles();
    const academicFile = files.find(f => f.match(/academic/i));
    expect(academicFile).toBeTruthy();
  });

  it("should export executeAcademicResearch function", () => {
    const files = listSpecialistFiles();
    const academicFile = files.find(f => f.match(/academic/i));
    if (!academicFile) throw new Error('Academic specialist file not found');

    const academicPath = path.join(specialistsPath, academicFile);
    const src = fs.readFileSync(academicPath, 'utf-8');
    expect(src).toMatch(/export.*execute.*academic/i);
  });

  it("should generate reports with academic-specific fields", () => {
    const files = listSpecialistFiles();
    const academicFile = files.find(f => f.match(/academic/i));
    if (!academicFile) throw new Error('Academic specialist file not found');

    const academicPath = path.join(specialistsPath, academicFile);
    const src = fs.readFileSync(academicPath, 'utf-8');
    // Should include academic-specific report fields
    expect(src).toMatch(/citation|peer.?review|scholarly|journal|abstract/i);
  });

  it("should log improvements when academic specialist runs", () => {
    const files = listSpecialistFiles();
    const academicFile = files.find(f => f.match(/academic/i));
    if (!academicFile) throw new Error('Academic specialist file not found');

    const academicPath = path.join(specialistsPath, academicFile);
    const src = fs.readFileSync(academicPath, 'utf-8');
    // Should call improvement logging
    expect(src).toMatch(/improvements|logImprovement/i);
  });
});

// ---------------------------------------------------------------------------
// AC-3: Technical query submitted → Domain detected → Technical specialist generates technical report
// ---------------------------------------------------------------------------
describe("AC-3: Technical specialist generates technical report", () => {
  it("should have technical specialist implementation", () => {
    const files = listSpecialistFiles();
    const technicalFile = files.find(f => f.match(/technical/i));
    expect(technicalFile).toBeTruthy();
  });

  it("should export executeTechnicalResearch function", () => {
    const files = listSpecialistFiles();
    const technicalFile = files.find(f => f.match(/technical/i));
    if (!technicalFile) throw new Error('Technical specialist file not found');

    const technicalPath = path.join(specialistsPath, technicalFile);
    const src = fs.readFileSync(technicalPath, 'utf-8');
    expect(src).toMatch(/export.*execute.*technical/i);
  });

  it("should generate reports with technical-specific fields", () => {
    const files = listSpecialistFiles();
    const technicalFile = files.find(f => f.match(/technical/i));
    if (!technicalFile) throw new Error('Technical specialist file not found');

    const technicalPath = path.join(specialistsPath, technicalFile);
    const src = fs.readFileSync(technicalPath, 'utf-8');
    // Should include technical-specific report fields
    expect(src).toMatch(/implementation|code.?sample|api.?reference|architecture/i);
  });

  it("should log improvements when technical specialist runs", () => {
    const files = listSpecialistFiles();
    const technicalFile = files.find(f => f.match(/technical/i));
    if (!technicalFile) throw new Error('Technical specialist file not found');

    const technicalPath = path.join(specialistsPath, technicalFile);
    const src = fs.readFileSync(technicalPath, 'utf-8');
    // Should call improvement logging
    expect(src).toMatch(/improvements|logImprovement/i);
  });
});

// ---------------------------------------------------------------------------
// AC-4: No clear domain → Query ambiguous → Generalist agent handles query
// ---------------------------------------------------------------------------
describe("AC-4: Generalist handles ambiguous queries", () => {
  it("should default to generalist when no domain detected", () => {
    const src = readDispatcher();
    const detectFunction = src.substring(
      src.indexOf('export const detectSpecialist'),
      src.indexOf('export const', src.indexOf('export const detectSpecialist') + 1) || src.length
    );
    // Should return generalist as default
    expect(detectFunction).toMatch(/generalist|default.*general/i);
  });

  it("should maintain backward compatibility with existing research", () => {
    const src = readResearchActions();
    // Existing research actions should still work
    expect(src).toContain('startDeepResearch');
    expect(src).toContain('startSimpleResearch');
  });
});
