# Data Notice

This public repository uses **synthetic demonstration data**.

The original hackathon challenge supplied complaint and establishment CSV files to participating teams. Those organizer-provided raw records are **not redistributed in this public-safe version** because their public redistribution status was not confirmed.

The replacement files in this repository preserve the same schemas and broad category/risk-zone structure needed to demonstrate the software, but the records are fictional:

- Citizen names use `Demo Citizen ####`
- Phone values use an intentionally non-real demo format
- Establishments use `Demo ...` names
- Complaint narratives are newly generated fictional examples
- Inspection dates, violation counts, open-complaint counts, and risk-zone records are synthetic

Files replaced with synthetic data:

- `backend/python/consumer_complaints.csv`
- `backend/python/consumer_complaints_cleaned.csv`
- `backend/data/establishments.csv`
- `backend/python/establishments(in).csv`
- `backend/python/output/triaged_complaints.json`

The saved classifier artifact and `model_metrics.json` remain from the hackathon development build. The public synthetic CSVs are intended for demonstration/testing and should **not** be used to reproduce or interpret the saved model metrics.
