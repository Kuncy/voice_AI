import type { FlushSentinel, llm } from "@livekit/agents";
import { ReadableStream } from "node:stream/web";

type LlmChunk = llm.ChatChunk | string | FlushSentinel;

export function captureGeneratedText(stream: ReadableStream<LlmChunk>): ReadableStream<LlmChunk> {
  const reader = stream.getReader();
  let generatedText = "";
  return new ReadableStream<LlmChunk>({
    async pull(controller) {
      const { done, value } = await reader.read();
      if (done) {
        controller.close();
        return;
      }
      if (typeof value === "string") {
        generatedText += value;
        controller.enqueue(value);
        return;
      }
      if (value && typeof value === "object" && "delta" in value && value.delta) {
        generatedText += value.delta.content ?? "";
        controller.enqueue({
          ...value,
          delta: {
            ...value.delta,
            extra: { ...value.delta.extra, generatedText },
          },
        });
        return;
      }
      controller.enqueue(value);
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
}
