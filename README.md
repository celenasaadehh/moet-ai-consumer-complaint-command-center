# MOET AI Consumer Complaint Command Center

An AI-assisted consumer complaint triage prototype designed around consumer-protection workflows for Lebanon's Ministry of Economy and Trade (MOET).

The project combines a citizen-facing complaint portal with an internal dashboard for reviewing and prioritizing complaints. Complaint text is processed by a machine-learning pipeline that predicts a complaint category, extracts risk signals, applies establishment-level risk rules, and assigns an explainable priority score.

> **Project status:** Prototype / demonstration project. This repository is not an official website, service, or software product of Lebanon's Ministry of Economy and Trade.

> **Public data:** The CSV and JSON records included in this public-safe version are synthetic demonstration data. The organizer-provided hackathon raw datasets are not redistributed here. See [`DATA_NOTICE.md`](DATA_NOTICE.md).

## Overview

The project explores how consumer complaints can be organized and prioritized more efficiently before human review.

The current prototype includes:

- A **citizen portal** for submitting consumer complaints
- A **machine-learning triage pipeline** for complaint classification and priority scoring
- An **employee dashboard** for reviewing complaint data, model reasoning, risk levels, and complaint trends
- Establishment matching and GREEN / YELLOW / RED risk-zone logic
- Partial **Appwrite** integration for database-backed complaint-management operations

## Core Functionality

### Citizen Portal

The React frontend provides a complaint form where a user can submit:

- Complaint text
- Establishment
- Province
- Citizen-selected priority
- Additional complaint information collected by the interface

For the active triage flow, the backend sends the complaint text, establishment name, and citizen-selected priority to the Python classification pipeline.

### Machine-Learning Triage

The active ML pipeline is located in `backend/python/`.

Complaint text is encoded using the Sentence Transformers model:

`paraphrase-multilingual-MiniLM-L12-v2`

A logistic-regression classifier then predicts one of five complaint categories:

- `food_safety`
- `hygiene`
- `licensing`
- `price_fraud`
- `service_quality`

The triage pipeline also detects explainable risk signals in the complaint text, including:

- Health symptoms
- Medical attention
- Multiple people affected
- Vulnerable individuals
- Dangerous products or conditions
- Expired or spoiled goods
- Hygiene violations
- Fraud or financial harm
- Licensing or regulatory concerns
- Refusal or obstruction
- Supporting evidence
- Ongoing public exposure

These signals contribute to a content-severity score.

### Establishment Risk Rules

Complaints are matched to establishment records stored in CSV data.

The establishment's risk zone is incorporated into the final triage score:

- **GREEN** — complaint remains LOW or MEDIUM
- **YELLOW** — minimum MEDIUM priority
- **RED** — minimum HIGH priority
- Serious complaints involving a RED-zone establishment can be escalated to **CRITICAL**

Final priority levels are:

- `LOW`
- `MEDIUM`
- `HIGH`
- `CRITICAL`

The pipeline also generates:

- Classification confidence
- Risk-signal breakdown
- Triage reasoning
- Recommended follow-up action
- Manual-review flag for low-confidence or unmatched cases

### Employee Dashboard

The employee-facing React interface includes:

- Priority-sorted complaint queue
- Search and filtering
- Complaint detail view
- ML triage reasoning
- Priority score and category display
- Citizen-vs-model priority mismatch detection
- Inspector-assignment interface
- Complaint status controls
- Daily summary statistics
- Complaint charts by priority, category, and province
- Lebanon complaint-activity map

The current employee login is a **demo-only frontend login** and is not production authentication.

## Model Evaluation

The repository includes evaluation results for the saved development model.

| Metric | Result |
| --- | ---: |
| Dataset size | 1,000 complaints |
| Training set | 800 complaints |
| Test set | 200 complaints |
| Accuracy | 94.5% |
| Macro F1 | 0.946 |
| Weighted F1 | 0.945 |

These saved metrics were produced during hackathon development using the organizers' provided dataset. The organizer-provided raw dataset is not included in this public-safe repository; the CSV/JSON records included here are synthetic demonstration data and do not reproduce these metrics. The results should not be interpreted as validated performance on real-world ministry complaint data.

## Technology Stack

### Frontend

- React 19
- Vite
- JavaScript
- CSS
- Lucide React

### Backend

- Node.js
- Express
- REST API
- Appwrite SDK

### Machine Learning and Data

- Python
- Sentence Transformers
- scikit-learn
- pandas
- NumPy
- RapidFuzz
- joblib

## Current Architecture

```text
Citizen Portal
     |
     v
React Frontend
     |
     v
Express API
     |
     v
Python Complaint Classifier
     |
     +--> Sentence embedding
     +--> Category prediction
     +--> Risk-signal extraction
     +--> Establishment matching
     +--> Zone-based severity policy
     +--> Priority score and reasoning
     |
     v
Local triage JSON
     |
     v
Employee Dashboard
```

