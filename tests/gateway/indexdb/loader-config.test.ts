import { fireproof } from "@fireproof/core";
import { mockSuperThis } from "../../helpers";

describe("fireproof config indexdb", () => {
  const _my_app = "my-app";
  function my_app() {
    return _my_app;
  }
  const sthis = mockSuperThis();
  beforeAll(async () => {
    await sthis.start();
  });

  it("indexdb-loader", async () => {
    const db = fireproof(my_app());
    await db.put({ name: "my-app" });
    expect(db.name()).toBe(my_app());

    const fileStore = await db.crdt.blockstore.loader?.fileStore();
    expect(fileStore?.url().asObj()).toEqual({
      pathname: "fp",
      protocol: "indexdb:",
      searchParams: {
        name: "my-app",
        store: "data",
        storekey: "@my-app-data@",
        urlGen: "default",
        version: "v0.19-indexdb",
      },
      style: "path",
    });

    const dataStore = await db.crdt.blockstore.loader?.carStore();
    expect(dataStore?.url().asObj()).toEqual({
      pathname: "fp",
      protocol: "indexdb:",
      searchParams: {
        name: "my-app",
        store: "data",
        storekey: "@my-app-data@",
        suffix: ".car",
        urlGen: "default",
        version: "v0.19-indexdb",
      },
      style: "path",
    });
    const metaStore = await db.crdt.blockstore.loader?.metaStore();
    expect(metaStore?.url().asObj()).toEqual({
      pathname: "fp",
      protocol: "indexdb:",
      searchParams: {
        name: "my-app",
        store: "meta",
        storekey: "@my-app-meta@",
        urlGen: "default",
        version: "v0.19-indexdb",
      },
      style: "path",
    });
    const WALStore = await db.crdt.blockstore.loader?.WALStore();
    expect(WALStore?.url().asObj()).toEqual({
      pathname: "fp",
      protocol: "indexdb:",
      searchParams: {
        name: "my-app",
        store: "wal",
        storekey: "@my-app-wal@",
        urlGen: "default",
        version: "v0.19-indexdb",
      },
      style: "path",
    });
    await db.close();
  });
});
