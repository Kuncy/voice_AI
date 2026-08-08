import assert from "node:assert/strict";
import { ReadableStream } from "node:stream/web";
import test from "node:test";
import type { llm } from "@livekit/agents";
import { captureGeneratedText } from "./capture-generated-text";

test("adds the complete generated text so interrupted items can retain text ahead of playout", async () => {
  const chunks: llm.ChatChunk[] = [
    { id: "reply", delta: { role: "assistant", content: "Das ist " } },
    { id: "reply", delta: { role: "assistant", content: "der vollständige Text." } },
  ];
  const source = new ReadableStream<llm.ChatChunk>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      controller.close();
    },
  });
  const reader = captureGeneratedText(source).getReader();
  const output: llm.ChatChunk[] = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (typeof value === "object" && value && "id" in value) output.push(value);
  }
  assert.equal(output[0]?.delta?.extra?.generatedText, "Das ist ");
  assert.equal(output[1]?.delta?.extra?.generatedText, "Das ist der vollständige Text.");
});
