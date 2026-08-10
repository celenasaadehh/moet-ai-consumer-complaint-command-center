import "dotenv/config";
import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import  { spawn } from "child_process";

import {
  APPWRITE_COMPLAINTS_COLLECTION_ID,
  APPWRITE_DATABASE_ID,
  makeAppwrite,
} from "./appwrite.js";

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: "2mb" }));

const aw = makeAppwrite();

function parseCsvLine(line) {
  const result = [];
  let current = "";
  let insideQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];

    if (char === '"') {
      insideQuotes = !insideQuotes;
    } else if (char === "," && !insideQuotes) {
      result.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }

  result.push(current.trim());
  return result;
}

function loadEstablishmentsFromCsv() {
  const filePath = path.join(process.cwd(), "data", "establishments.csv");

  if (!fs.existsSync(filePath)) {
    return [];
  }

  const text = fs.readFileSync(filePath, "utf8").trim();
  if (!text) return [];

  const lines = text.split(/\r?\n/);
  const headers = parseCsvLine(lines[0]);

  return lines.slice(1).map((line) => {
    const values = parseCsvLine(line);
    const row = {};

    headers.forEach((header, index) => {
      row[header] = values[index] || "";
    });

    return {
      id: row.id,
      name: row.name,
      province: row.province,
      sector: row.sector,
      violations: Number(row.violations || 0),
      lastInspection: row.last_inspection,
      zone: row.zone,
      openComplaints: Number(row.open_complaints || 0),
    };
  });
}

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function findEstablishment(purchasePlace) {
  const establishments = loadEstablishmentsFromCsv();
  const target = normalizeText(purchasePlace);

  if (!target) return null;

  return (
    establishments.find((est) => normalizeText(est.name) === target) ||
    establishments.find((est) => normalizeText(est.name).includes(target)) ||
    establishments.find((est) => target.includes(normalizeText(est.name))) ||
    null
  );
}

function normalizeCategory(subject) {
  const value = String(subject || "").toLowerCase();

  if (value.includes("food")) return "food_safety";
  if (value.includes("hygiene")) return "hygiene";
  if (value.includes("price")) return "price_fraud";
  if (value.includes("licens")) return "licensing";
  if (value.includes("service")) return "service_quality";

  return value || "service_quality";
}

function hasAny(text, words) {
  const lower = String(text || "").toLowerCase();
  return words.some((word) => lower.includes(word));
}

function priorityFromScore(score) {
  const n = Number(score || 0);

  if (n >= 90) return "CRITICAL";
  if (n >= 70) return "HIGH";
  if (n >= 40) return "MEDIUM";
  return "LOW";
}

