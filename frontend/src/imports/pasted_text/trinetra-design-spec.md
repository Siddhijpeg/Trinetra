Design a complete, high-fidelity desktop web application frontend for an AI-powered cybercrime intelligence platform called “TRINETRA”.

PRODUCT:
TRINETRA is a predictive cybercrime intelligence platform designed for Indian law-enforcement agencies, cybercrime investigators, I4C-type command centres, and authorised banking/financial stakeholders.

Its purpose is to move cyber-fraud investigation from reactive response to proactive intervention.

The platform analyses:
- cybercrime complaints
- fraudulent transaction trails
- mule-account relationships
- historical withdrawal behaviour
- geographical and temporal patterns
- ATM/branch cash-out hotspots
- verified news/public web/social-media intelligence

It then predicts:
1. WHERE fraudulent money is most likely to be withdrawn
2. WHEN the withdrawal is likely to occur
3. WHICH linked accounts / locations / entities contribute to the risk
4. WHY the model generated that prediction

The system also includes:
- Fraud Graph Intelligence
- GIS Risk Mapping
- OSINT Evidence Verification
- Explainable AI
- Automated Alerts
- AI Investigator Copilot

===========================================================
DESIGN LANGUAGE / VISUAL THEME
===========================================================

The UI must visually belong to the same enterprise SaaS design family as the SutraAI Customer Health Intelligence (CHI) Agent.

IMPORTANT:
Do NOT make this look like a cliché cybersecurity application.
Do NOT use neon green hacker aesthetics.
Do NOT use Matrix-style backgrounds.
Do NOT make the entire product black/dark.

Use a sophisticated enterprise AI dashboard visual language.

STYLE:

- Dark charcoal / near-black left navigation sidebar
- Bright white / very light off-white main workspace
- Teal as the primary action and active-state color
- Purple / violet for AI-generated insights, Copilot, intelligence and model outputs
- Soft grey for secondary information
- Red only for genuinely critical/high-risk cyber alerts
- Amber/orange for medium-risk warnings
- Green/teal for verified/safe/resolved states

Use:
- rounded cards
- approximately 12–16px corner radius
- very subtle shadows
- thin neutral borders
- generous white space
- modern sans-serif typography
- clean iconography
- compact professional data tables
- subtle gradients only for AI-specific elements
- polished B2B SaaS appearance
- visually similar to modern enterprise platforms such as Linear, Stripe dashboards, Palantir-style intelligence interfaces and modern AI SaaS products, but retain the SutraAI/CHI visual identity

AI elements should use a subtle purple-to-indigo gradient.
Primary buttons should be teal.
Cards should remain predominantly white.

Do not overuse gradients.

===========================================================
GLOBAL APP SHELL
===========================================================

Create a persistent desktop application shell.

LEFT SIDEBAR:
Dark charcoal background.

At top:
TRINETRA logo/icon
TRINETRA
small subtitle: “Cyber Intelligence”

Navigation:

01. Command Center
02. Cases
03. Prediction Engine
04. Geo Intelligence
05. Fraud Network
06. OSINT Intelligence
07. Alerts
08. AI Copilot
09. Reports

Divider

10. Data Sources
11. Model Monitor
12. Audit Logs

Bottom:
Settings
Help & Documentation

User card:
Aarav Mehta
Cyber Intelligence Analyst
Authorised Access

Use simple outline icons for every menu item.

Active navigation item should have:
- subtle teal tinted background
- teal icon
- white or bright label depending on sidebar style
- slim teal accent bar

===========================================================
TOP BAR
===========================================================

White top navigation bar.

Include:

Breadcrumb:
TRINETRA / Command Center

Large global search:
“Search case ID, account, phone, UPI ID, ATM, district…”

Keyboard shortcut hint:
⌘ K

Right side:
Data Sync indicator
“Live • Updated 2 min ago”

Notification bell with small red badge

AI Copilot shortcut button

Profile/avatar

===========================================================
SCREEN 1 — COMMAND CENTER / EXECUTIVE DASHBOARD
===========================================================

This is the main landing dashboard.

Header:

“Cyber Intelligence Command Center”

Subheading:
“Real-time predictive intelligence across fraud cases, financial networks and cash-out hotspots.”

Right side:
date range selector
“Last 24 Hours”
button: “New Investigation”

FIRST ROW — KPI CARDS

