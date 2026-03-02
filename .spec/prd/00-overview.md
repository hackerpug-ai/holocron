# Holocron Mobile Research Interface

## Product Description

A React Native mobile application that provides on-the-go access to the holocron knowledge base and research capabilities. The app enables users to query existing research articles, conduct new research (basic and deep), and save findings back to holocron—all with the same fidelity as the native Claude Code skill-based research workflow.

**Problem Statement:** Research workflows are currently tied to the Claude Code CLI environment. When away from a development workstation, there's no way to query the holocron knowledge base, conduct research on questions that arise, or leverage the accumulated knowledge artifacts.

**Solution:** Migrate the agentic research logic to server-side Supabase Edge Functions, enabling the React Native mobile client to invoke the same research workflows remotely. The mobile app becomes a lightweight client that displays results and manages research sessions while the heavy lifting happens server-side.
