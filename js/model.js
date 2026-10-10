// js/model.js — pure quiz-data logic (validation, scoring, pagination).
// No DOM access here so these functions are unit-testable in isolation.

export const PAGE_SIZE = 25;
export const DEFAULT_TOPIC = "Uncategorized";

function toKey(value) {
  return String(value).trim().toLowerCase();
}

/**
 * Validate + normalize an imported question array.
 * Never throws for bad rows: collects every problem and keeps the valid rows.
 * @returns {{questions: Array, errors: Array<{index:number,message:string}>}}
 */
export function validateAndNormalize(data) {
  if (!Array.isArray(data)) {
    return {
      questions: [],
      errors: [{ index: -1, message: 'The JSON root must be an array of question objects, e.g. [ { "question": ... } ].' }],
    };
  }
  if (data.length === 0) {
    return { questions: [], errors: [{ index: -1, message: "The question list is empty." }] };
  }

  const questions = [];
  const errors = [];
  const seenIds = new Set();

  data.forEach((raw, idx) => {
    const label = `Question #${idx + 1}`;
    try {
      if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Error(`${label} is not a valid object.`);
      if (typeof raw.question !== "string" || !raw.question.trim()) throw new Error(`${label} is missing a "question" string.`);
      if (!raw.options || typeof raw.options !== "object" || Array.isArray(raw.options)) {
        throw new Error(`${label} is missing an "options" object (e.g. { "a": "...", "b": "..." }).`);
      }
      const optionEntries = Object.keys(raw.options).map((k) => [k, String(raw.options[k])]);
      if (optionEntries.length < 2) throw new Error(`${label} needs at least 2 options.`);
      if (raw.answer === undefined || raw.answer === null || raw.answer === "") throw new Error(`${label} is missing an "answer".`);

      // Case-insensitive option-key lookup so answer "A" matches option "a".
      const byLower = new Map(optionEntries.map(([k, v]) => [toKey(k), { key: k, text: v }]));
      const answerList = Array.isArray(raw.answer) ? raw.answer : [raw.answer];
      const correctKeys = [];
      const missing = [];
      answerList.forEach((answerKey) => {
        const found = byLower.get(toKey(answerKey));
        if (found) correctKeys.push(found.key);
        else missing.push(String(answerKey));
      });
      if (missing.length) throw new Error(`${label} has answer key(s) not present in "options": ${missing.join(", ")}`);

      // Guarantee unique ids within the collection so progress keys never collide.
      let idStr = String(raw.id ?? idx + 1);
      if (seenIds.has(idStr)) idStr = `${idStr}-${idx + 1}`;
      seenIds.add(idStr);

      questions.push({
        id: idStr,
        question: raw.question,
        options: optionEntries.map(([k, v]) => ({ key: k, text: v })),
        correctKeys,
        isMulti: Array.isArray(raw.answer),
        explanation: typeof raw.explanation === "string" ? raw.explanation : "",
        topic: typeof raw.topic === "string" && raw.topic.trim() ? raw.topic.trim() : DEFAULT_TOPIC,
      });
    } catch (err) {
      errors.push({ index: idx, message: err.message });
    }
  });

  return { questions, errors };
}

export function isCorrectSelection(question, selected) {
  const correct = new Set(question.correctKeys);
  if (selected.size !== correct.size) return false;
  for (const key of selected) if (!correct.has(key)) return false;
  return true;
}

export function computeResults(questions, answers) {
  let correctCount = 0;
  const details = questions.map((question, i) => {
    const selected = answers[i] || new Set();
    const isCorrect = isCorrectSelection(question, selected);
    if (isCorrect) correctCount += 1;
    return { q: question, selected, isCorrect, answered: selected.size > 0 };
  });
  return { correctCount, total: questions.length, details };
}

export function totalPages(count, pageSize = PAGE_SIZE) {
  return Math.max(1, Math.ceil(count / pageSize));
}

export function getPaginationRange(current, total) {
  const delta = 2;
  const range = [];
  for (let i = 1; i <= total; i++) {
    if (i === 1 || i === total || (i >= current - delta && i <= current + delta)) range.push(i);
  }
  const withDots = [];
  let last = 0;
  for (const i of range) {
    if (last) {
      if (i - last === 2) withDots.push(last + 1);
      else if (i - last > 2) withDots.push("...");
    }
    withDots.push(i);
    last = i;
  }
  return withDots;
}

export function groupByTopic(questions, progress) {
  const map = new Map();
  questions.forEach((q) => {
    const topic = q.topic || DEFAULT_TOPIC;
    if (!map.has(topic)) map.set(topic, []);
    map.get(topic).push(q);
  });
  const done = progress || {};
  return Array.from(map.entries())
    .map(([topic, list]) => ({
      topic,
      total: list.length,
      done: list.filter((q) => done[q.id]).length,
    }))
    .sort((a, b) => a.topic.localeCompare(b.topic));
}

export function countDone(questions, progress) {
  const done = progress || {};
  return questions.filter((q) => done[q.id]).length;
}

// { [questionId]: topic } — stored on the collection meta so the home screen can
// show per-topic progress bars without loading the (large) question array.
export function buildTopicMap(questions) {
  const map = {};
  questions.forEach((q) => {
    map[String(q.id)] = q.topic || DEFAULT_TOPIC;
  });
  return map;
}

export function topicSummaries(topicMap, progress) {
  const totals = new Map();
  Object.values(topicMap || {}).forEach((topic) => {
    totals.set(topic, (totals.get(topic) || 0) + 1);
  });

  const doneByTopic = new Map();
  Object.keys(progress || {}).forEach((qid) => {
    const topic = (topicMap || {})[qid];
    if (!topic) return;
    doneByTopic.set(topic, (doneByTopic.get(topic) || 0) + 1);
  });

  return Array.from(totals.entries())
    .map(([topic, total]) => {
      const done = doneByTopic.get(topic) || 0;
      return { topic, total, done, pct: total ? Math.round((done / total) * 100) : 0 };
    })
    .sort((a, b) => a.topic.localeCompare(b.topic));
}