/*
  This is the local ML/rule triage engine.
  Gemini is NOT used here.
*/
function mlTriageComplaint(complaint, establishment) {
  const category = normalizeCategory(complaint.subject);
  const message = complaint.message || "";

  let score = 0;
  const reasoningItems = [];
  const scoreBreakdown = [];

  function add(label, points, reason) {
    score += points;
    scoreBreakdown.push({ label, points });
    reasoningItems.push(reason || label);
  }

  if (category === "food_safety") add("Base food safety risk", 30);
  else if (category === "hygiene") add("Base hygiene risk", 24);
  else if (category === "price_fraud") add("Base price fraud risk", 18);
  else if (category === "licensing") add("Base licensing risk", 20);
  else add("Base service quality risk", 10);

  if (
    hasAny(message, [
      "sick",
      "vomit",
      "vomiting",
      "nausea",
      "diarrhea",
      "stomach",
      "cramps",
      "dizziness",
      "rash",
      "burning throat",
      "food poisoning",
    ])
  ) {
    add("Health symptoms", 20, "The complaint reports health symptoms.");
  }

  if (
    hasAny(message, [
      "clinic",
      "doctor",
      "hospital",
      "medical",
      "emergency",
      "medicine",
    ])
  ) {
    add("Medical attention", 18, "Medical attention is mentioned.");
  }

  if (
    hasAny(message, [
      "child",
      "baby",
      "elderly",
      "pregnant",
      "family",
      "sister",
      "brother",
      "kids",
    ])
  ) {
    add("Vulnerable or multiple people affected", 12);
  }

  if (
    hasAny(message, [
      "expired",
      "spoiled",
      "rotten",
      "mold",
      "sour",
      "bad smell",
      "unsafe",
      "contaminated",
      "raw chicken",
    ])
  ) {
    add("Expired or spoiled product", 16);
  }

  if (
    hasAny(message, [
      "flies",
      "cockroach",
      "rat",
      "dirty",
      "unclean",
      "gloves",
      "residue",
      "sanitize",
      "hygiene",
    ])
  ) {
    add("Hygiene violation", 12);
  }

  if (
    hasAny(message, [
      "overcharged",
      "price",
      "fake price",
      "receipt",
      "charged me",
      "different price",
      "fraud",
    ])
  ) {
    add("Fraud or financial harm", 12);
  }

  if (
    hasAny(message, [
      "license",
      "unlicensed",
      "permit",
      "illegal",
      "regulation",
    ])
  ) {
    add("Licensing or regulatory concern", 14);
  }

  if (
    hasAny(message, [
      "refused",
      "denied",
      "ignored",
      "manager",
      "mocked",
      "laughed",
      "waved me away",
    ])
  ) {
    add("Refusal or obstruction", 6);
  }

  if (
    hasAny(message, [
      "photo",
      "picture",
      "video",
      "receipt",
      "proof",
      "evidence",
    ]) ||
    complaint.attachmentName
  ) {
    add("Evidence available", 4);
  }

  if (
    hasAny(message, [
      "still serving",
      "other customers",
      "public",
      "branch",
      "everyone",
      "ongoing",
    ])
  ) {
    add("Ongoing public exposure", 10);
  }

  const establishmentZone = establishment?.zone || "UNKNOWN";
  const violations = Number(establishment?.violations || 0);
  const openComplaints = Number(establishment?.openComplaints || 0);

  if (establishmentZone === "YELLOW" && score < 40) {
    add("YELLOW-zone minimum MEDIUM escalation", 40 - score);
  }

  if (establishmentZone === "RED" && score < 70) {
    add("RED-zone minimum HIGH escalation", 70 - score);
  }

  if (establishmentZone === "RED" && score >= 70 && category === "food_safety") {
    score = Math.max(score, 90);
    reasoningItems.push(
      "RED-zone establishment with serious food safety content is escalated to CRITICAL."
    );
  }

  if (establishment) {
    reasoningItems.push(
      `Matched establishment: ${establishment.name}, zone ${establishmentZone}, ${violations} violation(s), ${openComplaints} open complaint(s).`
    );
  } else {
    reasoningItems.push(
      "No matching establishment was found, so manual review may be needed."
    );
  }

  if (openComplaints > 0) {
    score += Math.min(openComplaints * 3, 12);
  }

  score = Math.min(100, Math.round(score));

  const priorityCategory = priorityFromScore(score);

  let recommendedAction = "Monitor and contact citizen if more details are needed.";

  if (priorityCategory === "CRITICAL") {
    recommendedAction = "Immediate on-site inspection and supervisor notification.";
  } else if (priorityCategory === "HIGH") {
    recommendedAction = "Assign inspector today and review establishment history.";
  } else if (priorityCategory === "MEDIUM") {
    recommendedAction = "Review evidence and schedule inspection if repeated.";
  }

  return {
    category,
    categoryConfidence: 0.88,
    priorityScore: score,
    triageScore: score,
    priorityCategory,
    establishmentZone,
    violations,
    openComplaints,
    establishmentId: establishment?.id || "",
    establishmentName: establishment?.name || complaint.purchasePlace || "",
    establishmentSector: establishment?.sector || "",
    lastInspection: establishment?.lastInspection || "",
    requiresManualReview: !establishment,
    reasoning: reasoningItems.join(" "),
    reasoningItems,
    scoreBreakdown,
    recommendedAction,
    clusterAlert: openComplaints >= 3,
  };
}

