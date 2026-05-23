"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const vitest_1 = require("vitest");
const mockCreateFile = vitest_1.vi.fn().mockResolvedValue({ $id: 'mock-file-id-123' });
const mockGetFileView = vitest_1.vi
    .fn()
    .mockReturnValue(new URL('https://fra.cloud.appwrite.io/v1/storage/buckets/school_files/files/mock-file-id-123/view'));
const mockGetFileDownload = vitest_1.vi
    .fn()
    .mockReturnValue(new URL('https://fra.cloud.appwrite.io/v1/storage/buckets/school_files/files/mock-file-id-123/download'));
const mockDeleteFile = vitest_1.vi.fn().mockResolvedValue(undefined);
const mockGetFile = vitest_1.vi.fn().mockResolvedValue({ $id: 'mock-file-id-123' });
const mockSetEndpoint = vitest_1.vi.fn();
const mockSetProject = vitest_1.vi.fn();
const mockSetKey = vitest_1.vi.fn();
vitest_1.vi.mock('node-appwrite', () => {
    function Client() {
        this.setEndpoint = mockSetEndpoint.mockReturnValue(this);
        this.setProject = mockSetProject.mockReturnValue(this);
        this.setKey = mockSetKey.mockReturnValue(this);
    }
    function Storage(_client) {
        this.createFile = mockCreateFile;
        this.getFileView = mockGetFileView;
        this.getFileDownload = mockGetFileDownload;
        this.deleteFile = mockDeleteFile;
        this.getFile = mockGetFile;
    }
    return {
        Client,
        Storage,
        ID: { unique: vitest_1.vi.fn().mockReturnValue('mock-file-id-123') },
    };
});
vitest_1.vi.mock('node-appwrite/file', () => ({
    InputFile: {
        fromBuffer: vitest_1.vi.fn().mockReturnValue('mock-input-file'),
    },
}));
const storage_1 = require("../lib/storage");
(0, vitest_1.beforeEach)(() => {
    vitest_1.vi.clearAllMocks();
    process.env.APPWRITE_ENDPOINT = 'https://fra.cloud.appwrite.io/v1';
    process.env.APPWRITE_PROJECT_ID = 'test-project-id';
    process.env.APPWRITE_API_KEY = 'test-api-key';
});
(0, vitest_1.describe)('Appwrite Storage — single bucket smoke test', () => {
    (0, vitest_1.it)('uploads to school_files and returns a fileId', async () => {
        const buffer = Buffer.from('test file content');
        const fileId = await (0, storage_1.uploadFile)(storage_1.SCHOOL_BUCKET, buffer, 'test.txt', 'text/plain');
        (0, vitest_1.expect)(typeof fileId).toBe('string');
        (0, vitest_1.expect)(fileId.length).toBeGreaterThan(0);
        (0, vitest_1.expect)(fileId).toBe('mock-file-id-123');
        const url = await (0, storage_1.getViewUrl)(storage_1.SCHOOL_BUCKET, fileId);
        (0, vitest_1.expect)(url).toContain('appwrite');
        await (0, storage_1.deleteFile)(storage_1.SCHOOL_BUCKET, fileId);
    });
    (0, vitest_1.it)('returns a view URL containing the fileId', async () => {
        mockGetFileView.mockReturnValue(new URL('https://fra.cloud.appwrite.io/v1/storage/buckets/school_files/files/mock-file-id-123/view'));
        const url = await (0, storage_1.getViewUrl)(storage_1.SCHOOL_BUCKET, 'mock-file-id-123');
        (0, vitest_1.expect)(url).toContain('appwrite');
        (0, vitest_1.expect)(url).toContain('mock-file-id-123');
    });
    (0, vitest_1.it)('deleteFile resolves without throwing', async () => {
        await (0, vitest_1.expect)((0, storage_1.deleteFile)(storage_1.SCHOOL_BUCKET, 'mock-file-id-123')).resolves.toBeUndefined();
    });
});
//# sourceMappingURL=storage.test.js.map