Create 5 premium KPI cards:

1. Active Fraud Cases
   1,284
   +8.4% today

2. Amount at Risk
   ₹18.6 Cr
   Across active cases

3. High-Risk Cash-Out Zones
   27
   6 newly detected

4. Preventive Alerts
   143
   89 acknowledged

5. Model Prediction Accuracy
   86.4%
   +2.7% vs previous period

Use tiny sparklines where appropriate.

===========================================================
MAIN DASHBOARD MAP
===========================================================

Create a large card titled:

“Predictive Cash-Out Risk Map”

Use a stylized interactive India map.

Show geospatial hotspots using:
- soft red heat regions = high risk
- amber = medium
- teal = low risk

Place example hotspots around:
Delhi NCR
Mumbai
Jaipur
Lucknow
Kolkata
Bengaluru
Hyderabad

Add a floating legend:
Low
Moderate
High
Critical

Above map provide filters:

Fraud Type
Risk Level
State
Bank
Time Window

Add toggle:

[ Live Risk ] [ Historical ]

When a hotspot is selected, show floating contextual panel:

DELHI NCR – CLUSTER 04

Risk Score: 0.87 HIGH

Likely Cash-Out Window:
42–110 minutes

Amount Exposed:
₹32.4 lakh

Linked Cases:
17

Linked Mule Accounts:
9

Primary Signals:
- recurring ATM behaviour
- high transaction velocity
- linked mule-account cluster
- historical regional similarity

Button:
“Open Intelligence View”

===========================================================
DASHBOARD RIGHT COLUMN — PRIORITY INTELLIGENCE
===========================================================

Card:
“Priority Interventions”

Rows:

Case NCRP-26-81942
₹4.8L
Gurugram
Cash-out probability 91%
CRITICAL

Case NCRP-26-81773
₹2.2L
Noida
Probability 84%
HIGH

Case NCRP-26-81895
₹7.1L
Jaipur
Probability 79%
HIGH

Add tiny countdown:
“Predicted window: 56 min”

Button:
View All Alerts

===========================================================
SECOND DASHBOARD ROW
===========================================================

CARD 1:
“Fraud Type Distribution”

Donut chart:
Investment Scam – 32%
UPI Fraud – 26%
Impersonation – 18%
Digital Arrest – 13%
Others – 11%

CARD 2:
“Cash-Out Risk Trend”

Line chart:
hourly predicted high-risk cases across last 24 hours

CARD 3:
“AI Intelligence Summary”

This card should visually resemble the purple AI summary banner/card style used in the CHI Agent.

Use a subtle purple gradient header and AI sparkle icon.

Text:

“TRINETRA Intelligence”

“18 emerging withdrawal clusters were detected in the last 6 hours. Delhi NCR and Jaipur show unusually high convergence between mule-account activity and historical ATM cash-out behaviour.”

Include:
“Generated 4 min ago”

Button:
“Ask Copilot”

===========================================================
SCREEN 2 — CASES
===========================================================

Create a detailed case-management page.

Title:
“Cybercrime Cases”

Subtitle:
“Investigate complaints and prioritise cases using predictive risk intelligence.”

Top filters:
Search
Fraud type
State
Risk
Amount
Date
Investigation status

Table columns:

Case ID
Complaint Type
Reported
Amount
Source Location
Predicted Cash-Out
Risk Score
Status
Investigator

Example data:

NCRP-26-81942
Investment Fraud
12 min ago
₹4.8L
Delhi
Gurugram
91 / 100
Critical
A. Mehta

NCRP-26-81911
Digital Arrest
31 min ago
₹9.4L
Lucknow
Jaipur
86 / 100
High
R. Sharma

Use colored risk pills.

Clicking a case opens Case Workspace.

===========================================================
SCREEN 3 — CASE INVESTIGATION WORKSPACE
===========================================================

This should be the most impressive investigation screen.

Top header:

Case NCRP-26-81942

CRITICAL badge

“Investment Fraud • ₹4,80,000”

Status:
Active Investigation

Buttons:
Generate Report
Create Alert
Share with Bank
More

Create three-column/section layout.

-----------------------------------------------------------
CASE SNAPSHOT
-----------------------------------------------------------

Cards:

Complaint Received
13:42 IST

Victim Location
New Delhi

Fraud Amount
₹4.8 lakh

Transaction Hops
4

Linked Accounts
7

