import { URI } from "@adviser/cement";
import { buildBlobFiles, FileWithCid, mockSuperThis } from "../helpers.js";
import {
  bs,
  Database,
  DocResponse,
  DocFileMeta,
  DocWithId,
  DocFiles,
  toStoreURIRuntime,
  keyConfigOpts,
  DatabaseFactory,
  DatabaseShell,
} from "@fireproof/core";
import { fileGatewayFactoryItem } from "../../src/blockstore/register-store-protocol.js";
import { FILESTORE_VERSION } from "../../src/runtime/index.js";

describe("basic Database", () => {
  let db: Database;
  const sthis = mockSuperThis();
  afterEach(async () => {
    await db.close();
    await db.destroy();
  });
  beforeEach(async () => {
    await sthis.start();
    db = DatabaseFactory(undefined, {
      logger: sthis.logger,
    });
  });
  it("should put", async () => {
    /** @type {Doc} */
    const doc = { _id: "hello", value: "world" };
    const ok = await db.put(doc);
    expect(ok.id).toBe("hello");
  });
  it("get missing should throw", async () => {
    const e = await db.get("missing").catch((e) => e);
    expect(e.message).toMatch(/Not found/);
  });
  it("del missing should result in deleted state", async () => {
    await db.del("missing");

    const e = await db.get("missing").catch((e) => e);
    expect(e.message).toMatch(/Not found/);
  });
  it("has no changes", async () => {
    const { rows } = await db.changes([]);
    expect(rows.length).toBe(0);
  });
});

describe("basic Database with record", function () {
  interface Doc {
    readonly value: string;
  }
  let db: DatabaseShell;
  const sthis = mockSuperThis();
  afterEach(async () => {
    await db.close();
    await db.destroy();
  });
  beforeEach(async function () {
    await sthis.start();
    db = DatabaseFactory("factory-name") as DatabaseShell;
    const ok = await db.put<Doc>({ _id: "hello", value: "world" });
    expect(ok.id).toBe("hello");
  });
  it("should get", async function () {
    const doc = await db.get<Doc>("hello");
    expect(doc).toBeTruthy();
    expect(doc._id).toBe("hello");
    expect(doc.value).toBe("world");
  });
  it("should update", async function () {
    const ok = await db.put({ _id: "hello", value: "universe" });
    expect(ok.id).toBe("hello");
    const doc = await db.get<Doc>("hello");
    expect(doc).toBeTruthy();
    expect(doc._id).toBe("hello");
    expect(doc.value).toBe("universe");
  });
  it("should del last record", async function () {
    const ok = await db.del("hello");
    expect(ok.id).toBe("hello");

    const e = await db.get("hello").catch((e) => e);
    expect(e.message).toMatch(/Not found/);
  });
  it("has changes", async function () {
    const { rows } = await db.changes([]);
    expect(rows.length).toBe(1);
    expect(rows[0].key).toBe("hello");
    expect(rows[0].value._id).toBe("hello");
  });
  it("is not persisted", async function () {
    const db2 = DatabaseFactory("factory-name") as DatabaseShell;
    const { rows } = await db2.changes([]);
    expect(rows.length).toBe(1);
    expect(db2.ref).toBe(db.ref);
    const doc = await db2.get<Doc>("hello").catch((e) => e);
    expect(doc.value).toBe("world");
    await db2.close();
  });
});

