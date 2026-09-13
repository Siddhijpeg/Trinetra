# Frontend Data Requirements

This document outlines the expected data schemas and fields required by the TRINETRA frontend. During the current frontend-first phase, these are provided via mock data (`src/data/`) and the `prototypeService.ts` layer.

In the next phase, the FastAPI backend must implement endpoints that return data conforming to these schemas.

## Core Entities

### 1. CASE
Represents a reported cybercrime complaint.

| Field | Type | Description |
|-------|------|-------------|
| `caseId` | `string` | Unique identifier (e.g., NCRP-26-81942) |
| `fraudType` | `string` | Category of fraud (e.g., Investment Scam, Digital Arrest) |
| `amount` | `string` / `number` | The monetary value at risk/defrauded |
| `complaintTime` | `string` (ISO 8601) | Timestamp of the complaint |
| `victimDistrict` | `string` | Originating location of the victim/complaint |
| `status` | `string` | Lifecycle status (Active, In Review, Investigating, Resolved) |

### 2. TRANSACTION HOP
Represents a hop in the money trail.

| Field | Type | Description |
|-------|------|-------------|
| `hopId` | `string` | Unique identifier for the transaction hop |
| `caseId` | `string` | Associated case ID |
| `hopIndex` | `number` | Sequential order (1, 2, 3...) |
| `fromAccount` | `string` | Masked source account identifier |
| `toAccount` | `string` | Masked destination account identifier |
| `amount` | `number` | Amount transferred |
| `timestamp` | `string` (ISO 8601) | Time of the transaction |
| `bank` | `string` | Facilitating institution |
| `channel` | `string` | Method (e.g., IMPS, NEFT, UPI) |

### 3. ACCOUNT (Mule / Beneficiary)
Represents a financial entity involved in the fraud network.

| Field | Type | Description |
|-------|------|-------------|
| `accountId` | `string` | Unique identifier (masked) |
| `accountType` | `string` | Classification (Mule, Beneficiary, Victim) |
| `timesFlagged` | `number` | Number of times appearing in previous cases |
| `associatedCases` | `string[]` | List of associated case IDs |
| `bank` | `string` | Maintaining institution |
| `geographicSignals` | `object[]` (Optional)| Last known locations (IP, ATM usage) |

### 4. ZONE
Represents a geographic region (typically sub-district/district level).

| Field | Type | Description |
|-------|------|-------------|
| `zoneId` | `string` | Unique identifier |
| `district` | `string` | District name |
| `state` | `string` | State name |
| `lat` | `number` | Latitude coordinate |
| `lng` | `number` | Longitude coordinate |

### 5. PREDICTION
Represents the model's output for a given case at a specific time.

| Field | Type | Description |
|-------|------|-------------|
| `caseId` | `string` | Associated case ID |
| `rankedZones` | `string[]` | Ordered list of candidate zone IDs |
| `currentTopZone` | `string` | The highest-probability zone ID |
| `confidence` | `number` | Model confidence score (0-100) |
| `predictionStage` | `string` | Current inference stage (Prior, Hop1, etc.) |
| `timestamp` | `string` (ISO 8601) | When the prediction was generated |

### 6. PREDICTION EVOLUTION
Represents the sequential Bayesian update lifecycle.

| Field | Type | Description |
|-------|------|-------------|
| `stage` | `number` | Index of the evolution stage |
| `evidenceReceived` | `string` | The trigger (e.g., 'Hop 2 transaction detected') |
| `zoneProbabilityDistribution` | `Record<string, number>` | Probabilities for candidate zones |
| `topZone` | `string` | Highest probability zone ID at this stage |
| `confidence` | `number` | Updated confidence score |

### 7. RECOVERABILITY
Represents the decision engine's evaluation of cash-out likelihood vs intervention time.

| Field | Type | Description |
|-------|------|-------------|
| `score` | `number` | Recoverability index (0-100) |
| `elapsedMinutes` | `number` | Time since complaint/transaction |
| `estimatedCashoutWindow` | `number` | Total predicted window (minutes) |
| `remainingMinutes` | `number` | Remaining actionable window |
| `recommendedAction` | `string` | System recommendation (e.g., 'Auto-Alert', 'Manual Review') |

### 8. ALERT
Represents an actionable intelligence alert generated for officers/banks.

| Field | Type | Description |
|-------|------|-------------|
| `alertId` | `string` | Unique identifier |
| `caseId` | `string` | Associated case ID |
| `predictedZone` | `string` | The high-risk zone ID |
| `confidence` | `number` | Prediction confidence |
| `recoverability` | `number` | Associated recoverability score |
| `severity` | `string` | Critical, High, Medium, Low |
| `status` | `string` | Unacknowledged, Actioned, Closed |
| `recommendedAction` | `string` | Immediate step required |

### 9. OUTCOME
Represents the ground-truth resolution of a case, used for the feedback loop.

| Field | Type | Description |
|-------|------|-------------|
| `alertId` | `string` | Associated alert ID |
| `fundsFrozen` | `number` | Amount successfully frozen |
| `fundsRecovered` | `number` | Amount successfully recovered to victim |
| `falseAlert` | `boolean` | Whether the prediction was incorrect |
| `noAction` | `boolean` | Whether intervention failed or wasn't taken |
| `actualCashoutZone` | `string` | Ground truth cash-out location |
| `actualCashoutTime` | `string` (ISO 8601) | Ground truth cash-out time |