Model Risk Score
91 / 100

Predicted Cash-Out:
Gurugram Sector 29

Estimated Time:
14:28 – 15:32 IST

-----------------------------------------------------------
AI PREDICTION CARD
-----------------------------------------------------------

Large prominent card:

“TRINETRA Prediction”

Use purple AI treatment.

91%
HIGH CONFIDENCE

“Gurugram Sector 29 ATM Cluster”

Estimated cash-out:
46–110 minutes

Explainability section:

Why this prediction?

+29%
Three linked accounts previously associated with NCRP fraud trails

+23%
Transaction velocity matches known cash-out pattern

+18%
Destination account geographically associated with Gurugram cluster

+13%
Similar fraud cases cashed out within 90 minutes

+8%
OSINT corroboration signal

Visualize each factor using horizontal contribution bars.

Button:
“View Model Explanation”

===========================================================
CASE TIMELINE
===========================================================

Vertical event timeline:

13:42
Complaint registered

13:47
₹1.8L transferred to Account A

13:51
₹1.4L transferred A → Mule B

13:54
₹1.1L transferred B → Mule C

13:58
Account C linked to historical fraud network

14:01
TRINETRA prediction generated

14:03
High-risk cash-out alert triggered

Use icons and clear timestamps.

===========================================================
SCREEN 4 — FRAUD NETWORK / GRAPH INTELLIGENCE
===========================================================

Create a sophisticated fraud network visualization.

Title:
“Fraud Network Intelligence”

Subheading:
“Trace relationships across complaints, accounts, beneficiaries and cash-out infrastructure.”

Center canvas:
Interactive node graph.

Node types:

Victim
Complaint
Bank Account
Mule Account
UPI ID
Phone Number
ATM
Bank Branch
Location
Known Fraud Cluster

Use subtle category colors.

Do NOT make graph visually chaotic.

Highlight one suspicious route:

Victim
→ Account A
→ Mule B
→ Mule C
→ Gurugram ATM Cluster

Right contextual sidebar:

Selected Entity
Mule Account • XXXX9234

Risk:
92 HIGH

Seen in:
17 cases

Total Flow:
₹31.6L

Known Withdrawal Regions:
Gurugram
Noida
Jaipur

First Seen:
18 Aug 2026

Last Seen:
6 Sep 2026

Connections:
23

AI Insight:

“This account acts as an intermediary hub across 4 otherwise disconnected fraud clusters.”

Button:
Investigate Connections

Top graph controls:
Depth
Time window
Risk threshold
Transaction amount
Entity type

===========================================================
SCREEN 5 — GEO INTELLIGENCE
===========================================================

Full geospatial analysis workspace.

Large India / city map.

Title:
“Geospatial Cash-Out Intelligence”

Left control panel:

Layer controls:
✓ Predicted Hotspots
✓ ATM Locations
✓ Historical Withdrawals
✓ Active Cases
✓ Mule Account Locations
□ Bank Branches
□ OSINT Signals

Filters:
Risk threshold
Time horizon
Fraud type
Financial institution

Prediction horizon selector:
30 min
1 hour
2 hours
6 hours
24 hours

Right panel:

“Top Predicted Zones”

1. Gurugram Sector 29
Risk 92%
13 linked active cases

2. Noida Sector 18
Risk 86%
9 linked cases

3. Jaipur Central
Risk 81%
7 linked cases

Include “Why this area?” expandable explanation.

===========================================================
SCREEN 6 — OSINT INTELLIGENCE
===========================================================

This is one of TRINETRA’s major USPs.

Title:
“OSINT Evidence & Credibility Intelligence”

Subtitle:
“Verify open-source signals before incorporating them into investigative intelligence.”

At top:

Public Signals Analysed
12,482

Verified Signals
8,914

Potential Misinformation
742

Emerging Fraud Narratives
18

Create a feed of incoming public intelligence signals.

Example:

SOURCE:
Verified News Outlet

Headline:
“Police identify new digital-arrest scam operating through mule accounts in NCR”

Location:
Delhi NCR

Credibility:
96 / 100 VERIFIED

Corroborated by:
5 independent sources

-----------------------------------------------------------

SOURCE:
Public Social Signal

Text:
“Multiple users reporting fraudulent investment scheme linked to…”

Credibility:
72 / 100 PARTIALLY VERIFIED

Location:
Jaipur