function toComplaint(doc) {
  return {
    id: doc.$id,

    email: doc.email || "",
    telephone: doc.telephone || "",
    purchaseDate: doc.purchaseDate || "",
    province: doc.province || "Beirut",
    purchasePlace: doc.purchasePlace || "",
    subject: doc.subject || "",
    message: doc.message || "",
    citizenPriority: doc.citizenPriority || "Medium",
    attachmentName: doc.attachmentName || "",

    category: doc.category || "service_quality",
    categoryConfidence: Number(doc.categoryConfidence || 0),
    priorityScore: Number(doc.priorityScore || 0),
    triageScore: Number(doc.priorityScore || 0),
    priorityCategory: doc.priorityCategory || "LOW",

    establishmentId: doc.establishmentId || "",
    establishmentName: doc.establishmentName || doc.purchasePlace || "",
    establishmentZone: doc.establishmentZone || "",
    establishmentSector: doc.establishmentSector || "",
    violations: Number(doc.violations || 0),
    openComplaints: Number(doc.openComplaints || 0),
    lastInspection: doc.lastInspection || "",

    reasoning: doc.reasoning || "",
    recommendation: doc.recommendation || "",
    recommendedAction: doc.recommendedAction || "",
    requiresManualReview: Boolean(doc.requiresManualReview),
    clusterAlert: Boolean(doc.clusterAlert),

    status: doc.status || "received",
    assignedTo: doc.assignedTo || "",
    assignedBy: doc.assignedBy || "",

    createdAt: doc.createdAt || doc.$createdAt,
    updatedAt: doc.updatedAt || doc.$updatedAt,
  };
}

app.get("/api/health", (req, res) => {
  res.json({
    ok: true,
    message: "MOET backend is running",
  });
});

app.get("/api/establishments", (req, res) => {
  try {
    const establishments = loadEstablishmentsFromCsv();
    res.json(establishments);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get("/api/complaints", (req, res) => {
  try {
    const filePath = path.join(
      process.cwd(),
      "python",
      "output",
      "triaged_complaints.json"
    );

    const json = JSON.parse(
      fs.readFileSync(filePath, "utf8")
    );

    const complaints = (json.complaints || []).map(c => ({
      id: c.complaint_id,
      subject: c.subject,
      message: c.message,
      province: c.province,
      purchasePlace: c.establishment_name,
      category: c.category,
      priorityScore: c.triage_score,
      priorityCategory: c.priority_category,
      createdAt: c.submission_date,
      originalPriority: c.originalPriority || "",
      ...c
    }));

    complaints.sort((a, b) => {
      return (
        Number(b.priority_score || b.priorityScore || 0) -
        Number(a.priority_score || a.priorityScore || 0)
      );
    });
    

    res.json(complaints);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      error: error.message,
    });
  }
});


app.post("/api/complaints", (req, res) => {
  const {
    message,
    purchasePlace,
    citizenPriority
  } = req.body;

  const python = spawn("python3", [
    "python/classify_complaint.py",
    message,
    purchasePlace,
    citizenPriority
  ]);

  let output = "";

  python.stdout.on("data", data => {
    output += data.toString();
  });

  python.on("close", () => {
    res.json(JSON.parse(output));
  });
});

app.patch("/api/complaints/:id", async (req, res) => {
  try {
    const allowedStatuses = [
      "received",
      "assigned",
      "sent_to_inspector",
      "inspection_started",
      "resolved",
    ];

    const update = {
      updatedAt: new Date().toISOString(),
    };

    if (typeof req.body.status === "string") {
      if (!allowedStatuses.includes(req.body.status)) {
        return res.status(400).json({ error: "Invalid status." });
      }

      update.status = req.body.status;
    }

    if (typeof req.body.assignedTo === "string") {
      update.assignedTo = req.body.assignedTo;
    }

    if (typeof req.body.assignedBy === "string") {
      update.assignedBy = req.body.assignedBy;
    }

    const updated = await aw.databases.updateDocument(
      APPWRITE_DATABASE_ID,
      APPWRITE_COMPLAINTS_COLLECTION_ID,
      req.params.id,
      update
    );

    res.json(toComplaint(updated));
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/complaints/:id/citizen-message", async (req, res) => {
  try {
    const doc = await aw.databases.getDocument(
      APPWRITE_DATABASE_ID,
      APPWRITE_COMPLAINTS_COLLECTION_ID,
      req.params.id
    );

    const complaint = toComplaint(doc);

    if (
      complaint.priorityCategory !== "LOW" &&
      Number(complaint.priorityScore || 0) > 39
    ) {
      return res.status(400).json({
        error: "Citizen message is only for low-priority complaints.",
      });
    }

    const message = await generateCitizenMessage({ complaint });

    res.json({ message });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`MOET backend running on http://localhost:${PORT}`);
});
