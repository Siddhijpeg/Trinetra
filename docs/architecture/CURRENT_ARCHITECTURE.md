# Current Architecture (Prototype State)

The current TRINETRA repository operates as an offline prototype connecting a React-based frontend to statically generated machine learning artifacts.

## Architecture Diagram

```mermaid
graph TD
    UI[Nisha React Frontend] --> MockData[src/data/mock*.ts]
    UI -->|Direct API Key| LLM[Google Gemini API]
    
    ML[ML Python Scripts] -->|Read| Data[data/synthetic/ CSVs]
    ML -->|Write| JSON[Artifact JSONs]
    
    style UI fill:#bbf,stroke:#333
    style LLM fill:#f9f,stroke:#333
    style ML fill:#bfb,stroke:#333
    style Data fill:#eee,stroke:#333
    style MockData fill:#fdd,stroke:#333
```

### Components
1. **Frontend**: A React/Vite SPA providing the complete TRINETRA visual experience (Command Center, Copilot, Geo Intelligence). It reads entirely from static TS/JSON mock files.
2. **AI Copilot**: Calls Google Gemini directly from the browser using a local API key. Currently lacks dynamic backend context (RAG).
3. **ML Pipeline**: Python scripts (`ml/geographic`, `ml/timing`) that process synthetic CSV data and output evaluation metrics and payload JSONs. Runs purely offline.
