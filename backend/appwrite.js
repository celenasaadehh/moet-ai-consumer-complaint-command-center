import {
  Client,
  Databases,
  ID,
  Query,
} from "node-appwrite";

export const APPWRITE_DATABASE_ID =
  process.env.APPWRITE_DATABASE_ID || "moet_command_center";

export const APPWRITE_COMPLAINTS_COLLECTION_ID =
  process.env.APPWRITE_COMPLAINTS_COLLECTION_ID || "complaints";

export function makeAppwrite() {
  const client = new Client();

  client
    .setEndpoint(process.env.APPWRITE_ENDPOINT)
    .setProject(process.env.APPWRITE_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);

  const databases = new Databases(client);

  return {
    client,
    databases,
    ID,
    Query,
  };
}