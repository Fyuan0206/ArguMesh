const DATABASE_NAME = "paperidea-files";
const STORE_NAME = "pdfs";
const PAGE_TEXT_STORE = "page-text";
const DATABASE_VERSION = 2;
const LEGACY_OWNER = "chen-fuyuan";

function currentAccountId() {
  return window.sessionStorage.getItem("paperidea_session_account") ?? "signed-out";
}

export function accountPaperStorageKey(accountId: string, paperId: string) {
  return `${accountId}:${paperId}`;
}

function paperStorageKey(paperId: string) {
  return accountPaperStorageKey(currentAccountId(), paperId);
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
      if (!database.objectStoreNames.contains(PAGE_TEXT_STORE)) {
        database.createObjectStore(PAGE_TEXT_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("无法打开本地 PDF 存储"));
  });
}

/** 删除某篇论文的本地 PDF 与 OCR 页文本(与云端删除配合,替代旧"归档")。 */
export async function deletePaperFiles(paperId: string): Promise<void> {
  const database = await openDatabase();
  try {
    await Promise.all([
      new Promise<void>((resolve, reject) => {
        const tx = database.transaction(STORE_NAME, "readwrite");
        tx.objectStore(STORE_NAME).delete(paperStorageKey(paperId));
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error("删除本地 PDF 失败"));
      }),
      new Promise<void>((resolve, reject) => {
        const tx = database.transaction(PAGE_TEXT_STORE, "readwrite");
        const store = tx.objectStore(PAGE_TEXT_STORE);
        const request = store.openCursor();
        request.onsuccess = () => {
          const cursor = request.result;
          if (!cursor) return;
          const key = String(cursor.key);
          if (key.startsWith(`${currentAccountId()}:${paperId}:`) || key.startsWith(`${paperId}:`)) {
            cursor.delete();
          } else {
            cursor.continue();
          }
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error("删除本地 OCR 文本失败"));
      }),
    ]);
  } finally {
    database.close();
  }
}

export async function savePaperPdf(paperId: string, file: File): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put(file, paperStorageKey(paperId));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("保存 PDF 失败"));
      transaction.onabort = () => reject(transaction.error ?? new Error("保存 PDF 已取消"));
    });
  } finally {
    database.close();
  }
}

export async function getPaperPdf(paperId: string): Promise<Blob | null> {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const store = database.transaction(STORE_NAME, "readonly").objectStore(STORE_NAME);
      const request = store.get(paperStorageKey(paperId));
      request.onsuccess = () => {
        if (request.result instanceof Blob) return resolve(request.result);
        if (currentAccountId() !== LEGACY_OWNER) return resolve(null);
        const legacyRequest = store.get(paperId);
        legacyRequest.onsuccess = () => resolve(legacyRequest.result instanceof Blob ? legacyRequest.result : null);
        legacyRequest.onerror = () => reject(legacyRequest.error ?? new Error("Failed to read legacy PDF"));
      };
      request.onerror = () => reject(request.error ?? new Error("读取 PDF 失败"));
    });
  } finally {
    database.close();
  }
}

function pageTextKey(paperId: string, page: number) {
  return `${currentAccountId()}:${paperId}:${page}`;
}

export async function savePaperPageText(paperId: string, page: number, value: string): Promise<void> {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(PAGE_TEXT_STORE, "readwrite");
      transaction.objectStore(PAGE_TEXT_STORE).put(value, pageTextKey(paperId, page));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error("保存 OCR 文本失败"));
    });
  } finally {
    database.close();
  }
}

export async function getPaperPageTexts(paperId: string): Promise<Record<number, string>> {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const request = database.transaction(PAGE_TEXT_STORE, "readonly").objectStore(PAGE_TEXT_STORE).openCursor();
      const result: Record<number, string> = {};
      request.onsuccess = () => {
        const cursor = request.result;
        if (!cursor) return resolve(result);
        const key = String(cursor.key);
        const accountPrefix = `${currentAccountId()}:${paperId}:`;
        const legacyPrefix = `${paperId}:`;
        const isScoped = key.startsWith(accountPrefix);
        const isOwnedLegacy = currentAccountId() === LEGACY_OWNER && key.startsWith(legacyPrefix);
        if (isScoped || isOwnedLegacy) {
          const prefix = isScoped ? accountPrefix : legacyPrefix;
          const page = Number(key.slice(prefix.length));
          if (Number.isInteger(page) && typeof cursor.value === "string" && (isScoped || result[page] === undefined)) {
            result[page] = cursor.value;
          }
        }
        cursor.continue();
      };
      request.onerror = () => reject(request.error ?? new Error("读取 OCR 文本失败"));
    });
  } finally {
    database.close();
  }
}
