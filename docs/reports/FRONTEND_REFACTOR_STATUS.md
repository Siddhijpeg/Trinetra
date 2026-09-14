# TRINETRA Frontend Refactor Status

This document outlines the current state of the frontend implementation after the approved refactoring phase.

## What is Real (Data/Implementation)

The following components represent real assets or functioning logic:

- **Synthetic CSV Dataset**: An existing baseline synthetic dataset is available in the repository.
- **Geospatial Coordinates**: The `react-leaflet` map implementation uses real Indian lat/lng coordinates derived from the current zones dataset.
- **Frontend State Management**: The sequential update flows (e.g. Case Workspace) are governed by real React state mechanics.
- **Reference-Class Baseline Model**: The repository contains the initial Python file for the baseline predictor.

## What is Frontend-Simulated (Prototype Mode)

The current UI visually demonstrates intended behaviors that are **not yet** driven by a live backend API or trained ML model. These are strict frontend simulations designed for demonstration, validation, and aligning the UI with the final intended product flow:

- **Sequential Bayesian Update**: The visual narrowing of the prediction zone from Hop 1 to Hop 2 is simulated using localized React state.
- **Confidence Evolution**: The risk score and confidence changes are hardcoded for specific demonstration cases.
- **Recoverability & Decision Engine**: The sliding windows, elapsed time bars, and automated decision recommendations are currently static or simulated locally.
- **Risk Registry Signal**: The "Persistent Risk Entity" highlights (e.g., cross-complaint mule hubs) are driven by mock data.
- **Real-time Alerts**: The Alert Center feed is populated from a static mock dataset.
- **OSINT Verification**: Credibility scores and evidence chains are mock data meant to illustrate the UX of future scraping and NLP pipelines.
- **AI Investigator Copilot**: Responses are a mix of hardcoded messages and localized prompt-matching. No LLM integration is active.
- **Feedback-Based Recalibration**: The Outcome state (Funds Frozen/Recovered) registers visually but does not yet trigger a database update or model retraining cycle.
- **Authentication Flow**: The login screen is a client-side route guard, not a secure authentication integration.

## Constraints Adhered To

- **Frontend-First**: No FastAPI backend or database was constructed during this phase.
- **Zero Fake Metrics**: The Prediction Engine Dashboard was cleared of misleading baseline accuracy numbers. It correctly presents as a "development pipeline" awaiting model integration.
- **Aesthetic Direction**: Maintained a clean, Enterprise-SaaS B2B design language prioritizing whitespace and clarity.
- **Clean Mock Abstraction**: Mock arrays have been removed from `.tsx` components and grouped in `src/data/`, accessed via `src/services/prototypeService.ts` to allow an easy swap to real endpoints.
