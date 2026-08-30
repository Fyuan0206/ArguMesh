/**
 * Bridge ArguMesh Settings AI config → Pi ModelRuntime.
 * API keys stay in-memory via setRuntimeApiKey (models.json only has a placeholder).
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import type { AiProviderConfig } from "./ai";

const PROVIDER_ID = "argumesh";

export interface PiModelBridge {
  modelRuntime: ModelRuntime;
  model: NonNullable<ReturnType<ModelRuntime["getModel"]>>;
  agentDir: string;
  providerId: string;
  modelId: string;
}

/** Create an OpenAI-compatible Pi model pointing at the user's Settings/env provider. */
export async function createPiModelBridge(provider: AiProviderConfig, modelId: string): Promise<PiModelBridge> {
  const agentDir = join(tmpdir(), "argumesh-pi-agent");
  mkdirSync(agentDir, { recursive: true });
  writeFileSync(
    join(agentDir, "models.json"),
    JSON.stringify({
      providers: {
        [PROVIDER_ID]: {
          baseUrl: provider.baseUrl,
          api: "openai-completions",
          apiKey: "argumesh-runtime",
          models: [
            {
              id: modelId,
              name: modelId,
              reasoning: false,
              input: ["text"],
              contextWindow: 128_000,
              maxTokens: 8_192,
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
            },
          ],
        },
      },
    }),
    "utf8",
  );

  const modelRuntime = await ModelRuntime.create({
    authPath: join(agentDir, "auth.json"),
    modelsPath: join(agentDir, "models.json"),
    allowModelNetwork: false,
    refreshOnCreate: false,
  });
  await modelRuntime.setRuntimeApiKey(PROVIDER_ID, provider.apiKey);

  const model = modelRuntime.getModel(PROVIDER_ID, modelId);
  if (!model) {
    throw new Error(`PI_MODEL_UNAVAILABLE: cannot load model ${PROVIDER_ID}/${modelId}`);
  }
  return { modelRuntime, model, agentDir, providerId: PROVIDER_ID, modelId };
}
