(() => {
  const STORAGE_KEY = "democrats-primary-sort-state";
  const STATE_VERSION = 4;
  const candidates = Array.isArray(window.CANDIDATES) ? window.CANDIDATES : [];
  const candidateById = new Map(candidates.map((candidate) => [candidate.id, candidate]));

  const elements = {
    introView: document.querySelector("#intro-view"),
    selectionView: document.querySelector("#selection-view"),
    compareView: document.querySelector("#compare-view"),
    resultsView: document.querySelector("#results-view"),
    candidateCount: document.querySelector("#candidate-count"),
    startButton: document.querySelector("#start-button"),
    resumeButton: document.querySelector("#resume-button"),
    selectedCount: document.querySelector("#selected-count"),
    selectAllButton: document.querySelector("#select-all-button"),
    clearSelectionButton: document.querySelector("#clear-selection-button"),
    beginRankingButton: document.querySelector("#begin-ranking-button"),
    selectionGrid: document.querySelector("#selection-grid"),
    comparisonCount: document.querySelector("#comparison-count"),
    inferredCount: document.querySelector("#inferred-count"),
    activeCount: document.querySelector("#active-count"),
    remainingCount: document.querySelector("#remaining-count"),
    undoButton: document.querySelector("#undo-button"),
    restartButton: document.querySelector("#restart-button"),
    resultsRestartButton: document.querySelector("#results-restart-button"),
    shareImageButton: document.querySelector("#share-image-button"),
    candidateA: document.querySelector("#candidate-a"),
    candidateB: document.querySelector("#candidate-b"),
    mobileChoiceA: document.querySelector("#mobile-choice-a"),
    mobileChoiceB: document.querySelector("#mobile-choice-b"),
    resultsList: document.querySelector("#results-list"),
  };

  let appState = loadSavedState();
  let selectedCandidateIds = new Set(appState?.selectedIds ?? candidates.map((candidate) => candidate.id));

  function shuffle(values) {
    const copy = [...values];
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
    }
    return copy;
  }

  function createInitialState(selectedIds) {
    return {
      version: STATE_VERSION,
      selectedIds,
      queue: shuffle(selectedIds).map((id) => [id]),
      currentMerge: null,
      result: null,
      graph: {},
      comparisons: 0,
      inferred: 0,
      previousState: null,
      startedAt: new Date().toISOString(),
    };
  }

  function loadSavedState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed?.version !== STATE_VERSION || !Array.isArray(parsed.queue)) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  function saveState() {
    if (!appState) {
      localStorage.removeItem(STORAGE_KEY);
      return;
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
  }

  function knowsPreferredOver(winnerId, loserId) {
    const visited = new Set();
    const stack = [...(appState.graph[winnerId] ?? [])];

    while (stack.length) {
      const current = stack.pop();
      if (current === loserId) return true;
      if (visited.has(current)) continue;
      visited.add(current);
      stack.push(...(appState.graph[current] ?? []));
    }

    return false;
  }

  function inferWinner(firstId, secondId) {
    if (knowsPreferredOver(firstId, secondId)) return firstId;
    if (knowsPreferredOver(secondId, firstId)) return secondId;
    return null;
  }

  function recordPreference(winnerId, loserId) {
    appState.graph[winnerId] ??= [];
    if (!appState.graph[winnerId].includes(loserId)) {
      appState.graph[winnerId].push(loserId);
    }
  }

  function activeCandidateCount() {
    return appState?.selectedIds?.length ?? selectedCandidateIds.size;
  }

  function estimateRemainingQuestions() {
    if (!appState || appState.result) return 0;

    const groupSizes = appState.queue
      .filter((group) => group.length > 0)
      .map((group) => group.length);
    let currentMergeRemaining = 0;

    if (appState.currentMerge) {
      const merge = appState.currentMerge;
      const leftRemaining = merge.left.length - merge.leftIndex;
      const rightRemaining = merge.right.length - merge.rightIndex;
      const mergedSize = merge.output.length + leftRemaining + rightRemaining;

      if (leftRemaining > 0 && rightRemaining > 0) {
        currentMergeRemaining = leftRemaining + rightRemaining - 1;
        groupSizes.push(mergedSize);
      } else if (mergedSize > 0) {
        groupSizes.push(mergedSize);
      }
    }

    return currentMergeRemaining + estimateMergeCost(groupSizes);
  }

  function estimateMergeCost(sizes) {
    const queue = [...sizes];
    let total = 0;

    while (queue.length > 1) {
      const left = queue.shift();
      const right = queue.shift();
      if (left > 0 && right > 0) {
        total += left + right - 1;
      }
      queue.push(left + right);
    }

    return total;
  }

  function startNextMerge() {
    appState.queue = appState.queue.filter((group) => group.length > 0);

    if (appState.queue.length <= 1) {
      appState.result = appState.queue[0] ?? [];
      return;
    }

    const left = appState.queue.shift();
    const right = appState.queue.shift();
    appState.currentMerge = {
      left,
      right,
      leftIndex: 0,
      rightIndex: 0,
      output: [],
    };
  }

  function finishCurrentMerge() {
    const merge = appState.currentMerge;
    merge.output.push(...merge.left.slice(merge.leftIndex));
    merge.output.push(...merge.right.slice(merge.rightIndex));
    appState.queue.push(merge.output);
    appState.currentMerge = null;
  }

  function appendWinner(winnerId) {
    const merge = appState.currentMerge;
    const leftId = merge.left[merge.leftIndex];

    merge.output.push(winnerId);
    if (winnerId === leftId) {
      merge.leftIndex += 1;
    } else {
      merge.rightIndex += 1;
    }
  }

  function getCurrentMatchup() {
    if (!appState || appState.result) return null;

    while (!appState.result) {
      if (!appState.currentMerge) {
        startNextMerge();
        continue;
      }

      const merge = appState.currentMerge;
      if (merge.leftIndex >= merge.left.length || merge.rightIndex >= merge.right.length) {
        finishCurrentMerge();
        continue;
      }

      const leftId = merge.left[merge.leftIndex];
      const rightId = merge.right[merge.rightIndex];
      const inferredWinner = inferWinner(leftId, rightId);

      if (inferredWinner) {
        appendWinner(inferredWinner);
        appState.inferred += 1;
        continue;
      }

      saveState();
      return { leftId, rightId };
    }

    saveState();
    return null;
  }

  function choose(preferredId) {
    const matchup = getCurrentMatchup();
    if (!matchup) return;

    appState.previousState = JSON.stringify({
      ...appState,
      previousState: null,
    });

    const otherId = preferredId === matchup.leftId ? matchup.rightId : matchup.leftId;
    recordPreference(preferredId, otherId);
    appendWinner(preferredId);
    appState.comparisons += 1;
    saveState();
    render();
  }

  function undo() {
    if (!appState?.previousState) return;
    appState = JSON.parse(appState.previousState);
    saveState();
    render();
  }

  function openSelection() {
    appState = null;
    saveState();
    renderSelection();
    show("selection");
  }

  function startNewSort() {
    const selectedIds = [...selectedCandidateIds];
    if (selectedIds.length === 0) return;
    appState = createInitialState(selectedIds);
    saveState();
    render();
  }

  function restart() {
    selectedCandidateIds = new Set(appState?.selectedIds ?? candidates.map((candidate) => candidate.id));
    openSelection();
  }

  function show(view) {
    elements.introView.hidden = view !== "intro";
    elements.selectionView.hidden = view !== "selection";
    elements.compareView.hidden = view !== "compare";
    elements.resultsView.hidden = view !== "results";
  }

  function toggleCandidateSelection(candidateId) {
    if (selectedCandidateIds.has(candidateId)) {
      selectedCandidateIds.delete(candidateId);
    } else {
      selectedCandidateIds.add(candidateId);
    }
    renderSelection();
  }

  function setAllSelected(isSelected) {
    selectedCandidateIds = new Set(isSelected ? candidates.map((candidate) => candidate.id) : []);
    renderSelection();
  }

  function renderSelection() {
    elements.selectedCount.textContent = `${selectedCandidateIds.size.toLocaleString("he-IL")} נבחרו`;
    elements.beginRankingButton.disabled = selectedCandidateIds.size === 0;
    elements.selectionGrid.innerHTML = candidates
      .map((candidate) => {
        const isSelected = selectedCandidateIds.has(candidate.id);
        return `
          <button class="selection-card ${isSelected ? "is-selected" : ""}" type="button" data-toggle="${candidate.id}" aria-pressed="${isSelected}">
            <img src="${imageUrl(candidate.image)}" alt="${escapeHtml(candidate.name)}" loading="lazy" referrerpolicy="no-referrer">
            <span>
              <strong>${candidate.title ? `${escapeHtml(candidate.title)} ` : ""}${escapeHtml(candidate.name)}</strong>
              <small>${isSelected ? "משתתף/ת בדירוג" : "לא בדירוג"}</small>
            </span>
          </button>
        `;
      })
      .join("");

    document.querySelectorAll("[data-toggle]").forEach((target) => {
      target.addEventListener("click", () => toggleCandidateSelection(target.dataset.toggle));
    });
  }

  function candidateCard(candidate) {
    return `
      <img class="candidate-image" src="${imageUrl(candidate.image)}" alt="${escapeHtml(candidate.name)}" loading="eager" referrerpolicy="no-referrer" data-choice="${candidate.id}">
      <div class="candidate-body">
        ${candidate.title ? `<p class="candidate-title">${escapeHtml(candidate.title)}</p>` : ""}
        <h2 class="candidate-name">${escapeHtml(candidate.name)}</h2>
        <p class="candidate-bio">${escapeHtml(candidate.bio)}</p>
        <button class="button primary choose-button" type="button" data-choice="${candidate.id}">
          לבחור במועמד/ת
        </button>
      </div>
    `;
  }

  function renderComparison(matchup) {
    const leftCandidate = candidateById.get(matchup.leftId);
    const rightCandidate = candidateById.get(matchup.rightId);

    elements.candidateA.innerHTML = candidateCard(leftCandidate);
    elements.candidateB.innerHTML = candidateCard(rightCandidate);
    elements.comparisonCount.textContent = appState.comparisons.toLocaleString("he-IL");
    elements.inferredCount.textContent = appState.inferred.toLocaleString("he-IL");
    elements.activeCount.textContent = activeCandidateCount().toLocaleString("he-IL");
    elements.remainingCount.textContent = estimateRemainingQuestions().toLocaleString("he-IL");
    elements.undoButton.disabled = !appState.previousState;
    elements.mobileChoiceA.textContent = `לבחור: ${leftCandidate.name}`;
    elements.mobileChoiceB.textContent = `לבחור: ${rightCandidate.name}`;
    elements.mobileChoiceA.dataset.choice = leftCandidate.id;
    elements.mobileChoiceB.dataset.choice = rightCandidate.id;

    elements.candidateA.querySelectorAll("[data-choice]").forEach((target) => {
      target.addEventListener("click", () => choose(target.dataset.choice));
    });
    elements.candidateB.querySelectorAll("[data-choice]").forEach((target) => {
      target.addEventListener("click", () => choose(target.dataset.choice));
    });
    elements.mobileChoiceA.onclick = () => choose(leftCandidate.id);
    elements.mobileChoiceB.onclick = () => choose(rightCandidate.id);
  }

  function renderResults(ids) {
    elements.resultsList.innerHTML = ids
      .map((id) => {
        const candidate = candidateById.get(id);
        return `
          <li class="result-item">
            <img src="${imageUrl(candidate.image)}" alt="${escapeHtml(candidate.name)}" loading="lazy" referrerpolicy="no-referrer">
            <div>
              <h3>${candidate.title ? `${escapeHtml(candidate.title)} ` : ""}${escapeHtml(candidate.name)}</h3>
              <p>${escapeHtml(candidate.bio)}</p>
            </div>
          </li>
        `;
      })
      .join("");
  }

  async function shareTopEightImage() {
    if (!appState?.result?.length) return;

    const topEight = appState.result.slice(0, 8).map((id) => candidateById.get(id)).filter(Boolean);
    const canvas = document.createElement("canvas");
    canvas.width = 1080;
    canvas.height = 1350;
    const ctx = canvas.getContext("2d");

    ctx.fillStyle = "#f3f6fb";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#0048fe";
    ctx.fillRect(0, 0, canvas.width, 178);
    ctx.direction = "rtl";
    ctx.textAlign = "right";

    ctx.fillStyle = "#ffffff";
    ctx.font = "800 56px Arial, sans-serif";
    ctx.fillText("השמינייה שלי בפריימריז", 1000, 78);
    ctx.font = "400 28px Arial, sans-serif";
    ctx.fillText("כלי אישי, עצמאי ולא רשמי", 1000, 126);

    topEight.forEach((candidate, index) => {
      const y = 250 + index * 118;
      ctx.fillStyle = "#ffffff";
      roundedRect(ctx, 70, y - 68, 940, 88, 8);
      ctx.fill();

      ctx.fillStyle = "#0048fe";
      ctx.beginPath();
      ctx.arc(956, y - 24, 30, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = "#ffffff";
      ctx.font = "800 28px Arial, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(String(index + 1), 956, y - 14);

      ctx.textAlign = "right";
      ctx.fillStyle = "#010c19";
      ctx.font = "800 34px Arial, sans-serif";
      const name = `${candidate.title ? `${candidate.title} ` : ""}${candidate.name}`;
      fillFittedRtlText(ctx, name, 900, y - 13, 780);
    });

    ctx.fillStyle = "#59606c";
    ctx.font = "400 24px Arial, sans-serif";
    ctx.fillText("מבוסס על רשימת המשתתפים שבחרתי באתר הדירוג האישי", 1000, 1232);
    ctx.fillText("מקור המידע: democrats.org.il/candidates", 1000, 1272);

    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    if (!blob) return;

    const file = new File([blob], "top-8-primary-ranking.png", { type: "image/png" });
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({
          files: [file],
          title: "השמינייה שלי בפריימריז",
        });
        return;
      } catch (error) {
        if (error.name === "AbortError") return;
      }
    }

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "top-8-primary-ranking.png";
    link.click();
    URL.revokeObjectURL(url);
  }

  function roundedRect(ctx, x, y, width, height, radius) {
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.lineTo(x + width - radius, y);
    ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
    ctx.lineTo(x + width, y + height - radius);
    ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
    ctx.lineTo(x + radius, y + height);
    ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
    ctx.lineTo(x, y + radius);
    ctx.quadraticCurveTo(x, y, x + radius, y);
    ctx.closePath();
  }

  function fillFittedRtlText(ctx, text, x, y, maxWidth) {
    if (ctx.measureText(text).width <= maxWidth) {
      ctx.fillText(text, x, y);
      return;
    }

    let fitted = text;
    while (fitted.length > 1 && ctx.measureText(`…${fitted}`).width > maxWidth) {
      fitted = fitted.slice(1);
    }
    ctx.fillText(`…${fitted}`, x, y);
  }

  function render() {
    elements.candidateCount.textContent = candidates.length.toLocaleString("he-IL");
    elements.resumeButton.hidden = !appState || Boolean(appState.result);

    if (!appState) {
      show("intro");
      return;
    }

    const matchup = getCurrentMatchup();
    if (!matchup && appState.result) {
      renderResults(appState.result);
      show("results");
      return;
    }

    if (matchup) {
      renderComparison(matchup);
      show("compare");
      return;
    }

    show("intro");
  }

  function escapeHtml(value = "") {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function imageUrl(value = "") {
    return escapeHtml(encodeURI(value));
  }

  elements.startButton.addEventListener("click", openSelection);
  elements.resumeButton.addEventListener("click", render);
  elements.selectAllButton.addEventListener("click", () => setAllSelected(true));
  elements.clearSelectionButton.addEventListener("click", () => setAllSelected(false));
  elements.beginRankingButton.addEventListener("click", startNewSort);
  elements.undoButton.addEventListener("click", undo);
  elements.restartButton.addEventListener("click", restart);
  elements.resultsRestartButton.addEventListener("click", restart);
  elements.shareImageButton.addEventListener("click", shareTopEightImage);

  document.addEventListener("keydown", (event) => {
    if (elements.compareView.hidden) return;
    if (event.key === "ArrowRight") {
      elements.candidateA.querySelector("[data-choice]")?.click();
    }
    if (event.key === "ArrowLeft") {
      elements.candidateB.querySelector("[data-choice]")?.click();
    }
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "z") {
      undo();
    }
  });

  render();
})();
