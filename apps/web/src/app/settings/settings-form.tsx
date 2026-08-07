"use client";

import { useActionState } from "react";
import { agentToneOptions, type AgentSettings } from "@heyvera/core";
import {
  type SettingsActionState,
  updateAgentSettings,
} from "./actions";

const initialSettingsActionState: SettingsActionState = { status: "idle" };

export function SettingsForm({ settings }: { settings: AgentSettings }) {
  const [state, formAction, pending] = useActionState(updateAgentSettings, initialSettingsActionState);

  return (
    <form action={formAction} className="settings-form">
      <div className="settings-grid">
        <label className="field">
          <span>Name</span>
          <input name="name" defaultValue={settings.name} minLength={2} maxLength={50} required />
          {state.errors?.name?.map((error) => <small className="field-error" key={error}>{error}</small>)}
        </label>

        <label className="field">
          <span>Sprache</span>
          <input value="Deutsch" disabled aria-describedby="language-note" />
          <small id="language-note">Fest eingestellt – Mehrsprachigkeit ist bewusst kein Bestandteil dieser Version.</small>
        </label>

        <label className="field field-wide">
          <span>Tonalität</span>
          <select name="tone" defaultValue={settings.tone}>
            {agentToneOptions.map((tone) => <option value={tone} key={tone}>{tone}</option>)}
          </select>
          {state.errors?.tone?.map((error) => <small className="field-error" key={error}>{error}</small>)}
        </label>

        <label className="field field-wide">
          <span>System-Prompt</span>
          <textarea name="systemPrompt" defaultValue={settings.systemPrompt} minLength={20} maxLength={4_000} rows={9} required />
          <small>Die nicht überschreibbaren Sprach- und Sicherheitsregeln werden diesem Text automatisch vorangestellt.</small>
          {state.errors?.systemPrompt?.map((error) => <small className="field-error" key={error}>{error}</small>)}
        </label>
      </div>

      <div className="settings-actions">
        <button className="save-button" type="submit" disabled={pending}>
          {pending ? "Wird gespeichert …" : "Einstellungen speichern"}
        </button>
        {state.message && <p className={`form-message form-message-${state.status}`} aria-live="polite">{state.message}</p>}
      </div>
    </form>
  );
}