describe("named Database with record", function () {
  interface Doc {
    readonly value: string;
  }
  let db: Database;
  const sthis = mockSuperThis();
  afterEach(async () => {
    await db.close();
    await db.destroy();
  });
  beforeEach(async function () {
    await sthis.start();
    db = DatabaseFactory("test-db-name");
    /** @type {Doc} */
    const doc = { _id: "hello", value: "world" };
    const ok = await db.put(doc);
    expect(ok.id).toBe("hello");
  });
  it("should get", async function () {
    const doc = await db.get<Doc>("hello");
    expect(doc).toBeTruthy();
    expect(doc._id).toBe("hello");
    expect(doc.value).toBe("world");
  });
  it("should update", async function () {
    const ok = await db.put({ _id: "hello", value: "universe" });
    expect(ok.id).toBe("hello");
    const doc = await db.get<Doc>("hello");
    expect(doc).toBeTruthy();
    expect(doc._id).toBe("hello");
    expect(doc.value).toBe("universe");
  });
  it("should del last record", async function () {
    const ok = await db.del("hello");
    expect(ok.id).toBe("hello");

    const e = await db.get("hello").catch((e) => e);
    expect(e.message).toMatch(/Not found/);
  });
  it("has changes", async function () {
    const { rows } = await db.changes([]);
    expect(rows.length).toBe(1);
    expect(rows[0].key).toBe("hello");
    expect(rows[0].value._id).toBe("hello");
  });
  it("should have a key", async function () {
    const { rows } = await db.changes([]);
    expect(rows.length).toBe(1);
    const blocks = db.crdt.blockstore as bs.EncryptedBlockstore;
    const loader = blocks.loader;
    expect(loader).toBeTruthy();
    await loader.ready();

    // expect(loader.key?.length).toBe(64);
    // expect(loader.keyId?.length).toBe(64);
    // expect(loader.key).not.toBe(loader.keyId);
  });
  it("should work right with a sequence of changes", async function () {
    const numDocs = 10;
    for (let i = 0; i < numDocs; i++) {
      const doc = { _id: `id-${i}`, hello: "world" };
      const ok = await db.put(doc);
      expect(ok.id).toBe(`id-${i}`);
    }
    const { rows } = await db.changes([]);
    expect(rows.length).toBe(numDocs + 1);

    const ok6 = await db.put({ _id: `id-${6}`, hello: "block" });
    expect(ok6.id).toBe(`id-${6}`);

    for (let i = 0; i < numDocs; i++) {
      const id = `id-${i}`;
      const doc = await db.get<{ hello: string }>(id);
      expect(doc).toBeTruthy();
      expect(doc._id).toBe(id);
      expect(doc.hello.length).toBe(5);
    }

    const { rows: rows2 } = await db.changes([]);
    expect(rows2.length).toBe(numDocs + 1);

    const ok7 = await db.del(`id-${7}`);
    expect(ok7.id).toBe(`id-${7}`);

    const { rows: rows3 } = await db.changes([]);
    expect(rows3.length).toBe(numDocs + 1);
    expect(rows3[numDocs].key).toBe(`id-${7}`);
    expect(rows3[numDocs].value._deleted).toBe(true);

    // test limit
    const { rows: rows4 } = await db.changes([], { limit: 5 });
    expect(rows4.length).toBe(5);
  });

  it("should work right after compaction", async function () {
    const numDocs = 10;
    for (let i = 0; i < numDocs; i++) {
      const doc = { _id: `id-${i}`, hello: "world" };
      const ok = await db.put(doc);
      expect(ok.id).toBe(`id-${i}`);
    }
    const { rows } = await db.changes([]);
    expect(rows.length).toBe(numDocs + 1);

    await db.compact();

    const { rows: rows3 } = await db.changes([], { dirty: true });
    expect(rows3.length).toBe(numDocs + 1);

    const { rows: rows4 } = await db.changes([], { dirty: false });
    expect(rows4.length).toBe(numDocs + 1);
  });
});

// describe('basic Database parallel writes / public', function () {
//   /** @type {Database} */
//   let db
//   const writes = []
//   beforeEach(async function () {
//     await resetDirectory(dataDir, 'test-parallel-writes')
//     db = new Database('test-parallel-writes', { public: true })
//     /** @type {Doc} */
//     for (let i = 0; i < 10; i++) {
//       const doc = { _id: `id-${i}`, hello: 'world' }
//       writes.push(db.put(doc))
//     }
//     await Promise.all(writes)
//   })

