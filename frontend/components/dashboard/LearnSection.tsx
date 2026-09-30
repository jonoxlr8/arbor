"use client";

import { useState } from "react";
import { learnCategories, learnLessons, safeLessonSource, type Lesson } from "@/lib/learnLessons";
import ArborIdentityIcon from "@/components/ArborIdentityIcon";
import { ArborMark } from "@/components/Logo";
import type { IdentityGlyph } from "@/lib/investmentIdentity";

const categoryGlyph: Record<Exclude<Lesson["category"], "Arbor">, IdentityGlyph> = {
  Basics: "facets", ETFs: "globe", Funds: "layers", Crypto: "coin",
};
const categoryMark = (category: Lesson["category"]) => category === "Arbor" ?
  <ArborMark className="learn-arbor-mark" /> :
  <ArborIdentityIcon glyph={categoryGlyph[category]} />;

export default function LearnSection({ onAsk }: { onAsk: (draft: string) => void }) {
  const [category, setCategory] = useState<(typeof learnCategories)[number]>("All");
  const [selected, setSelected] = useState<string | null>(null);
  const lesson = learnLessons.find(item => item.id === selected);

  if (selected && !lesson) return <section className="learn-detail"><p>Lesson not found.</p><button className="entry-link" onClick={() => setSelected(null)}>Back to Learn</button></section>;
  if (lesson) return <article className="learn-detail">
    <button className="learn-back" onClick={() => setSelected(null)}>← Back to Learn</button>
    <p className="learn-eyebrow">{lesson.category} · {Math.max(1, Math.ceil(lesson.sections.reduce((count, section) => count + section.body.split(/\s+/).length, 0) / 180))} min read</p>
    <h2>{lesson.title}</h2><p className="learn-intro">{lesson.summary}</p>
    {lesson.sections.map(section => <section key={section.heading} className="learn-copy"><h3>{section.heading}</h3><p>{section.body}</p></section>)}
    <section className="learn-sources"><h3>Sources</h3>{lesson.sources.length ? <ul>{lesson.sources.filter(item => safeLessonSource(item.url)).map(item => <li key={item.url}><a href={item.url} target="_blank" rel="noopener noreferrer">{item.label} ↗</a></li>)}</ul> : <p>Arbor product behavior, as documented in this app.</p>}
      <p>Reviewed {lesson.reviewed}</p></section>
    <button className="entry-primary learn-ask" onClick={() => onAsk(lesson.askDraft)}>Ask Arbor about this</button>
  </article>;

  return <div className="learn-library">
    <div className="learn-filters" aria-label="Lesson categories">{learnCategories.map(item => <button key={item} type="button" aria-pressed={category === item} onClick={() => setCategory(item)}>{item}</button>)}</div>
    <div className="learn-list">{learnLessons.filter(item => category === "All" || item.category === category).map(item => <button key={item.id} className="learn-row" onClick={() => setSelected(item.id)}>
      <span className={`learn-mark learn-mark-${item.category.toLowerCase()}`} aria-hidden="true">{categoryMark(item.category)}</span>
      <span className="learn-row-copy"><strong>{item.title}</strong><small>{item.summary}</small></span><span className="learn-chevron" aria-hidden="true">›</span>
    </button>)}</div>
  </div>;
}
