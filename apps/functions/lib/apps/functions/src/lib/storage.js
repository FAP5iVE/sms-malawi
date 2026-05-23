'use strict';
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.STORAGE_BUCKETS = exports.SCHOOL_BUCKET = void 0;
exports.uploadFile = uploadFile;
exports.getViewUrl = getViewUrl;
exports.getDownloadUrl = getDownloadUrl;
exports.deleteFile = deleteFile;
exports.getFileMetadata = getFileMetadata;
const sdk = __importStar(require("node-appwrite"));
exports.SCHOOL_BUCKET = 'school_files';
// Keep STORAGE_BUCKETS for backward-compat — all values point to school_files
exports.STORAGE_BUCKETS = {
    STUDENT_FILES: exports.SCHOOL_BUCKET,
    DIGITAL_LIBRARY: exports.SCHOOL_BUCKET,
    PAYSLIPS: exports.SCHOOL_BUCKET,
    REPORT_CARDS: exports.SCHOOL_BUCKET,
};
function getClient() {
    return new sdk.Client()
        .setEndpoint(process.env.APPWRITE_ENDPOINT)
        .setProject(process.env.APPWRITE_PROJECT_ID)
        .setKey(process.env.APPWRITE_API_KEY);
}
async function uploadFile(_bucket, buffer, filename, mimeType, fileId) {
    const storage = new sdk.Storage(getClient());
    const id = fileId ?? sdk.ID.unique();
    const blob = new Blob([buffer], { type: mimeType });
    const file = await storage.createFile(exports.SCHOOL_BUCKET, id, new File([blob], filename, { type: mimeType }));
    return file.$id;
}
async function getViewUrl(_bucket, fileId) {
    const storage = new sdk.Storage(getClient());
    return storage.getFileView(exports.SCHOOL_BUCKET, fileId).toString();
}
async function getDownloadUrl(_bucket, fileId) {
    const storage = new sdk.Storage(getClient());
    return storage.getFileDownload(exports.SCHOOL_BUCKET, fileId).toString();
}
async function deleteFile(_bucket, fileId) {
    const storage = new sdk.Storage(getClient());
    await storage.deleteFile(exports.SCHOOL_BUCKET, fileId);
}
async function getFileMetadata(_bucket, fileId) {
    const storage = new sdk.Storage(getClient());
    return storage.getFile(exports.SCHOOL_BUCKET, fileId);
}
//# sourceMappingURL=storage.js.map