describe("basic Database parallel writes / public", function () {
  let db: Database;
  const writes: Promise<DocResponse>[] = [];
  const sthis = mockSuperThis();
  afterEach(async () => {
    await db.close();
    await db.destroy();
  });
  beforeEach(async function () {
    await sthis.start();
    db = DatabaseFactory("test-parallel-writes", { public: true });
    for (let i = 0; i < 10; i++) {
      const doc = { _id: `id-${i}`, hello: "world" };
      writes.push(db.put(doc));
    }
    await Promise.all(writes);
  });
  it("should have one head", function () {
    const crdt = db.crdt;
    expect(crdt.clock.head.length).toBe(1);
  });
  it("should write all", async function () {
    for (let i = 0; i < 10; i++) {
      const id = `id-${i}`;
      const doc = await db.get<{ hello: string }>(id);
      expect(doc).toBeTruthy();
      expect(doc._id).toBe(id);
      expect(doc.hello).toBe("world");
    }
  });
  it("should del all", async function () {
    for (let i = 0; i < 10; i++) {
      const id = `id-${i}`;
      const ok = await db.del(id);
      expect(ok.id).toBe(id);

      const e = await db.get(id).catch((e) => e);
      expect(e.message).toMatch(/Not found/);
    }
  });
  it("should delete all in parallel", async function () {
    const deletes: Promise<DocResponse>[] = [];
    for (let i = 0; i < 10; i++) {
      const id = `id-${i}`;
      deletes.push(db.del(id));
    }
    await Promise.all(deletes);
    for (let i = 0; i < 10; i++) {
      const id = `id-${i}`;
      const e = await db.get(id).catch((e) => e);
      expect(e.message).toMatch(/Not found/);
    }
  });
  it("has changes", async function () {
    const { rows, clock } = await db.changes([]);
    expect(clock[0]).toBe(db.crdt.clock.head[0]);
    expect(rows.length).toBe(10);
    // rows.sort((a, b) => a.key.localeCompare(b.key));
    for (let i = 0; i < 10; i++) {
      expect(rows[i].key).toBe("id-" + i);
      expect(rows[i].clock).toBeTruthy();
    }
  });
  it("should not have a key", async function () {
    const { rows } = await db.changes([]);
    expect(rows.length).toBe(10);
    // expect(db.opts.public).toBeTruthy();
    // expect(db._crdt.opts.public).toBeTruthy();
    const blocks = db.crdt.blockstore as bs.EncryptedBlockstore;
    const loader = blocks.loader;
    expect(loader).toBeTruthy();
    await loader.ready();
    // expect(loader.key).toBeUndefined();
    // expect(loader.keyId).toBeUndefined();
  });
});

describe("basic Database with subscription", function () {
  let db: Database;
  let didRun: number;
  let unsubscribe: () => void;
  let lastDoc: DocWithId<NonNullable<unknown>>;
  let waitForSub: Promise<void>;
  const sthis = mockSuperThis();
  afterEach(async () => {
    await db.close();
    await db.destroy();
  });
  beforeEach(async function () {
    await sthis.start();
    db = DatabaseFactory("factory-name");
    didRun = 0;
    waitForSub = new Promise((resolve) => {
      unsubscribe = db.subscribe((docs) => {
        lastDoc = docs[0];
        // lastDoc = {_id: "ok"};
        didRun++;
        resolve();
      }, true);
    });
  });
  it("should run on put", async function () {
    const all = await db.allDocs();
    expect(all.rows.length).toBe(0);
    const doc = { _id: "hello", message: "world" };
    expect(didRun).toBe(0);
    const ok = await db.put(doc);
    await waitForSub;
    expect(didRun).toBeTruthy();
    expect(lastDoc).toBeTruthy();
    expect(lastDoc._id).toBe("hello");
    expect(ok.id).toBe("hello");
    expect(didRun).toBe(1);
  });
  it("should unsubscribe", async function () {
    unsubscribe();
    const doc = { _id: "hello", message: "again" };
    const ok = await db.put(doc);
    expect(ok.id).toBe("hello");
    expect(didRun).toBe(0);
  });
});

