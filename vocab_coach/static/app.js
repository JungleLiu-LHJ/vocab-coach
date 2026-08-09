const state = { cards: [], index: 0, reviewing: false };

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];

function showToast(message) {
  const toast = $("#toast");
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 2800);
}

async function api(path, options = {}) {
  const response = await fetch(path, options);
  const type = response.headers.get("content-type") || "";
  const body = type.includes("application/json") ? await response.json() : await response.text();
  if (!response.ok) {
    const detail = body?.detail ?? body ?? `请求失败 (${response.status})`;
    throw new Error(typeof detail === "string" ? detail : JSON.stringify(detail, null, 2));
  }
  return body;
}

function switchView(name) {
  $$(".view").forEach((view) => view.classList.toggle("active", view.id === `${name}-view`));
  $$(".nav-button").forEach((button) => button.classList.toggle("active", button.dataset.view === name));
  if (name === "study") refreshStats();
}

$$('[data-view]').forEach((button) => button.addEventListener("click", () => switchView(button.dataset.view)));

async function refreshStats() {
  try {
    const offset = new Date().getTimezoneOffset();
    const stats = await api(`/api/stats/today?timezone_offset_minutes=${offset}`);
    $("#stat-reviews").textContent = stats.review_count;
    $("#stat-due").textContent = stats.due_count;
    $("#stat-new").textContent = stats.new_count;
  } catch (_) {
    // The main actions will surface server errors; stats are non-blocking.
  }
}

async function startSession() {
  const button = $("#start-session");
  const count = Math.max(1, Math.min(100, Number($("#session-count").value) || 20));
  button.disabled = true;
  button.textContent = "准备中…";
  try {
    const result = await api(`/api/sessions/cards?count=${count}`);
    if (!result.cards.length) {
      showToast("还没有可学习的单词，先添加一个吧");
      switchView("add");
      return;
    }
    state.cards = result.cards;
    state.index = 0;
    $("#study-empty").classList.add("hidden");
    $("#study-session").classList.remove("hidden");
    renderCurrentCard();
  } catch (error) {
    showToast(error.message);
  } finally {
    button.disabled = false;
    button.textContent = "开始学习";
  }
}

function renderCurrentCard() {
  const card = state.cards[state.index];
  if (!card) return finishSession();
  state.reviewing = false;
  $("#flashcard").classList.remove("hidden");
  $("#rating-buttons").classList.toggle("hidden", card.kind === "new");
  $("#new-rating-buttons").classList.toggle("hidden", card.kind !== "new");
  $("#feedback-card").classList.add("hidden");
  $("#card-kind").textContent = card.kind === "new" ? "新词" : "复习";
  $("#card-word").textContent = card.word;
  $("#card-phonetics").textContent = [
    card.phonetic_us && `US ${card.phonetic_us}`,
    card.phonetic_uk && `UK ${card.phonetic_uk}`,
  ].filter(Boolean).join("  ·  ");
  $("#card-origin").textContent = card.origin_translation;
  $("#card-translation-block").classList.toggle("hidden", card.kind !== "new");
  $("#card-translation").textContent = card.translation || "";
  $("#card-memory").textContent = card.retrievability == null
    ? "第一次见面"
    : `当前记住概率 ${Math.round(card.retrievability * 100)}%`;
  $("#card-examples").replaceChildren(...card.examples.map((example) => {
    const item = document.createElement("li");
    const sentence = document.createElement("span");
    sentence.textContent = example.sentence;
    const translation = document.createElement("small");
    translation.textContent = example.translation || "中文释义待补充";
    item.append(sentence, translation);
    return item;
  }));
  $("#session-progress-text").textContent = `${state.index + 1} / ${state.cards.length}`;
  $("#session-progress-bar").style.width = `${(state.index / state.cards.length) * 100}%`;
}

async function submitRating(grade) {
  if (state.reviewing) return;
  state.reviewing = true;
  const card = state.cards[state.index];
  $$(".rating").forEach((button) => (button.disabled = true));
  try {
    const result = await api(`/api/cards/${card.id}/reviews`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ grade }),
    });
    if (card.kind === "review") {
      $("#flashcard").classList.add("hidden");
      $("#rating-buttons").classList.add("hidden");
      $("#new-rating-buttons").classList.add("hidden");
      $("#feedback-word").textContent = result.revealed_answer.word;
      $("#feedback-translation").textContent = result.revealed_answer.translation;
      $("#feedback-examples").replaceChildren(...result.revealed_answer.examples.map((example) => {
        const item = document.createElement("li");
        const sentence = document.createElement("span");
        sentence.textContent = example.sentence;
        const translation = document.createElement("small");
        translation.textContent = example.translation;
        item.append(sentence, translation);
        return item;
      }));
      $("#feedback-card").classList.remove("hidden");
    } else {
      nextCard();
    }
  } catch (error) {
    state.reviewing = false;
    showToast(error.message);
  } finally {
    $$(".rating").forEach((button) => (button.disabled = false));
  }
}

