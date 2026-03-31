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
}

let conversationId = null;

async function getOrCreateConversation() {
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
}

async function loadMessages() {
  const res = await fetch(
    `${API_BASE}/api/messages?conversation_id=${conversationId}`,
    {
      method: "GET",
      headers: authHeaders(),
    }
  );

  const data = await res.json();

  if (!res.ok) {
    chatError.textContent = data.error || "Failed to load messages";
    return;
  }

  chatMessages.innerHTML = "";

  for (const m of data) {
    const role = String(m.sender_user_id) === String(userId) ? "user" : "bot";
    addMessage(role, m.content ?? "[deleted]");
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

  chatInput.value = "";

  const res = await fetch(`${API_BASE}/api/messages`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      conversation_id: conversationId,
      content: msg,
    }),
  });

  const data = await res.json();

  if (!res.ok) {
    chatError.textContent = data.error || "Failed to send message";
    return;
  }

  await loadMessages();
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