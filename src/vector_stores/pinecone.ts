import { PineconeClient, utils as pineconeUtils } from '@pinecone-database/pinecone';

const { chunkedUpsert } = pineconeUtils;

import type { VectorStore, VectorizedDocument, VectorQuery, VectorQueryResult } from '../types';

export class Pinecone implements VectorStore {
  private index: string;
  private namespace: string;
  private client: PineconeClient;
  private initialized: Promise<void>;

  constructor(options: {
    index: string;
    namespace: string;
    client?: PineconeClient;
    apiKey?: string;
    environment?: string;
  }) {
    this.index = options.index;
    this.namespace = options.namespace;

    if (options.client) {
      this.client = options.client;
      this.initialized = Promise.resolve();
    } else {
      const { apiKey, environment } = options;

      if (!apiKey || !environment) {
        throw new Error(
          'apiKey and environment options are required when the client option is not provided'
        );
      }

      this.client = new PineconeClient();
      this.initialized = this.client.init({ apiKey, environment });
    }
  }

  async add(documents: VectorizedDocument[], options?: { chunkSize?: number }): Promise<string[]> {
    await this.initialized;

    const ids = [];
    const vectors = [];

    for (const document of documents) {
      ids.push(document.id);

      vectors.push({
        id: document.id,
        values: document.embedding,
        metadata: {
          ...document.metadata,
          _text: document.text,
        },
      });
    }

    const index = this.getIndex();
    await chunkedUpsert(index, vectors, this.namespace, options?.chunkSize);

    return ids;
  }

  async query(query: VectorQuery): Promise<VectorQueryResult[]> {
    await this.initialized;

    const index = this.getIndex();
    const response = await index.query({
      queryRequest: {
        topK: query.topK,
        vector: query.embedding,
        namespace: this.namespace,
        includeMetadata: true,
      },
    });

    const matches = response.matches || [];

    return matches.map((match) => {
      const metadata = match.metadata as Record<string, any>;
      const text = metadata._text;

      delete metadata._text;

      return {
        id: match.id,
        document: {
          id: match.id,
          text: text,
          metadata: metadata,
        },
        similarity: match.score || null,
      };
    });
  }

  private getIndex() {
    return this.client.Index(this.index);
  }
}