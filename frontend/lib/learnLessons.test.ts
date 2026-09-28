import test from "node:test";
import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import LearnSection from "../components/dashboard/LearnSection";
import { learnCategories, learnLessons, lessonById, safeLessonSource } from "./learnLessons";

test("twelve reviewed beginner lessons have stable identities and safe sources", () => {
  assert.equal(learnLessons.length, 12);
  assert.equal(new Set(learnLessons.map(item => item.id)).size, 12);
  for (const lesson of learnLessons) {
    assert.equal(lessonById(lesson.id), lesson);
    assert.ok(learnCategories.includes(lesson.category));
    assert.ok(lesson.sections.length > 0 && lesson.askDraft.length > 10);
    assert.match(lesson.reviewed, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(lesson.sources.every(item => safeLessonSource(item.url)));
  }
  assert.equal(safeLessonSource("javascript:alert(1)"), false);
});

test("Learn exposes compact lessons without a Plus lock or auto-send", () => {
  const html = renderToStaticMarkup(createElement(LearnSection, { onAsk() {} }));
  assert.equal((html.match(/class="learn-row"/g) ?? []).length, 12);
  assert.match(html, /Lesson categories/);
  assert.doesNotMatch(html, /Locked|Upgrade to read/);
  const source = readFileSync("components/dashboard/LearnSection.tsx", "utf8");
  assert.match(source, /onAsk\(lesson.askDraft\)/);
  assert.doesNotMatch(source, /askArbor\(/);
});
