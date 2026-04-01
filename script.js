const API_BASE = "";

const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");
const chatMessages = document.getElementById("chatMessages");
const chatError = document.getElementById("chatError");
const logoutBtn = document.getElementById("logoutBtn");
const welcomeMessage = document.getElementById("welcomeMessage");

const token = localStorage.getItem("access_token");
const userId = localStorage.getItem("user_id");

function getSavedUsername() {
  const raw = localStorage.getItem("username");

  if (!raw) return "Student";

  const cleaned = raw.trim();
  if (
    cleaned === "" ||
    cleaned.toLowerCase() === "undefined" ||
    cleaned.toLowerCase() === "null"
  ) {
    return "Student";
  }

  return cleaned;
}

const username = getSavedUsername();
let conversationId = null;

if (!token) {
  window.location.href = "/";
}

function authHeaders() {
  return {
    "Content-Type": "application/json",
    "Authorization": `Bearer ${token}`
  };
}

function setGreeting() {
  if (!welcomeMessage) return;

  const hour = new Date().getHours();
  let greeting = "Hello";

  if (hour < 12) greeting = "Good morning";
  else if (hour < 18) greeting = "Good afternoon";
  else greeting = "Good evening";

  welcomeMessage.textContent =
    `${greeting}, ${username}. Welcome to Rowan University. How can I assist you today?`;
}

function scrollToBottom(smooth = true) {
  chatMessages.scrollTo({
    top: chatMessages.scrollHeight,
    behavior: smooth ? "smooth" : "auto"
  });
}

function addMessage(role, text, animated = true) {
  const bubble = document.createElement("div");
  bubble.className = role === "user" ? "msg msg-user" : "msg msg-bot";

  if (animated) {
    bubble.classList.add("msg-enter");
  }

  bubble.textContent = text;
  chatMessages.appendChild(bubble);

  if (animated) {
    requestAnimationFrame(() => {
      bubble.classList.add("msg-show");
    });
  }

  scrollToBottom(true);
}

function createTypingIndicator() {
  removeTypingIndicator();

  const typingBubble = document.createElement("div");
  typingBubble.className = "msg msg-bot typing-indicator msg-enter";
  typingBubble.id = "typingIndicator";

  const typingText = document.createElement("span");
  typingText.textContent = "Rowan is typing";

  const dots = document.createElement("span");
  dots.className = "typing-dots";
  dots.innerHTML = "<span>.</span><span>.</span><span>.</span>";

  typingBubble.appendChild(typingText);
  typingBubble.appendChild(dots);

  chatMessages.appendChild(typingBubble);

  requestAnimationFrame(() => {
    typingBubble.classList.add("msg-show");
  });

  scrollToBottom(true);
}

function removeTypingIndicator() {
  const existing = document.getElementById("typingIndicator");
  if (existing) {
    existing.remove();
  }
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function getOrCreateConversation() {
  try {
    const res = await fetch(`${API_BASE}/api/conversations`, {
      method: "GET",
      headers: authHeaders()
    });

    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      const text = await res.text();
      console.error("Conversations non-JSON response:", text);
      throw new Error("Server returned HTML when loading conversations.");
    }

    if (res.status === 401) {
      localStorage.clear();
      window.location.href = "/";
      return null;
    }

    const convos = await res.json();

    if (!res.ok) {
      throw new Error(convos.details || convos.error || "Failed to load conversations");
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
      })
    });

    const createContentType = createRes.headers.get("content-type") || "";
    if (!createContentType.includes("application/json")) {
      const text = await createRes.text();
      console.error("Create conversation non-JSON response:", text);
      throw new Error("Server returned HTML when creating a conversation.");
    }

    const created = await createRes.json();

    if (!createRes.ok) {
      throw new Error(created.details || created.error || "Failed to create conversation");
    }

    return created.conversation_id;
  } catch (error) {
    chatError.textContent = error.message || "Could not connect to the server.";
    return null;
  }
}

async function loadMessages() {
  if (!conversationId) return;

  try {
    const res = await fetch(`${API_BASE}/api/messages?conversation_id=${conversationId}`, {
      method: "GET",
      headers: authHeaders()
    });

    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      const text = await res.text();
      console.error("Messages non-JSON response:", text);
      throw new Error("Server returned HTML instead of JSON while loading messages.");
    }

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.details || data.error || "Failed to load messages");
    }

    chatMessages.innerHTML = "";

    for (const message of data) {
      const role = String(message.sender_user_id) === String(userId) ? "user" : "bot";
      addMessage(role, message.content ?? "[deleted]", false);
    }

    scrollToBottom(false);
  } catch (error) {
    chatError.textContent = error.message || "Could not load messages.";
  }
}

async function sendMessage(messageText) {
  const res = await fetch(`${API_BASE}/api/messages`, {
    method: "POST",
    headers: authHeaders(),
    body: JSON.stringify({
      conversation_id: conversationId,
      content: messageText
    })
  });

  const contentType = res.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    const text = await res.text();
    console.error("Send message non-JSON response:", text);
    throw new Error("Server returned HTML instead of JSON. Check Render logs.");
  }

  const data = await res.json();

  if (!res.ok) {
    console.error("Backend JSON error:", data);
    throw new Error(data.details || data.error || "Failed to send message");
  }

  return data;
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

  addMessage("user", msg, true);
  chatInput.value = "";
  chatInput.disabled = true;

  createTypingIndicator();

  try {
    const data = await sendMessage(msg);

    await sleep(700);
    removeTypingIndicator();

    if (data.bot_message && data.bot_message.content) {
      addMessage("bot", data.bot_message.content, true);
    }
  } catch (error) {
    removeTypingIndicator();
    chatError.textContent = error.message || "Could not send message.";
  } finally {
    chatInput.disabled = false;
    chatInput.focus();
  }
});

logoutBtn.addEventListener("click", () => {
  localStorage.clear();
  window.location.href = "/";
});

(async function init() {
  setGreeting();
  conversationId = await getOrCreateConversation();

  if (conversationId) {
    await loadMessages();
  }

  if (chatInput) {
    chatInput.focus();
  }
})();