The repository also contains Appwrite integration code. In the current prototype, complaint creation and complaint listing use the local triage JSON workflow, while some complaint-update routes are Appwrite-backed. These persistence paths have not yet been consolidated into a single end-to-end database workflow.

## Project Structure

```text
.
├── backend/
│   ├── data/
│   │   └── establishments.csv
│   ├── python/
│   │   ├── output/
│   │   │   ├── category_model.joblib
│   │   │   ├── model_metrics.json
│   │   │   └── triaged_complaints.json
│   │   ├── classify_complaint.py
│   │   ├── clean_dataset.py
│   │   ├── consumer_complaints.csv
│   │   ├── consumer_complaints_cleaned.csv
│   │   ├── establishments(in).csv
│   │   ├── requirements.txt
│   │   └── train_and_triage.py
│   ├── appwrite.js
│   ├── server.js
│   ├── setup-appwrite.js
│   └── package.json
│
├── frontend/
│   ├── public/
│   │   └── lebanon-map.png
│   ├── src/
│   │   ├── api.js
│   │   ├── appwriteClient.js
│   │   ├── main.jsx
│   │   └── styles.css
│   └── package.json
│
├── .gitignore
└── README.md
```

## Running the Project Locally

### Prerequisites

- Node.js and npm
- Python 3
- An Appwrite project for the Appwrite-backed portions of the backend

### 1. Install Python dependencies

From the `backend` directory:

```bash
python3 -m pip install -r python/requirements.txt
```

The Sentence Transformers model may be downloaded automatically the first time the classifier is run.

### 2. Configure the backend

Create `backend/.env` from `backend/.env.example`.

```env
PORT=3000
APPWRITE_ENDPOINT=https://fra.cloud.appwrite.io/v1
APPWRITE_PROJECT_ID=your_project_id
APPWRITE_API_KEY=your_appwrite_api_key
APPWRITE_DATABASE_ID=moet_command_center
APPWRITE_COMPLAINTS_COLLECTION_ID=complaints
```

The backend currently initializes an Appwrite client when it starts, so valid Appwrite connection values are required.

Never commit real API keys or credentials.

### 3. Install and start the backend

```bash
cd backend
npm install
npm run dev
```

By default, the backend runs at:

`http://localhost:3000`

### 4. Configure the frontend

Create `frontend/.env` from `frontend/.env.example`.

```env
VITE_BACKEND_URL=http://localhost:3000
```

The active frontend currently uses this variable to connect to the Express backend.

### 5. Install and start the frontend

In a second terminal:

```bash
cd frontend
npm install
npm run dev
```

Vite will display the local frontend address, typically:

`http://localhost:5173`

## Training the Classifier

The repository includes a saved trained model. To rebuild the training artifacts from the included development data:

```bash
cd backend
python3 python/clean_dataset.py
python3 python/train_and_triage.py
```

The pipeline writes model artifacts to `backend/python/output/`, including:

- `category_model.joblib`
- `model_metrics.json`
- `triaged_complaints.json`

## API

| Method | Endpoint | Current behavior |
| --- | --- | --- |
| `GET` | `/api/health` | Backend health check |
| `GET` | `/api/establishments` | Reads establishment data from CSV |
| `GET` | `/api/complaints` | Reads triaged complaints from local JSON |
| `POST` | `/api/complaints` | Runs Python classification and appends the result to local JSON |
| `PATCH` | `/api/complaints/:id` | Appwrite-backed status / assignment update route |
| `POST` | `/api/complaints/:id/citizen-message` | Prototype route that still requires backend completion |

## Security and Data Privacy

- Real `.env` files are excluded from version control.
- API keys and backend credentials should never be committed to GitHub.
- The employee login in the current frontend is for demonstration only and is not secure authentication.
- The public CSV and JSON records in this repository are synthetic demonstration data; the organizer-provided raw hackathon datasets are not redistributed.
- A production system handling real complaints would require proper authentication, authorization, audit logging, secure data storage, privacy controls, and access policies.

## Current Limitations

This repository is a functional prototype, not a production government system.

Current limitations include:

- The JSON-based complaint flow and Appwrite-backed update flow are not yet unified.
- Inspector assignment and status-update controls depend on the Appwrite-backed routes.
- The frontend Appwrite client exists in the repository but is not currently connected to the active employee login flow.
- Employee authentication is demo-only.
- The citizen-message endpoint is scaffolded but not fully implemented in the backend.
- Model evaluation is limited to the included development dataset.
- Human review would be required for real-world enforcement or high-impact decisions.

## Future Improvements

- Consolidate complaint persistence into one database-backed workflow
- Replace demo login with secure employee authentication and role-based permissions
- Complete inspector assignment and complaint-status persistence
- Complete the citizen-response workflow
- Add Arabic and French interface localization
- Expand and validate multilingual training data
- Add production audit logging and monitoring
- Add model monitoring and retraining workflows
- Conduct validation on representative real-world data before deployment

## License

No open-source license is currently included in this repository.
