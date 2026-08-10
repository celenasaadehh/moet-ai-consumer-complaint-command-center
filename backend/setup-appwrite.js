import "dotenv/config";
import { Client, Databases, Permission, Role } from "appwrite";

const endpoint = process.env.APPWRITE_ENDPOINT;
const projectId = process.env.APPWRITE_PROJECT_ID;
const apiKey = process.env.APPWRITE_API_KEY;
const databaseId = process.env.APPWRITE_DATABASE_ID || "moet_command_center";
const collectionId = process.env.APPWRITE_COMPLAINTS_COLLECTION_ID || "complaints";

if (!endpoint || !projectId || !apiKey || projectId.includes("PASTE") || apiKey.includes("PASTE")) {
  console.error("Missing Appwrite env values. Fill backend/.env first.");
  process.exit(1);
}

const client = new Client().setEndpoint(endpoint).setProject(projectId).setKey(apiKey);
const databases = new Databases(client);

async function safe(label, fn) {
  try {
    const result = await fn();
    console.log(`Created ${label}`);
    await new Promise(resolve => setTimeout(resolve, 700));
    return result;
  } catch (error) {
    if (error.code === 409) {
      console.log(`${label} already exists`);
      return null;
    }
    throw error;
  }
}

await safe("database", () => databases.create(databaseId, "MOET Command Center"));

await safe("complaints collection", () => databases.createCollection(
  databaseId,
  collectionId,
  "Complaints",
  [
    Permission.read(Role.any()),
    Permission.create(Role.any()),
    Permission.update(Role.users()),
    Permission.delete(Role.users())
  ],
  false,
  true
));

const attrs = [
  ["citizenName", 120, true, ""],
  ["phone", 40, true, ""],
  ["businessName", 160, true, ""],
  ["zone", 80, true, "Unknown"],
  ["complaint", 2000, true, ""],
  ["category", 60, true, "service_quality"],
  ["riskLevel", 30, true, "Medium"],
  ["recommendation", 1000, true, ""],
  ["status", 40, true, "not_assigned"],
  ["assignedTo", 120, false, ""],
  ["assignedBy", 120, false, ""],
  ["createdAt", 50, true, ""]
];

for (const [key, size, required, defaultValue] of attrs) {
  await safe(`attribute ${key}`, () => databases.createStringAttribute(databaseId, collectionId, key, size, required, defaultValue));
}

await safe("attribute priorityScore", () => databases.createIntegerAttribute(databaseId, collectionId, "priorityScore", true, 0, 20, 8));

await new Promise(resolve => setTimeout(resolve, 1500));
await safe("index createdAt", () => databases.createIndex(databaseId, collectionId, "createdAt_desc", "key", ["createdAt"], ["DESC"]));
await safe("index status", () => databases.createIndex(databaseId, collectionId, "status_idx", "key", ["status"], ["ASC"]));

console.log("Done. Now run: npm run dev");