describe("basic Database with no update subscription", function () {
  let db: Database;
  let didRun: number;
  let unsubscribe: () => void;
  const sthis = mockSuperThis();
  afterEach(async () => {
    await db.close();
    await db.destroy();
  });
  beforeEach(async function () {
    await sthis.start();
    db = DatabaseFactory("factory-name");
    didRun = 0;
    unsubscribe = db.subscribe(() => {
      didRun++;
    });
  });
  it("should run on put", async function () {
    const all = await db.allDocs();
    expect(all.rows.length).toBe(0);
    /** @type {Doc} */
    const doc = { _id: "hello", message: "world" };
    expect(didRun).toBe(0);
    const ok = await db.put(doc);
    expect(ok.id).toBe("hello");
    expect(didRun).toBe(1);
  });
  it("should unsubscribe", async function () {
    unsubscribe();
    const doc = { _id: "hello", message: "again" };
    const ok = await db.put(doc);
    expect(ok.id).toBe("hello");
    expect(didRun).toBe(0);
  });
});

describe("database with files input", () => {
  let db: Database;
  let imagefiles: FileWithCid[] = [];
  let result: DocResponse;
  const sthis = mockSuperThis();

  afterEach(async () => {
    await db.close();
    await db.destroy();
  });
  beforeEach(async function () {
    await sthis.start();
    imagefiles = await buildBlobFiles();
    db = DatabaseFactory("fireproof-with-images");
    const doc = {
      _id: "images-main",
      type: "files",
      _files: {
        one: imagefiles[0].file,
        two: imagefiles[1].file,
      },
    };
    result = await db.put(doc);
  });

  it("Should upload images", async function () {
    expect(result.id).toBe("images-main");
  });

  it("Should fetch the images", async function () {
    const doc = await db.get(result.id);
    const files = doc._files as DocFiles;
    expect(files).toBeTruthy();
    const keys = Object.keys(files);
    let fileMeta = files[keys[0]] as DocFileMeta;
    expect(fileMeta).toBeTruthy();
    expect(imagefiles[0].file.type).toBeTruthy();
    expect(fileMeta.type).toBeTruthy();
    expect(fileMeta.type).toBe(imagefiles[0].file.type);
    expect(fileMeta.size).toBe(imagefiles[0].file.size);
    expect(fileMeta.cid.toString()).toBe(imagefiles[0].cid);
    expect(typeof fileMeta.file).toBe("function");
    let file = (await fileMeta.file?.()) as File;

    expect(file.type).toBe(imagefiles[0].file.type);
    expect(file.size).toBe(imagefiles[0].file.size);
    // expect(file.name).toBe('image.jpg') // see https://github.com/fireproof-storage/fireproof/issues/70

    fileMeta = files[keys[1]] as DocFileMeta;
    expect(fileMeta.type).toBe(imagefiles[1].file.type);
    expect(fileMeta.size).toBe(imagefiles[1].file.size);
    expect(fileMeta.cid.toString()).toBe(imagefiles[1].cid);
    expect(typeof fileMeta.file).toBe("function");
    file = (await fileMeta.file?.()) as File;

    expect(file.type).toBe(imagefiles[1].file.type);
    expect(file.size).toBe(imagefiles[1].file.size);
    // expect(file.name).toBe('fireproof.png') // see https://github.com/fireproof-storage/fireproof/issues/70
  });

  it("should update the file document data without changing the files", async function () {
    interface Doc {
      type: string;
    }
    const doc = await db.get<Doc>(result.id);
    let files = doc._files || {};
    let keys = Object.keys(files);
    let fileMeta = files[keys[0]] as DocFileMeta;
    expect(fileMeta.type).toBe(imagefiles[0].file.type);
    expect(fileMeta.size).toBe(imagefiles[0].file.size);
    expect(fileMeta.cid.toString()).toBe(imagefiles[0].cid);
    expect(typeof fileMeta.file).toBe("function");
    let file = (await fileMeta.file?.()) as File;

    expect(file.type).toBe(imagefiles[0].file.type);
    expect(file.size).toBe(imagefiles[0].file.size);

    doc.type = "images";
    const r2 = await db.put(doc);
    expect(r2.id).toBe("images-main");
    const readDoc = await db.get<Doc>(r2.id);
    expect(readDoc.type).toBe("images");
    files = readDoc._files || {};
    keys = Object.keys(files);
    fileMeta = files[keys[0]] as DocFileMeta;
    expect(fileMeta.type).toBe(imagefiles[0].file.type);
    expect(fileMeta.size).toBe(imagefiles[0].file.size);
    expect(fileMeta.cid.toString()).toBe(imagefiles[0].cid);
    expect(typeof fileMeta.file).toBe("function");
    file = (await fileMeta.file?.()) as File;

    expect(file.type).toBe(imagefiles[0].file.type);
    expect(file.size).toBe(imagefiles[0].file.size);
  });
});

