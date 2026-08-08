"use client";

import { deleteConversation } from "./actions";

export function DeleteConversationButton({ conversationId }: { conversationId: string }) {
  return (
    <form
      action={deleteConversation}
      onSubmit={(event) => {
        if (!window.confirm("Conversation einschließlich Transkript und Vorgängen endgültig löschen?")) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="conversationId" value={conversationId} />
      <button className="danger-button" type="submit">Conversation endgültig löschen</button>
    </form>
  );
}
