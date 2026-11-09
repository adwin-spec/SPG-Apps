/** Isolated test environment: separate database, Redis DB 1, inline queues, temp storage. */
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://tanda:tanda_dev_pw@localhost:5432/tanda_tambah_test?schema=public';
process.env.REDIS_URL = process.env.TEST_REDIS_URL ?? 'redis://localhost:6379/1';
process.env.JWT_ACCESS_SECRET = 'test-secret-test-secret-test-secret-0123456789';
process.env.QUEUES_ENABLED = 'false';
process.env.STORAGE_DRIVER = 'local';
process.env.STORAGE_LOCAL_DIR = '/tmp/tt-test-storage';
process.env.OCR_PROVIDER = 'none';
process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 = '';
