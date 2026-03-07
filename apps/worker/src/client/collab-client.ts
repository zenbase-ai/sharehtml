(function () {
  const parent = window.parent;
  if (parent === window) return; // Not in iframe

  // Styles for in-document elements
  const style = document.createElement("style");
  style.textContent = `
    /* Hide iframe scrollbar when sidebar is open — scroll is driven by parent sidebar */
    html.hide-scrollbar { scrollbar-width: none; }
    html.hide-scrollbar::-webkit-scrollbar { display: none; }
    .collab-highlight {
      background: rgba(255,213,79,0.25);
      cursor: pointer;
      transition: background 120ms ease;
      border-radius: 1px;
    }
    .collab-highlight:hover {
      background: rgba(255,213,79,0.45);
    }
    .collab-highlight.active {
      background: rgba(255,213,79,0.5);
    }
    .collab-selection {
      border-radius: 1px;
    }
    .selection-toolbar {
      position: absolute;
      display: flex;
      align-items: center;
      gap: 2px;
      background: #000000;
      border-radius: 4px;
      box-shadow: 0 1px 4px rgba(0,0,0,0.10);
      font-size: 12px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      padding: 2px;
      z-index: 10000;
      user-select: none;
    }
    .toolbar-btn {
      color: #ffffff;
      background: none;
      border: none;
      border-radius: 3px;
      padding: 3px 8px;
      cursor: pointer;
      font-size: 12px;
      font-family: inherit;
      transition: background 120ms ease;
      white-space: nowrap;
    }
    .toolbar-btn:hover { background: rgba(255,255,255,0.15); }
    .toolbar-divider {
      width: 1px;
      height: 16px;
      background: rgba(255,255,255,0.2);
    }
    .emoji-picker {
      position: absolute;
      background: #ffffff;
      border: 1px solid #000000;
      border-radius: 6px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.12);
      padding: 8px;
      z-index: 10001;
      user-select: none;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .emoji-row {
      display: flex;
      gap: 2px;
    }
    .emoji-btn {
      width: 32px;
      height: 32px;
      display: flex;
      align-items: center;
      justify-content: center;
      border: none;
      background: none;
      border-radius: 4px;
      cursor: pointer;
      font-size: 18px;
      transition: background 120ms ease;
    }
    .emoji-btn:hover { background: #f5f5f5; }
    .mobile-selection-bar {
      display: none;
      position: fixed;
      bottom: 0;
      left: 0;
      right: 0;
      background: #000000;
      padding: 12px 16px;
      padding-bottom: calc(12px + env(safe-area-inset-bottom));
      z-index: 10000;
      gap: 8px;
      align-items: center;
      animation: slideUp 150ms ease;
    }
    .mobile-selection-bar.visible { display: flex; }
    .mobile-selection-bar .toolbar-btn {
      padding: 8px 14px;
      font-size: 14px;
    }
    .mobile-selection-bar .toolbar-divider {
      width: 1px;
      height: 20px;
      background: rgba(255,255,255,0.2);
    }
    .mobile-compose {
      display: flex;
      flex-direction: column;
      gap: 8px;
      width: 100%;
    }
    .mobile-compose-quote {
      font-size: 12px;
      color: rgba(255,255,255,0.5);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .mobile-compose-quote::before { content: "\\201C"; }
    .mobile-compose-quote::after { content: "\\201D"; }
    .mobile-compose-row {
      display: flex;
      gap: 8px;
      align-items: flex-end;
    }
    .mobile-compose-input {
      flex: 1;
      background: rgba(255,255,255,0.1);
      border: 1px solid rgba(255,255,255,0.2);
      border-radius: 8px;
      padding: 10px 12px;
      font-size: 16px;
      font-family: inherit;
      color: #ffffff;
      outline: none;
      resize: none;
      min-height: 40px;
      max-height: 120px;
    }
    .mobile-compose-input::placeholder { color: rgba(255,255,255,0.4); }
    .mobile-compose-input:focus { border-color: rgba(255,255,255,0.4); }
    .mobile-compose-send {
      background: #ffffff;
      color: #000000;
      border: none;
      border-radius: 8px;
      padding: 10px 16px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      flex-shrink: 0;
      opacity: 0.4;
    }
    .mobile-compose-send.active { opacity: 1; }
    .mobile-compose-cancel {
      background: none;
      border: none;
      color: rgba(255,255,255,0.5);
      font-size: 13px;
      cursor: pointer;
      padding: 0;
      align-self: flex-start;
    }
    @keyframes slideUp {
      from { transform: translateY(100%); }
      to { transform: translateY(0); }
    }
    @media (max-width: 768px) {
      .emoji-btn { width: 40px; height: 40px; font-size: 22px; }
    }
  `;
  document.head.appendChild(style);

  let toolbar: HTMLElement | null = null;
  let emojiPicker: HTMLElement | null = null;
  let currentSelection: {
    text: string;
    anchor: {
      selectors: {
        type: string;
        exact?: string;
        prefix?: string;
        suffix?: string;
        value?: string;
      }[];
    };
    range: Range;
    rect: DOMRect;
  } | null = null;
  const QUICK_EMOJI = [
    "\u{1F44D}",
    "\u{2764}\u{FE0F}",
    "\u{1F602}",
    "\u{1F389}",
    "\u{1F440}",
    "\u{1F525}",
    "\u{1F64F}",
    "\u{1F680}",
  ];

  // Check parent window width — iframe may be narrower due to sidebar
  let parentWidth = window.innerWidth;
  try { parentWidth = window.parent.innerWidth; } catch {}
  const isMobile = parentWidth <= 768;

  // Build selection data from current browser selection
  function processSelection(): typeof currentSelection {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return null;

    const range = sel.getRangeAt(0);
    const text = sel.toString().trim();
    if (!text) return null;

    const selectors: {
      type: string;
      exact?: string;
      prefix?: string;
      suffix?: string;
      value?: string;
    }[] = [];

    const exactText = getExactTextFromRange(range);
    const exactStart = getTextOffsetForRange(range);
    if (exactStart >= 0) {
      const fullText = document.body.textContent || "";
      selectors.push({
        type: "TextQuoteSelector",
        exact: exactText,
        prefix: fullText.slice(Math.max(0, exactStart - 32), exactStart),
        suffix: fullText.slice(exactStart + exactText.length, exactStart + exactText.length + 32),
      });
    }

    const startContainer =
      range.startContainer.nodeType === Node.TEXT_NODE
        ? range.startContainer.parentElement
        : (range.startContainer as Element);
    if (startContainer) {
      selectors.push({
        type: "CssSelector",
        value: getCssSelector(startContainer),
      });
    }

    return {
      text,
      anchor: { selectors },
      range: range.cloneRange(),
      rect: range.getBoundingClientRect(),
    };
  }

  // Track text selection (desktop)
  document.addEventListener("mouseup", (e) => {
    if (isMobile) return;
    if (toolbar && toolbar.contains(e.target as Node)) return;
    if (emojiPicker && emojiPicker.contains(e.target as Node)) return;

    setTimeout(() => {
      currentSelection = processSelection();
      if (!currentSelection) {
        if (!emojiPicker) removeToolbar();
        parent.postMessage({ type: "selection:clear" }, "*");
        return;
      }
      showToolbar(currentSelection.rect);
      parent.postMessage(
        { type: "selection:made", text: currentSelection.text, anchor: currentSelection.anchor },
        "*",
      );
    }, 10);
  });

  document.addEventListener("mousedown", (e) => {
    if (
      toolbar &&
      !toolbar.contains(e.target as Node) &&
      (!emojiPicker || !emojiPicker.contains(e.target as Node))
    ) {
      removeToolbar();
    }
  });

  // Mobile: fixed bottom bar on selection change
  let mobileBar: HTMLElement | null = null;
  let mobileBarMode: "actions" | "compose" | "emoji" = "actions";

  function buildMobileBar() {
    if (mobileBar) mobileBar.remove();
    const bar = document.createElement("div");
    bar.className = "mobile-selection-bar";
    document.body.appendChild(bar);
    mobileBar = bar;
    showMobileActions();
  }

  function showMobileActions() {
    if (!mobileBar) return;
    mobileBarMode = "actions";
    mobileBar.innerHTML = "";
    mobileBar.style.flexWrap = "";

    const commentBtn = document.createElement("button");
    commentBtn.className = "toolbar-btn";
    commentBtn.innerHTML =
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:4px;position:relative;top:0.5px"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>comment';
    commentBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (currentSelection) showMobileCompose();
    });

    const divider = document.createElement("div");
    divider.className = "toolbar-divider";

    const emojiBtn = document.createElement("button");
    emojiBtn.className = "toolbar-btn";
    emojiBtn.textContent = "\u{1F525} react";
    emojiBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (currentSelection) showMobileEmojiRow();
    });

    mobileBar.appendChild(commentBtn);
    mobileBar.appendChild(divider);
    mobileBar.appendChild(emojiBtn);
  }

  function showMobileCompose() {
    if (!mobileBar || !currentSelection) return;
    mobileBarMode = "compose";
    const savedSelection = currentSelection;
    mobileBar.innerHTML = "";
    mobileBar.style.flexWrap = "wrap";

    const compose = document.createElement("div");
    compose.className = "mobile-compose";

    // Quoted text
    const quote = document.createElement("div");
    quote.className = "mobile-compose-quote";
    const quoteText = savedSelection.text;
    quote.textContent = quoteText.length > 60 ? quoteText.slice(0, 60) + "..." : quoteText;
    compose.appendChild(quote);

    // Input row
    const row = document.createElement("div");
    row.className = "mobile-compose-row";

    const input = document.createElement("textarea");
    input.className = "mobile-compose-input";
    input.placeholder = "add a comment...";
    input.rows = 1;
    // Auto-resize
    input.addEventListener("input", () => {
      input.style.height = "auto";
      input.style.height = Math.min(input.scrollHeight, 120) + "px";
      sendBtn.classList.toggle("active", !!input.value.trim());
    });

    const sendBtn = document.createElement("button");
    sendBtn.className = "mobile-compose-send";
    sendBtn.textContent = "send";
    sendBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const content = input.value.trim();
      if (!content) return;
      parent.postMessage(
        {
          type: "comment:start",
          text: savedSelection.text,
          anchor: savedSelection.anchor,
          pixelY: savedSelection.rect.top + window.scrollY,
          content,
        },
        "*",
      );
      window.getSelection()?.removeAllRanges();
      mobileBar!.classList.remove("visible");
      currentSelection = null;
      showMobileActions();
    });

    row.appendChild(input);
    row.appendChild(sendBtn);
    compose.appendChild(row);

    // Cancel
    const cancelBtn = document.createElement("button");
    cancelBtn.className = "mobile-compose-cancel";
    cancelBtn.textContent = "cancel";
    cancelBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      showMobileActions();
    });
    compose.appendChild(cancelBtn);

    mobileBar.appendChild(compose);
    requestAnimationFrame(() => input.focus());
  }

  function showMobileEmojiRow() {
    if (!mobileBar || !currentSelection) return;
    mobileBarMode = "emoji";
    const savedSelection = currentSelection;
    mobileBar.innerHTML = "";
    mobileBar.style.flexWrap = "wrap";

    for (const emoji of QUICK_EMOJI) {
      const btn = document.createElement("button");
      btn.className = "toolbar-btn";
      btn.style.fontSize = "22px";
      btn.style.padding = "8px";
      btn.textContent = emoji;
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        parent.postMessage(
          { type: "reaction:add", emoji, anchor: savedSelection.anchor },
          "*",
        );
        window.getSelection()?.removeAllRanges();
        mobileBar!.classList.remove("visible");
        currentSelection = null;
        showMobileActions();
      });
      mobileBar.appendChild(btn);
    }

    const backBtn = document.createElement("button");
    backBtn.className = "toolbar-btn";
    backBtn.textContent = "\u{2190}";
    backBtn.style.marginLeft = "auto";
    backBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      showMobileActions();
    });
    mobileBar.appendChild(backBtn);
  }

  if (isMobile) {
    buildMobileBar();

    let selectionTimer: ReturnType<typeof setTimeout> | null = null;
    document.addEventListener("selectionchange", () => {
      // Don't dismiss bar while composing
      if (mobileBarMode === "compose") return;
      if (selectionTimer) clearTimeout(selectionTimer);
      selectionTimer = setTimeout(() => {
        currentSelection = processSelection();
        if (currentSelection) {
          if (mobileBarMode !== "actions") showMobileActions();
          mobileBar!.classList.add("visible");
          parent.postMessage(
            { type: "selection:made", text: currentSelection.text, anchor: currentSelection.anchor },
            "*",
          );
        } else {
          mobileBar!.classList.remove("visible");
          parent.postMessage({ type: "selection:clear" }, "*");
        }
      }, 200);
    });
  }

  function showToolbar(rect: DOMRect) {
    removeToolbar();
    toolbar = document.createElement("div");
    toolbar.className = "selection-toolbar";

    const toolbarHeight = 34;
    const spaceAbove = rect.top;
    if (spaceAbove >= toolbarHeight + 4) {
      toolbar.style.top = rect.top + window.scrollY - toolbarHeight + "px";
      toolbar.dataset.position = "above";
    } else {
      toolbar.style.top = rect.bottom + window.scrollY + 4 + "px";
      toolbar.dataset.position = "below";
    }
    toolbar.style.left = rect.left + rect.width / 2 - 60 + "px";

    // Comment button
    const commentBtn = document.createElement("button");
    commentBtn.className = "toolbar-btn";
    commentBtn.innerHTML =
      '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;margin-right:4px;position:relative;top:0.5px"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>comment';
    commentBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (currentSelection) {
        parent.postMessage(
          {
            type: "comment:start",
            text: currentSelection.text,
            anchor: currentSelection.anchor,
            pixelY: currentSelection.rect.top + window.scrollY,
          },
          "*",
        );
        removeToolbar();
        window.getSelection()?.removeAllRanges();
      }
    });

    // Divider
    const divider = document.createElement("div");
    divider.className = "toolbar-divider";

    // Emoji button
    const emojiBtn = document.createElement("button");
    emojiBtn.className = "toolbar-btn";
    emojiBtn.innerHTML = "\u{1F525} react";
    emojiBtn.addEventListener("mousedown", (e) => {
      // Prevent default to stop the browser from collapsing the text selection
      e.preventDefault();
      e.stopPropagation();
    });
    emojiBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      if (emojiPicker) {
        removeEmojiPicker();
      } else {
        showEmojiPicker(rect);
      }
    });

    toolbar.appendChild(commentBtn);
    toolbar.appendChild(divider);
    toolbar.appendChild(emojiBtn);
    document.body.appendChild(toolbar);
  }

  function removeToolbar() {
    removeEmojiPicker();
    if (toolbar) {
      toolbar.remove();
      toolbar = null;
    }
  }

  function showEmojiPicker(selectionRect: DOMRect) {
    removeEmojiPicker();
    emojiPicker = document.createElement("div");
    emojiPicker.className = "emoji-picker";

    const pickerHeight = 52; // row height + padding
    const toolbarHeight = 34;
    const isToolbarAbove = toolbar?.dataset.position !== "below";

    if (isToolbarAbove) {
      const spaceAbove = selectionRect.top;
      if (spaceAbove >= toolbarHeight + pickerHeight + 8) {
        // Emoji picker above toolbar
        emojiPicker.style.top =
          selectionRect.top + window.scrollY - toolbarHeight - pickerHeight - 4 + "px";
      } else {
        // Not enough room — put below selection
        emojiPicker.style.top = selectionRect.bottom + window.scrollY + 4 + "px";
      }
    } else {
      // Toolbar is below selection, put picker below toolbar
      emojiPicker.style.top = selectionRect.bottom + window.scrollY + toolbarHeight + 8 + "px";
    }
    emojiPicker.style.left = selectionRect.left + selectionRect.width / 2 - 80 + "px";

    // Quick-pick row
    const row = document.createElement("div");
    row.className = "emoji-row";
    for (const emoji of QUICK_EMOJI) {
      const btn = document.createElement("button");
      btn.className = "emoji-btn";
      btn.textContent = emoji;
      btn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
      });
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        submitReaction(emoji);
      });
      row.appendChild(btn);
    }
    emojiPicker.appendChild(row);

    document.body.appendChild(emojiPicker);
  }

  function removeEmojiPicker() {
    if (emojiPicker) {
      emojiPicker.remove();
      emojiPicker = null;
    }
  }

  function submitReaction(emoji: string) {
    if (currentSelection) {
      parent.postMessage(
        {
          type: "reaction:add",
          emoji,
          text: currentSelection.text,
          anchor: currentSelection.anchor,
        },
        "*",
      );
      removeToolbar();
      window.getSelection()?.removeAllRanges();
    }
  }

  function reportHighlightPositions() {
    const positions: Record<string, number> = {};
    const pixelPositions: Record<string, number> = {};
    let order = 0;
    document.querySelectorAll(".collab-highlight").forEach((el) => {
      const id = (el as HTMLElement).dataset.commentId;
      if (id && !(id in positions)) {
        positions[id] = order++;
        pixelPositions[id] = el.getBoundingClientRect().top + window.scrollY;
      }
    });
    parent.postMessage({
      type: "highlights:positions",
      positions,
      pixelPositions,
      scrollHeight: document.documentElement.scrollHeight,
    }, "*");
  }

  // Sync scroll with parent sidebar
  window.addEventListener("scroll", () => {
    parent.postMessage({
      type: "iframe:scroll",
      scrollTop: window.scrollY,
      scrollHeight: document.documentElement.scrollHeight,
    }, "*");
  }, { passive: true });

  // Receive messages from parent
  window.addEventListener("message", (e) => {
    if (e.source !== parent) return;
    const msg = e.data;

    switch (msg.type) {
      case "highlights:render":
        renderHighlights(msg.comments);
        break;
      case "highlights:check":
        checkOrphanedComments(msg.comments);
        break;
      case "highlight:activate":
        activateHighlight(msg.commentId);
        break;
      case "highlight:deactivate":
        deactivateHighlights();
        break;
      case "selection:remote":
        renderRemoteSelection(msg.email, msg.color, msg.anchor);
        break;
      case "selection:remote:clear":
        clearRemoteSelection(msg.email);
        break;
      case "scroll:delta":
        window.scrollBy(0, msg.deltaY);
        break;
      case "scroll:to":
        window.scrollTo(0, msg.scrollTop);
        break;
      case "sidebar:state":
        document.documentElement.classList.toggle("hide-scrollbar", msg.open);
        break;
      case "highlights:request":
        reportHighlightPositions();
        break;
      case "scroll:request":
        parent.postMessage({
          type: "iframe:scroll",
          scrollTop: window.scrollY,
          scrollHeight: document.documentElement.scrollHeight,
        }, "*");
        break;
    }
  });

  interface HighlightComment {
    id: string;
    anchor?: {
      selectors?: { type: string; exact?: string; prefix?: string; suffix?: string }[];
    } | null;
    resolved?: boolean;
    parent_id?: string | null;
  }

  function checkOrphanedComments(comments: HighlightComment[]) {
    const orphaned: string[] = [];
    for (const comment of comments) {
      if (!comment.anchor || comment.resolved || comment.parent_id) continue;
      const textQuote = comment.anchor.selectors?.find((s) => s.type === "TextQuoteSelector");
      if (!textQuote) continue;
      const range = findTextRange(textQuote.exact!, textQuote.prefix, textQuote.suffix);
      if (!range) orphaned.push(comment.id);
    }
    parent.postMessage({ type: "highlights:orphaned", ids: orphaned }, "*");
  }

  // Highlight rendering
  function renderHighlights(comments: HighlightComment[]) {
    // Clear existing highlights by unwrapping mark elements
    document.querySelectorAll(".collab-highlight").forEach((el) => {
      const p = el.parentNode!;
      while (el.firstChild) p.insertBefore(el.firstChild, el);
      p.removeChild(el);
    });
    // Merge adjacent text nodes after unwrapping
    document.body.normalize();

    for (const comment of comments) {
      if (!comment.anchor || comment.resolved) continue;
      applyHighlight(comment);
    }

    // Report positions after layout is ready
    requestAnimationFrame(() => {
      reportHighlightPositions();
    });
  }

  function wrapRangeWithMarks(
    range: Range,
    createMark: () => HTMLElement,
  ): HTMLElement[] {
    const textNodes: Text[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node: Text | null;
    let inRange = false;
    while ((node = walker.nextNode() as Text | null)) {
      if (node === range.startContainer) inRange = true;
      if (inRange) textNodes.push(node);
      if (node === range.endContainer) break;
    }

    const marks: HTMLElement[] = [];
    for (const tn of textNodes) {
      const start = tn === range.startContainer ? range.startOffset : 0;
      const end = tn === range.endContainer ? range.endOffset : tn.textContent!.length;
      if (start >= end) continue;

      const wrapNode = start > 0 ? tn.splitText(start) : tn;
      if (end - start < wrapNode.textContent!.length) {
        wrapNode.splitText(end - start);
      }

      const mark = createMark();
      wrapNode.parentNode!.insertBefore(mark, wrapNode);
      mark.appendChild(wrapNode);
      marks.push(mark);
    }
    return marks;
  }

  function applyHighlight(comment: HighlightComment) {
    const anchor = comment.anchor;
    if (!anchor || !anchor.selectors) return;

    const textQuote = anchor.selectors.find((s) => s.type === "TextQuoteSelector");
    if (!textQuote) return;

    const range = findTextRange(textQuote.exact!, textQuote.prefix, textQuote.suffix);
    if (!range) return;

    wrapRangeWithMarks(range, () => {
      const mark = document.createElement("mark");
      mark.className = "collab-highlight";
      mark.dataset.commentId = comment.id;
      mark.addEventListener("click", () => {
        parent.postMessage({ type: "highlight:click", commentId: comment.id }, "*");
      });
      return mark;
    });
  }

  function getTextOffsetForRange(range: Range): number {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let offset = 0;
    let node: Text | null;
    while ((node = walker.nextNode() as Text | null)) {
      if (node === range.startContainer) {
        return offset + range.startOffset;
      }
      offset += node.textContent!.length;
    }
    return -1;
  }

  function getExactTextFromRange(range: Range): string {
    // cloneContents handles Element containers (e.g. when selection ends at
    // a <p> boundary) and its textContent concatenates without separators,
    // matching how findTextRange accumulates text on the receiving side.
    return range.cloneContents().textContent || "";
  }

  function findTextRange(exact: string, prefix?: string, suffix?: string): Range | null {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node: Text | null;
    let accumulated = "";
    const nodes: { node: Text; start: number }[] = [];

    while ((node = walker.nextNode() as Text | null)) {
      nodes.push({ node, start: accumulated.length });
      accumulated += node.textContent;
    }

    // Find the exact text, preferring match with matching prefix+suffix
    let bestIdx = -1;
    let bestScore = -1;
    let searchFrom = 0;

    while (true) {
      const idx = accumulated.indexOf(exact, searchFrom);
      if (idx === -1) break;

      let score = 0;
      if (prefix && accumulated.slice(0, idx).endsWith(prefix)) score++;
      if (suffix && accumulated.slice(idx + exact.length).startsWith(suffix)) score++;

      if (score > bestScore) {
        bestScore = score;
        bestIdx = idx;
        if (score === 2) break; // Perfect match
      }

      searchFrom = idx + 1;
    }

    if (bestIdx === -1) return null;

    // Find start and end nodes
    let startNode: Text | undefined,
      startOffset = 0,
      endNode: Text | undefined,
      endOffset = 0;
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      const nEnd = n.start + n.node.textContent!.length;
      if (!startNode && bestIdx < nEnd) {
        startNode = n.node;
        startOffset = bestIdx - n.start;
      }
      if (bestIdx + exact.length <= nEnd) {
        endNode = n.node;
        endOffset = bestIdx + exact.length - n.start;
        break;
      }
    }

    if (!startNode || !endNode) return null;

    const range = document.createRange();
    range.setStart(startNode, startOffset);
    range.setEnd(endNode, endOffset);
    return range;
  }

  function activateHighlight(commentId: string) {
    deactivateHighlights();
    const els = document.querySelectorAll(`[data-comment-id="${commentId}"]`);
    els.forEach((el) => el.classList.add("active"));
    if (els.length > 0) {
      els[0].scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  function deactivateHighlights() {
    document.querySelectorAll(".collab-highlight.active").forEach((el) => {
      el.classList.remove("active");
    });
  }

  // Remote selections
  const remoteSelections = new Map<string, HTMLElement[]>();

  function renderRemoteSelection(
    email: string,
    color: string,
    anchor: { selectors?: { type: string; exact?: string; prefix?: string; suffix?: string }[] },
  ) {
    clearRemoteSelection(email);
    if (!anchor || !anchor.selectors) return;

    const textQuote = anchor.selectors.find((s) => s.type === "TextQuoteSelector");
    if (!textQuote) return;

    const range = findTextRange(textQuote.exact!, textQuote.prefix, textQuote.suffix);
    if (!range) return;

    const marks = wrapRangeWithMarks(range, () => {
      const mark = document.createElement("mark");
      mark.className = "collab-selection";
      mark.dataset.selectionEmail = email;
      mark.style.background = color + "20";
      return mark;
    });

    if (marks.length > 0) {
      remoteSelections.set(email, marks);
    }
  }

  function clearRemoteSelection(email: string) {
    const marks = remoteSelections.get(email);
    if (!marks) return;
    for (const mark of marks) {
      if (mark.parentNode) {
        const p = mark.parentNode;
        while (mark.firstChild) p.insertBefore(mark.firstChild, mark);
        p.removeChild(mark);
      }
    }
    remoteSelections.delete(email);
    document.body.normalize();
  }

  function getCssSelector(el: Element): string {
    if (el.id) return "#" + el.id;
    const parts: string[] = [];
    let current: Element | null = el;
    while (current && current !== document.body) {
      let selector = current.tagName.toLowerCase();
      if (current.parentElement) {
        const siblings = Array.from(current.parentElement.children).filter(
          (c) => c.tagName === current!.tagName,
        );
        if (siblings.length > 1) {
          selector +=
            ":nth-child(" + (Array.from(current.parentElement.children).indexOf(current) + 1) + ")";
        }
      }
      parts.unshift(selector);
      current = current.parentElement;
    }
    return "body > " + parts.join(" > ");
  }

  // Signal parent that collab-client is ready to receive messages
  parent.postMessage({ type: "collab:ready" }, "*");
})();
