import { format, parse } from "@ipld/dag-json";
import { EventBlock, decodeEventBlock } from "@web3-storage/pail/clock";
import { EventView } from "@web3-storage/pail/clock/api";
import type { DbMeta, CarClockHead, DbMetaEventBlock, CarClockLink, DbMetaEvent } from "./types.js";
import { SuperThis, CRDTEntry } from "../types.js";
import { CID, Link } from "multiformats";
import { base64pad } from "multiformats/bases/base64";
import { Result, URI } from "@adviser/cement";
import { getKeyBag } from "../runtime/key-bag.js";

export async function decodeGatewayMetaBytesToDbMeta(sthis: SuperThis, byteHeads: Uint8Array): Promise<DbMetaEvent[]> {
  const crdtEntries = JSON.parse(sthis.txt.decode(byteHeads)) as CRDTEntry[];
  if (!crdtEntries.length) {
    sthis.logger.Debug().Any("byteHeads", byteHeads).Msg("No CRDT entries found");
    return [];
  }
  if (!crdtEntries.map) {
    sthis.logger.Debug().Any("crdtEntries", crdtEntries).Msg("No data in CRDT entries");
    return [];
  }
  return Promise.all(
    crdtEntries.map(async (crdtEntry) => {
      const eventBlock = await decodeEventBlock<{ dbMeta: Uint8Array }>(base64pad.decode(crdtEntry.data));
      const dbMeta = parse<DbMeta>(sthis.txt.decode(eventBlock.value.data.dbMeta));
      return {
        eventCid: eventBlock.cid as CarClockLink,
        parents: crdtEntry.parents,
        dbMeta: dbMeta,
      };
    }),
  );
}

export async function setCryptoKeyFromGatewayMetaPayload(uri: URI, sthis: SuperThis, data: Uint8Array): Promise<Result<DbMeta[]>> {
  try {
    sthis.logger.Debug().Str("uri", uri.toString()).Msg("Setting crypto key from gateway meta payload");
    const keyInfo = await decodeGatewayMetaBytesToDbMeta(sthis, data);
    if (keyInfo.length) {
      const dbMeta = keyInfo[0].dbMeta;
      if (dbMeta.key) {
        const kb = await getKeyBag(sthis);
        const keyName = getStoreKeyName(uri);
        const res = await kb.setNamedKey(keyName, dbMeta.key);
        if (res.isErr()) {
          sthis.logger.Debug().Str("keyName", keyName).Str("dbMeta.key", dbMeta.key).Msg("Failed to set named key");
          throw res.Err();
        }
      }
      sthis.logger.Debug().Str("dbMeta.key", dbMeta.key).Str("uri", uri.toString()).Msg("Set crypto key from gateway meta payload");
      return Result.Ok([dbMeta]);
    }
    sthis.logger.Debug().Any("data", data).Msg("No crypto in gateway meta payload");
    return Result.Ok([]);
  } catch (error) {
    return sthis.logger.Debug().Err(error).Msg("Failed to set crypto key from gateway meta payload").ResultError();
  }
}

export async function addCryptoKeyToGatewayMetaPayload(uri: URI, sthis: SuperThis, body: Uint8Array): Promise<Result<Uint8Array>> {
  try {
    sthis.logger.Debug().Str("uri", uri.toString()).Msg("Adding crypto key to gateway meta payload");
    const keyName = getStoreKeyName(uri);
    const kb = await getKeyBag(sthis);
    const res = await kb.getNamedExtractableKey(keyName, true);
    if (res.isErr()) {
      sthis.logger.Error().Str("keyName", keyName).Msg("Failed to get named extractable key");
      throw res.Err();
    }
    const keyData = await res.Ok().extract();
    const dbMetas = await decodeGatewayMetaBytesToDbMeta(sthis, body);
    const { dbMeta, parents } = dbMetas[0]; // as { dbMeta: DbMeta };
    const parentLinks = parents.map((p) => CID.parse(p) as CarClockLink);
    dbMeta.key = keyData.keyStr;
    const events = await Promise.all([dbMeta].map((dbMeta) => createDbMetaEventBlock(sthis, dbMeta, parentLinks)));
    const encoded = await encodeEventsWithParents(sthis, events, parentLinks);
    sthis.logger.Debug().Str("uri", uri.toString()).Msg("Added crypto key to gateway meta payload");
    return Result.Ok(encoded);
  } catch (error) {
    sthis.logger.Error().Err(error).Msg("Failed to add crypto key to gateway meta payload");
    return Result.Err(error as Error);
  }
}

export function getStoreKeyName(url: URI): string {
  const storeKeyName = [url.getParam("localName") || url.getParam("name")];
  const idx = url.getParam("index");
  if (idx) {
    storeKeyName.push(idx);
  }
  storeKeyName.push("data");
  return `@${storeKeyName.join(":")}@`;
}

export async function createDbMetaEventBlock(sthis: SuperThis, dbMeta: DbMeta, parents: CarClockHead): Promise<DbMetaEventBlock> {
  const event = await EventBlock.create(
    {
      dbMeta: sthis.txt.encode(format(dbMeta)),
    },
    parents as unknown as Link<EventView<{ dbMeta: Uint8Array }>, number, number, 1>[],
  );
  return event as EventBlock<{ dbMeta: Uint8Array }>;
}

export async function encodeEventsWithParents(
  sthis: SuperThis,
  events: EventBlock<{ dbMeta: Uint8Array }>[],
  parents: CarClockHead,
): Promise<Uint8Array> {
  const crdtEntries = events.map((event) => {
    const base64String = base64pad.encode(event.bytes);
    return {
      cid: event.cid.toString(),
      data: base64String,
      parents: parents.map((p) => p.toString()),
    };
  });
  return sthis.txt.encode(JSON.stringify(crdtEntries));
}