Signals:
3 independent reports
account age verified
location consistency medium

-----------------------------------------------------------

SOURCE:
Social Media

Claim:
“Major bank hacked, all customer accounts affected”

Credibility:
18 / 100 LIKELY MISLEADING

Reasons:
No trusted corroboration
Repeated image from unrelated 2024 event
Source reliability low

Button:
View Evidence Chain

===========================================================
OSINT VERIFICATION PIPELINE VISUAL
===========================================================

Create a horizontal process graphic:

Public Signal
→ Source Analysis
→ Duplicate Detection
→ Cross-Source Corroboration
→ Location / Time Validation
→ Content Verification
→ Credibility Score
→ Investigator Review

Include note:

“OSINT signals are supporting intelligence and are never treated as independently verified legal evidence.”

===========================================================
SCREEN 7 — ALERT CENTER
===========================================================

Title:
“Proactive Intervention Alerts”

Tabs:
All
Critical
High
Acknowledged
Resolved

Critical alert card:

CRITICAL CASH-OUT RISK

Case NCRP-26-81942

Predicted Zone:
Gurugram Sector 29

Risk:
91%

Expected Window:
46–110 minutes

Amount at Risk:
₹4.8L

Relevant Bank:
ABC Bank

Actions:

Notify Bank
Notify LEA
Open Investigation
Mark Acknowledged

Timeline:
Prediction generated
Alert issued
Bank notified
LEA acknowledged

===========================================================
SCREEN 8 — AI INVESTIGATOR COPILOT
===========================================================

Create an AI Copilot workspace inspired by the AI recommendation/copilot areas of the SutraAI CHI Agent.

Purple gradient AI header.

Title:
“TRINETRA Copilot”

Subtitle:
“Ask questions across cases, fraud networks, predictions and verified intelligence.”

Suggested prompts:

“Show all cases linked to account XXXX9234.”

“Why is Gurugram Sector 29 currently high risk?”

“Find common entities across today’s digital-arrest complaints.”

“Which active cases have a >80% cash-out probability?”

“Summarise Case NCRP-26-81942 for an investigating officer.”

Main chat example:

USER:
Why was Gurugram selected for Case NCRP-26-81942?

AI:

“Gurugram Sector 29 received a 91% cash-out risk score based on four primary signals:

1. Two accounts in the transaction trail are connected to previous withdrawals in this cluster.
2. The transaction timing matches a recurring 45–120 minute cash-out pattern.
3. Similar investment-fraud cases have converged geographically in the same region.
4. Three verified OSINT signals indicate recent mule-account activity in the broader NCR region.

Confidence: High”

Then show clickable source chips:
Transaction Graph
Historical Cases
Geo Model
OSINT Evidence

Buttons:
Open Evidence
Generate Brief
Create Alert

IMPORTANT:
The AI should always cite internal evidence and confidence.
Avoid presenting chatbot answers as unsupported facts.

===========================================================
SCREEN 9 — PREDICTION ENGINE
===========================================================

Title:
“Prediction Engine”

Create model monitoring + prediction interface.

Top model:
TRINETRA Cash-Out Predictor v1.4

Status:
Operational

Cards:

Prediction Accuracy
86.4%

Top-3 Zone Recall
91.7%

Median Distance Error
3.8 km

False Alert Rate
8.2%

Prediction Latency
420 ms

Create chart:
Actual vs Predicted cash-out location performance over time.

Create:
Risk calibration chart.

Section:
“Recent Predictions”

Case
Predicted Region
Actual / Outcome
Confidence
Distance Error

Also include:
Model Drift
Data Drift
Last Retrained
Feature Health

===========================================================
SCREEN 10 — DATA SOURCES
===========================================================

Title:
“Connected Intelligence Sources”

Cards:

NCRP Case Data
CONNECTED

Financial Transaction Feed
CONNECTED

Bank Alert API
CONNECTED

GIS / ATM Database
CONNECTED

OSINT News Feeds
CONNECTED

Public Web Sources
CONNECTED

Approved Social Signals
LIMITED

Historical Fraud Dataset
CONNECTED

For every connection show:
status
last sync
records processed
data classification

Include button:
“Manage Sources”

===========================================================
SCREEN 11 — REPORTS
===========================================================

Title:
“Intelligence Reports”

