/**
 * Context section — project description, specific concerns, questions.
 * Tier 3: requires custom rendering (textareas, dynamic question array).
 */

import { Label, Input } from "../form-primitives";
import type { BuildingProject } from "@/lib/types";
import type { Translations } from "@/lib/i18n";

interface ContextSectionProps {
  project: BuildingProject;
  updateProjectContext: (field: string, value: string | string[]) => void;
  t: Translations;
}

export default function ContextSection({ project, updateProjectContext, t }: ContextSectionProps) {
  return (
    <div className="grid grid-cols-1 gap-4">
      <div className="bg-accent-light border border-accent rounded-lg p-4">
        <p className="text-sm text-accent">
          {t.contextDescription}
        </p>
      </div>

      <div>
        <Label htmlFor="project-description">{t.projectDescription}</Label>
        <textarea
          id="project-description"
          value={project.projectContext.description}
          onChange={e => updateProjectContext("description", e.target.value)}
          placeholder={t.projectDescriptionPlaceholder}
          rows={4}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
        />
      </div>

      <div>
        <Label htmlFor="specific-concerns">{t.specificConcerns}</Label>
        <textarea
          id="specific-concerns"
          value={project.projectContext.specificConcerns}
          onChange={e => updateProjectContext("specificConcerns", e.target.value)}
          placeholder={t.specificConcernsPlaceholder}
          rows={3}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-accent focus:border-accent"
        />
      </div>

      <div>
        <Label>{t.projectQuestions}</Label>
        <div className="space-y-2">
          {project.projectContext.questions.map((q, i) => (
            <div key={i} className="flex gap-2">
              <Input
                value={q}
                onChange={e => {
                  const newQuestions = [...project.projectContext.questions];
                  newQuestions[i] = e.target.value;
                  updateProjectContext("questions", newQuestions);
                }}
                placeholder={t.questionPlaceholder}
                aria-label={`${t.projectQuestions} ${i + 1}`}
              />
              <button
                type="button"
                onClick={() => {
                  const newQuestions = project.projectContext.questions.filter((_, idx) => idx !== i);
                  updateProjectContext("questions", newQuestions);
                }}
                className="px-3 py-2 text-red-500 hover:text-red-700 text-sm"
              >
                {t.removeQuestion}
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => updateProjectContext("questions", [...project.projectContext.questions, ""])}
            className="text-sm text-accent hover:text-accent-hover font-medium"
          >
            {t.addQuestion}
          </button>
        </div>
      </div>
    </div>
  );
}
