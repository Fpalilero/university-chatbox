const API_BASE = "";

const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");
const chatMessages = document.getElementById("chatMessages");
const chatError = document.getElementById("chatError");
const logoutBtn = document.getElementById("logoutBtn");

const token = localStorage.getItem("access_token");
const userId = localStorage.getItem("user_id");

if (!token) {
  window.location.href = "/";
}

function authHeaders() {
  return {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`,
  };
}

function addMessage(role, text) {
  const bubble = document.createElement("div");
  bubble.className = role === "user" ? "msg msg-user" : "msg msg-bot";
  bubble.textContent = text;
  chatMessages.appendChild(bubble);
  chatMessages.scrollTop = chatMessages.scrollHeight;
  return bubble;
}

function clearMessages() {
  chatMessages.innerHTML = "";
}

let typingBubble = null;

function showTypingIndicator() {
  if (typingBubble) return;

  typingBubble = document.createElement("div");
  typingBubble.className = "msg msg-bot";
  typingBubble.textContent = "RowanBot is typing...";
  chatMessages.appendChild(typingBubble);
  chatMessages.scrollTop = chatMessages.scrollHeight;
}

function hideTypingIndicator() {
  if (typingBubble) {
    typingBubble.remove();
    typingBubble = null;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

let conversationId = null;

async function getOrCreateConversation() {
  try {
    const res = await fetch(`${API_BASE}/api/conversations`, {
      method: "GET",
      headers: authHeaders(),
    });

    if (res.status === 401) {
      localStorage.clear();
      window.location.href = "/";
      return null;
    }

    const convos = await res.json();

    if (!res.ok) {
      chatError.textContent = convos.error || "Failed to load conversations";
      return null;
    }

    if (Array.isArray(convos) && convos.length > 0) {
      return convos[0].conversation_id;
    }

    const createRes = await fetch(`${API_BASE}/api/conversations`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        type: "group",
        name: "General",
        member_ids: []
      }),
    });

    const created = await createRes.json();

    if (!createRes.ok) {
      chatError.textContent = created.error || "Failed to create conversation";
      return null;
    }

    return created.conversation_id;
  } catch (err) {
    chatError.textContent = "Server error while loading conversation.";
    return null;
  }
}

async function loadMessages() {
  if (!conversationId) return;

  try {
    const res = await fetch(
      `${API_BASE}/api/messages?conversation_id=${conversationId}`,
      {
        method: "GET",
        headers: authHeaders(),
      }
    );

    if (res.status === 401) {
      localStorage.clear();
      window.location.href = "/";
      return;
    }

    const data = await res.json();

    if (!res.ok) {
      chatError.textContent = data.error || "Failed to load messages";
      return;
    }

    clearMessages();

    for (const m of data) {
      const role = String(m.sender_user_id) === String(userId) ? "user" : "bot";
      addMessage(role, m.content ?? "[deleted]");
    }
  } catch (err) {
    chatError.textContent = "Server error while loading messages.";
  }
}

chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  chatError.textContent = "";

  const msg = chatInput.value.trim();
  if (!msg) return;

  if (!conversationId) {
    chatError.textContent = "No conversation loaded yet. Refresh the page.";
    return;
  }

  addMessage("user", msg);
  chatInput.value = "";
  chatInput.focus();

  showTypingIndicator();
  const typingStartedAt = Date.now();

  try {
    const res = await fetch(`${API_BASE}/api/messages`, {
      method: "POST",
      headers: authHeaders(),
      body: JSON.stringify({
        conversation_id: conversationId,
        content: msg,
      }),
    });

    const data = await res.json();

    const elapsed = Date.now() - typingStartedAt;
    const minTypingTime = 900;

    if (elapsed < minTypingTime) {
      await sleep(minTypingTime - elapsed);
    }

    hideTypingIndicator();

    if (!res.ok) {
      chatError.textContent = data.error || "Failed to send message";
      await loadMessages();
      return;
    }

    await loadMessages();
  } catch (err) {
    const elapsed = Date.now() - typingStartedAt;
    const minTypingTime = 900;

    if (elapsed < minTypingTime) {
      await sleep(minTypingTime - elapsed);
    }

    hideTypingIndicator();
    chatError.textContent = "Server error while sending message.";
    await loadMessages();
  }
});

logoutBtn.addEventListener("click", () => {
  localStorage.clear();
  window.location.href = "/";
});

(async function init() {
  conversationId = await getOrCreateConversation();
  if (conversationId) {
    await loadMessages();
  }
})();