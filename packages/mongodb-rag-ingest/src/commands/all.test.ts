import {
  PageStore,
  EmbeddedContentStore,
  assertEnvVars,
} from "mongodb-rag-core";
import { DataSource } from "mongodb-rag-core/dataSources";
import { MongoClient } from "mongodb-rag-core/mongodb";
import "dotenv/config";
import { INGEST_ENV_VARS } from "../IngestEnvVars";
import { doAllCommand } from "./all";
import { makeIngestMetaStore } from "../IngestMetaStore";
import "dotenv/config";

jest.setTimeout(1000000);

const dataSources: DataSource[] = [];

describe("allCommand", () => {
  const embedder = {
    async embed() {
      return { embedding: [1, 2, 3] };
    },
  };

  const { MONGODB_CONNECTION_URI: connectionUri } =
    assertEnvVars(INGEST_ENV_VARS);

  const mockEmbeddedContentStore: EmbeddedContentStore = {
    async deleteEmbeddedContent() {
      return;
    },
    async findNearestNeighbors() {
      return [];
    },
    async loadEmbeddedContent() {
      return [];
    },
    async updateEmbeddedContent() {
      return;
    },
    metadata: {
      embeddingName: "embeddedName",
    },
  };
  const mockPageStore: PageStore = {
    async loadPages() {
      return [];
    },
    async updatePages() {
      return;
    },
    async deletePages() {
      return;
    },
  };

  let databaseName: string;

  beforeEach(async () => {
    databaseName = `test-all-command-${Date.now()}-${Math.floor(
      Math.random() * 10000000
    )}`;
  });

  afterEach(async () => {
    const client = await MongoClient.connect(connectionUri);
    try {
      const db = client.db(databaseName);
      await db.dropDatabase();
    } finally {
      await client.close();
    }
  });

  it("updates the metadata with the last successful timestamp", async () => {
    const ingestMetaStore = makeIngestMetaStore({
      connectionUri,
      databaseName,
      entryId: "all",
    });
    try {
      let lastSuccessfulRunDate =
        await ingestMetaStore.loadLastSuccessfulRunDate();
      expect(lastSuccessfulRunDate).toBeNull();
      await doAllCommand(
        {
          pageStore: mockPageStore,
          embeddedContentStore: mockEmbeddedContentStore,
          ingestMetaStore,
          embedder,
          dataSources,
        },
        {
          async doUpdatePagesCommand() {
            return;
          },
        }
      );
      lastSuccessfulRunDate = await ingestMetaStore.loadLastSuccessfulRunDate();
      expect(lastSuccessfulRunDate?.getTime()).toBeGreaterThan(
        Date.now() - 5000
      );
      expect(lastSuccessfulRunDate?.getTime()).toBeLessThanOrEqual(Date.now());
    } finally {
      await ingestMetaStore.close();
    }
  });

  it("does not update the metadata with the last successful timestamp on failure", async () => {
    const ingestMetaStore = makeIngestMetaStore({
      connectionUri,
      databaseName,
      entryId: "all",
    });
    try {
      let lastSuccessfulRunDate =
        await ingestMetaStore.loadLastSuccessfulRunDate();
      expect(lastSuccessfulRunDate).toBeNull();
      try {
        await doAllCommand(
          {
            pageStore: mockPageStore,
            embeddedContentStore: mockEmbeddedContentStore,
            ingestMetaStore,
            embedder,
            dataSources,
          },
          {
            async doUpdatePagesCommand() {
              // Sudden failure!
              throw new Error("Fail!");
            },
          }
        );
      } catch (e: unknown) {
        expect((e as { message: string }).message).toBe("Fail!");
      }
      lastSuccessfulRunDate = await ingestMetaStore.loadLastSuccessfulRunDate();
      // Not updated because run failed
      expect(lastSuccessfulRunDate).toBeNull();
    } finally {
      await ingestMetaStore.close();
    }
  });
});