describe("StoreURIRuntime", () => {
  const sthis = mockSuperThis();
  let safeEnv: string | undefined;
  let unreg: () => void;
  beforeEach(async () => {
    await sthis.start();
    safeEnv = sthis.env.get("FP_STORAGE_URL");
    sthis.env.set("FP_STORAGE_URL", "my://bla/storage");
    unreg = bs.registerStoreProtocol({
      protocol: "murks",
      isDefault: true,
      defaultURI: function (): URI {
        return URI.from("murks://fp");
      },
      gateway: function (): Promise<bs.Gateway> {
        throw new Error("Function not implemented.");
      },
      test: function (): Promise<bs.TestGateway> {
        throw new Error("Function not implemented.");
      },
    });
  });
  afterEach(() => {
    sthis.env.set("FP_STORAGE_URL", safeEnv);
    unreg();
  });
  it("default toStoreURIRuntime", () => {
    expect(JSON.parse(JSON.stringify(toStoreURIRuntime(sthis, "test")))).toEqual({
      data: {
        data: "my://bla/storage?name=test&store=data&storekey=%40test-data%40&suffix=.car&urlGen=fromEnv",
        file: "my://bla/storage?name=test&store=data&storekey=%40test-data%40&urlGen=fromEnv",
        meta: "my://bla/storage?name=test&store=meta&storekey=%40test-meta%40&urlGen=fromEnv",
        wal: "my://bla/storage?name=test&store=wal&storekey=%40test-wal%40&urlGen=fromEnv",
      },
      idx: {
        data: "my://bla/storage?index=idx&name=test&store=data&storekey=%40test-data-idx%40&suffix=.car&urlGen=fromEnv",
        file: "my://bla/storage?index=idx&name=test&store=data&storekey=%40test-data-idx%40&urlGen=fromEnv",
        meta: "my://bla/storage?index=idx&name=test&store=meta&storekey=%40test-meta-idx%40&urlGen=fromEnv",
        wal: "my://bla/storage?index=idx&name=test&store=wal&storekey=%40test-wal-idx%40&urlGen=fromEnv",
      },
    });
    // keyConfigOpts(sthis: SuperThis, name: string, opts?: ConfigOpts): string {
  });
  it("no name toStoreURIRuntime", () => {
    expect(JSON.parse(JSON.stringify(toStoreURIRuntime(sthis)))).toEqual({
      data: {
        data: "my://bla/storage?name=storage&store=data&storekey=%40storage-data%40&suffix=.car&urlGen=fromEnv",
        file: "my://bla/storage?name=storage&store=data&storekey=%40storage-data%40&urlGen=fromEnv",
        meta: "my://bla/storage?name=storage&store=meta&storekey=%40storage-meta%40&urlGen=fromEnv",
        wal: "my://bla/storage?name=storage&store=wal&storekey=%40storage-wal%40&urlGen=fromEnv",
      },
      idx: {
        data: "my://bla/storage?index=idx&name=storage&store=data&storekey=%40storage-data-idx%40&suffix=.car&urlGen=fromEnv",
        file: "my://bla/storage?index=idx&name=storage&store=data&storekey=%40storage-data-idx%40&urlGen=fromEnv",
        meta: "my://bla/storage?index=idx&name=storage&store=meta&storekey=%40storage-meta-idx%40&urlGen=fromEnv",
        wal: "my://bla/storage?index=idx&name=storage&store=wal&storekey=%40storage-wal-idx%40&urlGen=fromEnv",
      },
    });
  });

  it("set toStoreURIRuntime", () => {
    expect(
      JSON.parse(
        JSON.stringify(
          toStoreURIRuntime(sthis, "xxx", {
            base: "my://storage-base",
            data: {
              data: "my://storage-data?name=yyy",
              meta: "my://storage-meta",
            },
            idx: {
              data: "my://storage-idx-data?name=yyy&index=bla",
              meta: "my://storage-idx-meta",
            },
          }),
        ),
      ),
    ).toEqual({
      data: {
        data: "my://storage-data?name=yyy&store=data&storekey=%40yyy-data%40&suffix=.car",
        file: "my://storage-data?name=yyy&store=data&storekey=%40yyy-data%40",
        meta: "my://storage-meta?name=storage-meta&store=meta&storekey=%40storage-meta-meta%40",
        wal: "my://storage-base?name=xxx&store=wal&storekey=%40xxx-wal%40",
      },
      idx: {
        data: "my://storage-idx-data?index=bla&name=yyy&store=data&storekey=%40yyy-data-idx%40&suffix=.car",
        file: "my://storage-idx-data?index=bla&name=yyy&store=data&storekey=%40yyy-data-idx%40",
        meta: "my://storage-idx-meta?index=idx&name=storage-idx-meta&store=meta&storekey=%40storage-idx-meta-meta-idx%40",
        wal: "my://storage-base?index=idx&name=xxx&store=wal&storekey=%40xxx-wal-idx%40",
      },
    });
  });

  it("default-reg toStoreURIRuntime", () => {
    sthis.env.delete("FP_STORAGE_URL");
    expect(JSON.parse(JSON.stringify(toStoreURIRuntime(sthis, "maxi")))).toEqual({
      data: {
        data: "murks://fp?name=maxi&store=data&storekey=%40maxi-data%40&suffix=.car&urlGen=default",
        file: "murks://fp?name=maxi&store=data&storekey=%40maxi-data%40&urlGen=default",
        meta: "murks://fp?name=maxi&store=meta&storekey=%40maxi-meta%40&urlGen=default",
        wal: "murks://fp?name=maxi&store=wal&storekey=%40maxi-wal%40&urlGen=default",
      },
      idx: {
        data: "murks://fp?index=idx&name=maxi&store=data&storekey=%40maxi-data-idx%40&suffix=.car&urlGen=default",
        file: "murks://fp?index=idx&name=maxi&store=data&storekey=%40maxi-data-idx%40&urlGen=default",
        meta: "murks://fp?index=idx&name=maxi&store=meta&storekey=%40maxi-meta-idx%40&urlGen=default",
        wal: "murks://fp?index=idx&name=maxi&store=wal&storekey=%40maxi-wal-idx%40&urlGen=default",
      },
    });
  });

  it("keyConfigOpts", () => {
    expect(JSON.parse(keyConfigOpts(sthis, "test"))).toEqual([
      {
        name: "test",
      },
      {
        stores: [
          {
            data: {
              data: "my://bla/storage?name=test&store=data&storekey=%40test-data%40&suffix=.car&urlGen=fromEnv",
              file: "my://bla/storage?name=test&store=data&storekey=%40test-data%40&urlGen=fromEnv",
              meta: "my://bla/storage?name=test&store=meta&storekey=%40test-meta%40&urlGen=fromEnv",
              wal: "my://bla/storage?name=test&store=wal&storekey=%40test-wal%40&urlGen=fromEnv",
            },
          },
          {
            idx: {
              data: "my://bla/storage?index=idx&name=test&store=data&storekey=%40test-data-idx%40&suffix=.car&urlGen=fromEnv",
              file: "my://bla/storage?index=idx&name=test&store=data&storekey=%40test-data-idx%40&urlGen=fromEnv",
              meta: "my://bla/storage?index=idx&name=test&store=meta&storekey=%40test-meta-idx%40&urlGen=fromEnv",
              wal: "my://bla/storage?index=idx&name=test&store=wal&storekey=%40test-wal-idx%40&urlGen=fromEnv",
            },
          },
        ],
      },
    ]);
  });

  it("check file protocol defaultURI", () => {
    const gw = fileGatewayFactoryItem();
    expect(gw.defaultURI(sthis).toString()).toBe(
      `file://${sthis.env.get("HOME")}/.fireproof/${FILESTORE_VERSION.replace(/-.*$/, "")}`,
    );
  });
});