function nextCard() {
  state.index += 1;
  renderCurrentCard();
}

function finishSession() {
  const completed = state.cards.length;
  state.cards = [];
  state.index = 0;
  $("#study-session").classList.add("hidden");
  $("#study-empty").classList.remove("hidden");
  if (completed) showToast(`本次完成 ${completed} 张卡片`);
  refreshStats();
}

$("#start-session").addEventListener("click", startSession);
$("#end-session").addEventListener("click", finishSession);
$("#feedback-next").addEventListener("click", nextCard);
$$('[data-grade]').forEach((button) => button.addEventListener("click", () => submitRating(button.dataset.grade)));
document.addEventListener("keydown", (event) => {
  if ($("#study-session").classList.contains("hidden") || !$("#feedback-card").classList.contains("hidden")) return;
  const currentCard = state.cards[state.index];
  const grades = currentCard?.kind === "new"
    ? { "1": "easy", "2": "again" }
    : { "1": "easy", "2": "good", "3": "hard", "4": "again" };
  if (grades[event.key]) submitRating(grades[event.key]);
});

function formDraft() {
  return {
    word: $("#word").value.trim(),
    translation: $("#translation").value.trim() || null,
    origin_translation: $("#origin-translation").value.trim() || null,
    phonetic_us: $("#phonetic-us").value.trim() || null,
    phonetic_uk: $("#phonetic-uk").value.trim() || null,
    examples: $("#examples").value.split("\n").map((line) => {
      const [sentence, ...translationParts] = line.split("||");
      return {
        sentence: sentence.trim(),
        translation: translationParts.join("||").trim(),
      };
    }).filter((example) => example.sentence),
  };
}

function setFormMessage(message, type = "") {
  const element = $("#vocab-form-message");
  element.textContent = message;
  element.className = `form-message full ${type}`;
}

$("#enrich-vocab").addEventListener("click", async () => {
  const button = $("#enrich-vocab");
  const draft = formDraft();
  if (!draft.word) return setFormMessage("请先输入单词。", "error");
  button.disabled = true;
  button.textContent = "模型正在补全…";
  setFormMessage("正在生成释义和生活化例句，请稍候。", "");
  try {
    const enriched = await api("/api/vocabulary/enrich", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    $("#translation").value = enriched.translation || "";
    $("#origin-translation").value = enriched.origin_translation || "";
    $("#phonetic-us").value = enriched.phonetic_us || "";
    $("#phonetic-uk").value = enriched.phonetic_uk || "";
    $("#examples").value = enriched.examples
      .map((example) => `${example.sentence} || ${example.translation}`)
      .join("\n");
    setFormMessage("补全完成。请检查并修改内容，确认无误后保存。", "success");
  } catch (error) {
    setFormMessage(error.message, "error");
  } finally {
    button.disabled = false;
    button.textContent = "自动补全缺失内容";
  }
});

$("#vocab-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const submit = event.submitter;
  const draft = formDraft();
  if (
    !draft.translation
    || !draft.origin_translation
    || !draft.phonetic_us
    || !draft.phonetic_uk
    || !draft.examples.length
    || draft.examples.some((example) => !example.translation)
  ) {
    return setFormMessage("保存前需要中英文释义、英美音标，以及带中文翻译的例句。", "error");
  }
  submit.disabled = true;
  try {
    const saved = await api("/api/vocabulary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    });
    event.currentTarget.reset();
    setFormMessage(`已保存 “${saved.word}”，它会出现在下一次学习中。`, "success");
    refreshStats();
  } catch (error) {
    setFormMessage(error.message, "error");
  } finally {
    submit.disabled = false;
  }
});

$("#import-file").addEventListener("change", (event) => {
  $("#file-name").textContent = event.target.files[0]?.name || "最大 10 MB";
});

$("#import-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = $("#import-message");
  const submit = event.submitter;
  const file = $("#import-file").files[0];
  if (!file) return;
  const data = new FormData();
  data.append("file", file);
  submit.disabled = true;
  message.className = "form-message";
  message.textContent = "正在校验文件…";
  try {
    const result = await api("/api/vocabulary/import", { method: "POST", body: data });
    message.className = "form-message success";
    message.textContent = `成功导入 ${result.imported_count} 个单词。`;
    event.currentTarget.reset();
    $("#file-name").textContent = "最大 10 MB";
    refreshStats();
  } catch (error) {
    message.className = "form-message error";
    message.textContent = error.message;
  } finally {
    submit.disabled = false;
  }
});

refreshStats();
