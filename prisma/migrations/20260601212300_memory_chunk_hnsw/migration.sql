-- HNSW index for cosine-distance similarity search over memory embeddings.
CREATE INDEX IF NOT EXISTS "MemoryChunk_embedding_hnsw"
  ON "MemoryChunk"
  USING hnsw ("embedding" vector_cosine_ops);
