// proto #17 (never merged). The variant switcher: one row per question of the round, the same letters as the round comment.
import { QUESTIONS, setVariant, useVariant } from "./variant.ts";

export function Switcher() {
  const v = useVariant();
  if (!v.on || !v.bar) return null;
  const at = [v.sheet, v.phase, v.answer, v.prefix];
  return (
    <div className="proto-switch" role="group" aria-label="Prototype variants">
      {QUESTIONS.map((q, i) => (
        <div key={q.n} className="proto-row" title={q.about}>
          <span className="proto-q">
            {q.n} {q.label}
          </span>
          {Object.entries(q.options).map(([letter, name]) => (
            <button key={letter} aria-pressed={at[i] === letter} title={name} onClick={() => setVariant(q.n, letter)}>
              {letter}
            </button>
          ))}
          <span className="proto-name">{q.options[at[i] as "A"]}</span>
        </div>
      ))}
    </div>
  );
}
