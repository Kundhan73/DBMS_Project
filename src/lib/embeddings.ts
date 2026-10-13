// Text embedding for the vector side of the system.
// Model: sentence-transformers all-MiniLM-L6-v2 (ONNX build "Xenova/all-MiniLM-L6-v2"),
// 384 dimensions, mean pooling, L2-normalised -> cosine distance in pgvector.
// Runs locally inside the Node process via transformers.js: no external API,
// no API key, and maintenance text never leaves the server.
import { createHash } from 'node:crypto';
import { env, pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers';

export const EMBEDDING_MODEL = process.env.EMBEDDING_MODEL ?? 'Xenova/all-MiniLM-L6-v2';
export const EMBEDDING_DIM = 384;

let extractor: Promise<FeatureExtractionPipeline> | null = null;

function getExtractor(): Promise<FeatureExtractionPipeline> {
  if (!extractor) {
    // Offline mode: load weights from a local folder instead of the Hugging Face hub
    if (process.env.TRANSFORMERS_LOCAL_MODEL_PATH) {
      env.localModelPath = process.env.TRANSFORMERS_LOCAL_MODEL_PATH;
      env.allowRemoteModels = false;
    }
    if (process.env.TRANSFORMERS_CACHE_DIR) env.cacheDir = process.env.TRANSFORMERS_CACHE_DIR;
    extractor = pipeline('feature-extraction', EMBEDDING_MODEL, { dtype: 'fp32' }) as Promise<FeatureExtractionPipeline>;
  }
  return extractor;
}

export async function embed(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const f = await getExtractor();
  const out = await f(texts, { pooling: 'mean', normalize: true });
  return out.tolist() as number[][];
}

export async function embedOne(text: string): Promise<number[]> {
  return (await embed([text]))[0];
}

/** The exact text that is embedded for a maintenance request. */
export function requestText(title: string, description: string): string {
  return `${title.trim()}. ${description.trim()}`;
}

export function textHash(text: string): string {
  return createHash('md5').update(text).digest('hex');
}

/** pgvector literal, e.g. '[0.1,0.2,...]' */
export function toPgVector(v: number[]): string {
  return '[' + v.map((x) => x.toFixed(7)).join(',') + ']';
}
