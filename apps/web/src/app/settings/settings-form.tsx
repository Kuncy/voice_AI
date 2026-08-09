"use client";

import { type AgentSettings, agentToneOptions } from "@heyvera/core";
import { useActionState, useEffect, useState } from "react";
import { type SettingsActionState, updateAgentSettings } from "./actions";

const initialSettingsActionState: SettingsActionState = { status: "idle" };

export function SettingsForm({ settings, updatedAt }: { settings: AgentSettings; updatedAt: string }) {
  const [state, formAction, pending] = useActionState(updateAgentSettings, initialSettingsActionState);
  const [values, setValues] = useState(settings);

  useEffect(() => {
    setValues(settings);
  }, [settings]);

  return (
    <form action={formAction} className="settings-form">
      <div className="settings-grid">
        <label className="field">
          <span>Name</span>
          <input
            name="name"
            value={values.name}
            onChange={(event) => setValues((current) => ({ ...current, name: event.target.value }))}
            minLength={2}
            maxLength={50}
            required
          />
          {state.errors?.name?.map((error) => (
            <small className="field-error" key={error}>
              {error}
            </small>
          ))}
        </label>

        <label className="field">
          <span>Sprache</span>
          <input value="Deutsch" disabled aria-describedby="language-note" />
          <small id="language-note">
            Fest eingestellt – Mehrsprachigkeit ist bewusst kein Bestandteil dieser Version.
          </small>
        </label>

        <label className="field field-wide">
          <span>Tonalität</span>
          <select
            name="tone"
            value={values.tone}
            onChange={(event) =>
              setValues((current) => ({ ...current, tone: event.target.value as AgentSettings["tone"] }))
            }
          >
            {agentToneOptions.map((tone) => (
              <option value={tone} key={tone}>
                {tone}
              </option>
            ))}
          </select>
          {state.errors?.tone?.map((error) => (
            <small className="field-error" key={error}>
              {error}
            </small>
          ))}
        </label>

        <label className="field field-wide">
          <span>System-Prompt</span>
          <textarea
            name="systemPrompt"
            value={values.systemPrompt}
            onChange={(event) => setValues((current) => ({ ...current, systemPrompt: event.target.value }))}
            minLength={20}
            maxLength={4_000}
            rows={8}
            required
          />
          <small>
            Die nicht überschreibbaren Sprach- und Sicherheitsregeln werden diesem Text automatisch vorangestellt.
          </small>
          {state.errors?.systemPrompt?.map((error) => (
            <small className="field-error" key={error}>
              {error}
            </small>
          ))}
        </label>
      </div>

      <div className="settings-actions">
        <button className="save-button" type="submit" disabled={pending}>
          {pending ? "Wird gespeichert …" : "Einstellungen speichern"}
        </button>
        {state.message && (
          <p className={`form-message form-message-${state.status}`} aria-live="polite">
            {state.message}
          </p>
        )}
        {!state.message && (
          <p className="last-saved">Zuletzt gespeichert {new Date(updatedAt).toLocaleString("de-DE")}</p>
        )}
      </div>
    </form>
  );
}
