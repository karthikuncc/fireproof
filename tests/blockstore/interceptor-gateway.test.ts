import { Result, URI } from "@adviser/cement";
import { bs, fireproof } from "@fireproof/core";
import {
  GatewayBuildUrlReturn,
  GatewayCloseReturn,
  GatewayDeleteReturn,
  GatewayDestroyReturn,
  GatewayGetReturn,
  GatewayPutReturn,
  GatewayStartReturn,
  GatewaySubscribeReturn,
} from "../../src/blockstore/gateway";

class TestInterceptor extends bs.PassThroughGateway {
  readonly fn = vitest.fn();

  async buildUrl(baseUrl: URI, key: string): Promise<Result<GatewayBuildUrlReturn>> {
    const ret = await super.buildUrl(baseUrl, key);
    this.fn("buildUrl", ret);
    return ret;
  }

  async start(baseUrl: URI): Promise<Result<GatewayStartReturn>> {
    const ret = await super.start(baseUrl);
    this.fn("start", ret);
    return ret;
  }
  async close(baseUrl: URI): Promise<Result<GatewayCloseReturn>> {
    const ret = await super.close(baseUrl);
    this.fn("close", ret);
    return ret;
  }
  async delete(baseUrl: URI): Promise<Result<GatewayDeleteReturn>> {
    const ret = await super.delete(baseUrl);
    this.fn("delete", ret);
    return ret;
  }
  async destroy(baseUrl: URI): Promise<Result<GatewayDestroyReturn>> {
    const ret = await super.destroy(baseUrl);
    this.fn("destroy", ret);
    return ret;
  }
  async put(url: URI, body: Uint8Array): Promise<Result<GatewayPutReturn>> {
    const ret = await super.put(url, body);
    this.fn("put", ret);
    return ret;
  }
  async get(url: URI): Promise<Result<GatewayGetReturn>> {
    const ret = await super.get(url);
    this.fn("get", ret);
    return ret;
  }
  async subscribe(url: URI, callback: (meta: Uint8Array) => void): Promise<Result<GatewaySubscribeReturn>> {
    const ret = await super.subscribe(url, callback);
    this.fn("subscribe", ret);
    return ret;
  }
}

describe("InterceptorGateway", () => {
  it("passthrough", async () => {
    const gwi = new TestInterceptor();
    const db = fireproof("interceptor-gateway", {
      gatewayInterceptor: gwi,
    });
    expect(
      await db.put({
        _id: "foo",
        foo: 4,
      }),
    );
    expect(await db.get("foo")).toEqual({
      _id: "foo",
      foo: 4,
    });
    await db.close();
    await db.destroy();
    expect(gwi.fn.mock.calls.length).toBe(42);
    // might be a stupid test
    expect(gwi.fn.mock.calls.map((i) => i[0])).toEqual([
      "start",
      "start",
      "buildUrl",
      "get",
      "buildUrl",
      "get",
      "start",
      "start",
      "buildUrl",
      "get",
      "buildUrl",
      "put",
      "buildUrl",
      "put",
      "buildUrl",
      "put",
      "start",
      "start",
      "start",
      "start",
      "start",
      "start",
      "start",
      "start",
      "start",
      "start",
      "start",
      "start",
      "buildUrl",
      "get",
      "start",
      "start",
      "start",
      "start",
      "destroy",
      "destroy",
      "destroy",
      "destroy",
      "destroy",
      "destroy",
      "destroy",
      "destroy",
    ]);
  });
});