Generate:
Case Intelligence Brief
Fraud Network Report
Cash-Out Prediction Report
Hotspot Analysis
OSINT Verification Report
Daily Command Center Brief

Report card example:

CASE INTELLIGENCE BRIEF
NCRP-26-81942

Generated:
14:16 IST

Includes:
Case Summary
Transaction Trail
Risk Prediction
Model Explanation
Network Connections
OSINT Evidence
Intervention History

Buttons:
Preview
Export PDF
Share Securely

===========================================================
SCREEN 12 — SECURITY & AUDIT
===========================================================

Title:
“Security & Audit”

Cards:

Active Users
43

Privileged Sessions
7

Failed Access Attempts
2

Sensitive Record Views
184

Audit table:

Timestamp
Officer
Action
Case
Resource
IP / Device
Result

Example:

14:03
Aarav Mehta
VIEW_CASE
NCRP-26-81942
Financial Trail
Authorised

Include:
Role Based Access Control
Data Encryption
Audit Trails
PII Masking
Secure API Access
Session Monitoring

Show security status:
“All critical controls operational.”

===========================================================
INTERACTION DESIGN
===========================================================

Create realistic interactions/prototype states:

1. Clicking a hotspot opens its intelligence panel.
2. Clicking a case opens the detailed case workspace.
3. Clicking a fraud-network node opens its entity profile.
4. Clicking “Why this prediction?” expands explainability.
5. OSINT evidence can be expanded to show corroborating sources.
6. User can send a high-risk prediction to authorised bank/LEA workflows.
7. AI Copilot can open the underlying case/graph/map from its response.
8. Filters should dynamically update maps and tables.
9. Critical alerts should be visually prominent but not overwhelming.
10. Tooltips should explain model confidence and risk scores.

===========================================================
DESIGN COMPONENTS
===========================================================

Create reusable components for:

- navigation sidebar
- top navigation
- KPI metric cards
- AI insight card
- confidence score gauge
- risk badge
- case row
- alert row
- evidence chip
- entity chip
- transaction node
- timeline event
- map hotspot
- filter dropdown
- search bar
- empty state
- loading state
- error state
- permission restricted state
- modal
- drawer
- toast notification
- tabs
- segmented controls
- data table pagination
- AI Copilot input

===========================================================
COLOR SYSTEM
===========================================================

Use an enterprise palette consistent with SutraAI CHI.

Main workspace:
#FFFFFF / near-white

App background:
very light cool grey around #F7F8FA

Sidebar:
deep charcoal around #15171A / #17191D

Primary teal:
approximately #18A999 / #14B8A6

Teal hover:
slightly deeper teal

AI purple:
approximately #7C5CFC

AI gradient:
soft violet → indigo

Critical:
#E5484D style muted professional red

High risk:
red / coral

Medium risk:
warm amber

Low risk / verified:
teal / muted green

Primary text:
near-black / charcoal

Secondary text:
neutral grey

Borders:
very light grey

Do not make saturated colors dominate the interface.

===========================================================
TYPOGRAPHY
===========================================================

Use a clean modern sans-serif similar to:
Inter
Geist
or equivalent.

Hierarchy:

Page title:
28–32px semibold

Section heading:
18–20px semibold

Card title:
14–16px medium/semibold

Metric:
28–36px bold/semibold

Body:
14px regular

Metadata:
12–13px

Keep typography extremely clean and enterprise-focused.

===========================================================
RESPONSIVENESS
===========================================================

Primary design:
Desktop 1440px width.

Also create responsive adaptation for:
- 1280px laptop
- tablet investigation view

The platform is primarily an enterprise command-center desktop product, so prioritize desktop information density.

===========================================================
OVERALL EXPERIENCE
===========================================================

The final application should feel like:

“SutraAI’s CHI Agent evolved into a secure national cybercrime intelligence command center.”

It should visually communicate:
TRUST
INTELLIGENCE
CONTROL
PREDICTION
EVIDENCE
SECURITY

Do not make it theatrical or futuristic.

It must feel like software that a serious government cybercrime analyst could actually use every day.

The most visually impressive screens should be:

1. Command Center
2. Case Investigation Workspace
3. Fraud Network
4. Geo Intelligence
5. OSINT Intelligence
6. AI Investigator Copilot

Maintain visual consistency across every screen.

Use realistic dummy data instead of Lorem Ipsum.
Use Indian locations, INR amounts and cybercrime terminology.