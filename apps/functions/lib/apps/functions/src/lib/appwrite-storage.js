"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.uploadFile = uploadFile;
exports.getFileViewUrl = getFileViewUrl;
exports.deleteFile = deleteFile;
const node_appwrite_1 = require("node-appwrite");
const client = new node_appwrite_1.Client()
    .setEndpoint(process.env.APPWRITE_ENDPOINT) // e.g. https://cloud.appwrite.io/v1
    .setProject(process.env.APPWRITE_PROJECT_ID)
    .setKey(process.env.APPWRITE_API_KEY);
const storage = new node_appwrite_1.Storage(client);
// Upload a file to Appwrite Storage
async function uploadFile(bucketId, buffer, filename, mimeType) {
    const file = await storage.createFile(bucketId, node_appwrite_1.ID.unique(), node_appwrite_1.InputFile.fromBuffer(buffer, filename, mimeType));
    return file.$id;
}
// Generate a view-only URL (for eBooks, payslips — no download)
function getFileViewUrl(bucketId, fileId) {
    return `${process.env.APPWRITE_ENDPOINT}/storage/buckets/${bucketId}/files/${fileId}/view?project=${process.env.APPWRITE_PROJECT_ID}`;
}
// Delete a file
async function deleteFile(bucketId, fileId) {
    await storage.deleteFile(bucketId, fileId);
}
//# sourceMappingURL=appwrite-storage.js.map