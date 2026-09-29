const $ = (selector) => document.querySelector(selector);
const state = { colleges: [], communities: [], posts: [], joined: new Set(), memberCounts: {}, profile: {}, page: "home", activeCommunity: null, communityFilter: "all", query: "", openComments: new Set(), commentsByPost: {} };

async function api(path, options = {}) {
  const response = await fetch(path, { headers: { "Content-Type": "application/json" }, credentials: "same-origin", ...options });
  const data = await response.json();
  if (!response.ok) throw new Error(data.detail || "Something went wrong. Please try again.");
  return data;
}
function community(id) { return state.communities.find((item) => item.id === id); }
function initials(name) { return name.split(/\s+/).slice(0, 2).map((part) => part[0] || "").join("").toUpperCase(); }
function escapeHtml(value) { return String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]); }

function renderProfile() {
  const name = state.profile.name || "";
  const bio = state.profile.bio || "No bio yet. Tap Edit to add one.";
  $("#profileName").textContent = name;
  $("#profileBio").textContent = bio;
  $("#topProfileName").textContent = name.split(" ")[0];
  $("#topAvatar").textContent = initials(name);
  $("#profileAvatar").textContent = initials(name);
  $("#composerAvatar").textContent = initials(name);
  $("#joinedCount").textContent = state.joined.size;
  $("#profileJoined").textContent = state.joined.size;
  $("#profilePosts").textContent = state.posts.filter((post) => post.author === name).length;
}
function renderSidebar() {
  const items = state.communities.filter((item) => state.joined.has(item.id));
  $("#sideCommunities").innerHTML = items.map((item) => `<button class="side-community ${state.activeCommunity === item.id ? "active" : ""}" data-open-community="${item.id}"><span class="community-icon">${item.icon}</span>${escapeHtml(item.name)}</button>`).join("");
}
// A post belongs to exactly one community. Inside a community you see only that
// community's posts; the home feed shows posts from the communities you've joined.
function visiblePosts() {
  if (state.activeCommunity) return state.posts.filter((post) => post.community_id === state.activeCommunity);
  return state.posts.filter((post) => state.joined.has(post.community_id));
}
function renderFeedHeader() {
  const active = state.activeCommunity ? community(state.activeCommunity) : null;
  $("#feedTitle").textContent = active ? `${active.icon} ${active.name}` : "The feed";
  $("#feedSubtitle").textContent = active ? active.description : "Posts from the communities you've joined";
  $("#backToFeed").classList.toggle("hidden", !active);
  const joinButton = $("#feedJoin");
  joinButton.classList.toggle("hidden", !active);
  if (active) {
    const isJoined = state.joined.has(active.id);
    joinButton.dataset.join = active.id;
    joinButton.textContent = isJoined ? "✓ Joined" : "+ Join";
    joinButton.classList.toggle("joined", isJoined);
  }
}
function renderCommentsList(postId) {
  const comments = state.commentsByPost[postId];
  if (!comments) return `<p class="comments-loading">Loading replies…</p>`;
  if (!comments.length) return `<p class="comments-empty">No replies yet. Be the first to reply.</p>`;
  return comments.map((c) => `<div class="comment-item"><span class="avatar avatar-small">${escapeHtml(c.initials)}</span><div class="comment-body"><div class="comment-head"><strong>${escapeHtml(c.author)}</strong><span class="comment-time">${escapeHtml(c.time)}</span></div><p>${escapeHtml(c.text)}</p></div></div>`).join("");
}
function renderPosts() {
  const items = visiblePosts();
  renderFeedHeader();
  $("#postList").innerHTML = items.map((post) => {
    const item = community(post.community_id);
    const color = post.color === "peach" ? "peach" : post.color === "lavender" ? "lavender" : post.color === "sky" ? "sky" : "mint2";
    const isOpen = state.openComments.has(post.id);
    const canReply = state.joined.has(post.community_id);
    return `<article class="post-card card"><div class="post-community"><span>${item?.icon || "✳"}</span>${escapeHtml(item?.name || "Campus Life")}</div><div class="post-head"><span class="avatar avatar-${color}">${escapeHtml(post.initials)}</span><div><div class="post-author">${escapeHtml(post.author)}</div><div class="post-time">${escapeHtml(post.time)}</div></div></div><p class="post-text">${escapeHtml(post.text)}</p><div class="post-actions"><button data-like="${post.id}">♡ &nbsp;${post.likes} likes</button><button data-comment="${post.id}">◯ &nbsp;${post.comments} replies</button><button data-share="${post.id}">↗ &nbsp;Share</button></div><div class="comments-panel ${isOpen ? "" : "hidden"}"><div class="comments-list">${isOpen ? renderCommentsList(post.id) : ""}</div><form class="comment-form" data-comment-form="${post.id}"><input type="text" maxlength="300" placeholder="${canReply ? "Write a reply..." : "Join this community to reply"}" data-comment-input ${canReply ? "" : "disabled"} required><button type="submit" ${canReply ? "" : "disabled"}>Reply</button></form></div></article>`;
  }).join("");
  $("#feedEmpty").classList.toggle("hidden", items.length > 0);
  const active = state.activeCommunity ? community(state.activeCommunity) : null;
  if (active) {
    $("#feedEmptyTitle").textContent = `No posts in ${active.name} yet`;
    $("#feedEmptyText").textContent = state.joined.has(active.id) ? "Be the first to start a conversation here." : "Join this community to be the first to post here.";
  } else if (state.joined.size === 0) {
    $("#feedEmptyTitle").textContent = "Your feed is empty";
    $("#feedEmptyText").textContent = "Join a community to see its posts here.";
  } else {
    $("#feedEmptyTitle").textContent = "Nothing here just yet";
    $("#feedEmptyText").textContent = "Your communities are quiet. Start a conversation!";
  }
  $("#feedEmptyAction").classList.toggle("hidden", Boolean(active) || state.joined.size > 0);
  $("#profilePosts").textContent = state.posts.filter((post) => post.author === state.profile.name).length;
}
function renderCommunityPicker() {
  const active = state.activeCommunity ? community(state.activeCommunity) : null;
  const joinedCommunities = state.communities.filter((item) => state.joined.has(item.id));
  const options = active ? [active] : joinedCommunities;
  const canPost = active ? state.joined.has(active.id) : joinedCommunities.length > 0;
  $("#postCommunity").innerHTML = options.map((item) => `<option value="${item.id}">${item.icon} ${escapeHtml(item.name)}</option>`).join("");
  $("#postCommunity").disabled = Boolean(active);
  $("#postForm button[type=submit]").disabled = !canPost;
  $("#postText").disabled = !canPost;
  $("#postText").placeholder = active
    ? (canPost ? `Share something with ${active.name}` : `Join ${active.name} to post here`)
    : (canPost ? "What's happening on campus?" : "Join a community to start posting");
}
function renderCommunities() {
  const items = state.communities.filter((item) => {
    const matchesFilter = state.communityFilter === "all" || state.joined.has(item.id);
    const matchesQuery = `${item.name} ${item.category} ${item.description}`.toLowerCase().includes(state.query.toLowerCase());
    return matchesFilter && matchesQuery;
  });
  $("#communityGrid").innerHTML = items.map((item) => {
    const isJoined = state.joined.has(item.id);
    const count = state.memberCounts[item.id] || 0;
    const memberLabel = count === 1 ? "1 student" : `${count} students`;
    return `<article class="community-card"><div class="community-card-top"><span class="community-card-icon">${item.icon}</span><span class="community-category">${escapeHtml(item.category)}</span></div><h3>${escapeHtml(item.name)}</h3><p>${escapeHtml(item.description)}</p><div class="community-card-bottom"><span class="member-count">${memberLabel}</span><div class="card-actions"><button class="text-button" data-open-community="${item.id}">View posts →</button><button class="join-button ${isJoined ? "joined" : ""}" data-join="${item.id}">${isJoined ? "✓ Joined" : "+ Join"}</button></div></div></article>`;
  }).join("") || `<div class="empty-state"><h3>No communities found</h3><p>Try another search.</p></div>`;
}
function openCommunity(id) {
  state.activeCommunity = id;
  showPage("home"); renderAll();
  if (state.joined.has(id)) $("#postText").focus();
}
function renderAll() { renderProfile(); renderSidebar(); renderCommunityPicker(); renderPosts(); renderCommunities(); }
function showPage(page) {
  state.page = page;
  $("#homePage").classList.toggle("hidden", page !== "home");
  $("#communitiesPage").classList.toggle("hidden", page !== "communities");
  document.querySelectorAll(".nav-item").forEach((button) => button.classList.toggle("active", button.dataset.page === page));
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function toast(message) {
  const element = $("#toast"); element.textContent = message; element.classList.add("show");
  clearTimeout(toast.timer); toast.timer = setTimeout(() => element.classList.remove("show"), 2300);
}

$("#collegeSelect").addEventListener("change", async (event) => {
  const college = event.target.value;
  try {
    await api("/api/college", { method: "PUT", body: JSON.stringify({ college }) });
    $("#welcomeCampus").textContent = college.toUpperCase();
    toast(`Campus set to ${college}`);
    await loadApp();
  } catch (error) { toast(error.message); }
});
document.querySelectorAll(".nav-item").forEach((button) => button.addEventListener("click", () => {
  if (button.dataset.page === "home") state.activeCommunity = null;
  showPage(button.dataset.page); renderAll();
}));
$("#backToFeed").addEventListener("click", () => { state.activeCommunity = null; renderAll(); });
$("#addCommunity").addEventListener("click", () => showPage("communities"));
document.querySelectorAll("[data-goto]").forEach((button) => button.addEventListener("click", () => showPage(button.dataset.goto)));
document.querySelectorAll(".community-tabs .filter").forEach((button) => button.addEventListener("click", () => {
  state.communityFilter = button.dataset.communityFilter;
  document.querySelectorAll(".community-tabs .filter").forEach((item) => item.classList.toggle("active", item === button)); renderCommunities();
}));
$("#communitySearch").addEventListener("input", (event) => { state.query = event.target.value; renderCommunities(); });
document.addEventListener("click", async (event) => {
  const joinButton = event.target.closest("[data-join]");
  if (joinButton) {
    try { const id = joinButton.dataset.join; const result = await api(`/api/communities/${id}/join`, { method: "POST" });
      result.joined ? state.joined.add(id) : state.joined.delete(id);
      state.memberCounts[id] = Math.max(0, (state.memberCounts[id] || 0) + (result.joined ? 1 : -1));
      renderAll(); toast(result.joined ? "You joined the community" : "You left the community");
    } catch (error) { toast(error.message); }
  }
  const sideCommunity = event.target.closest("[data-open-community]");
  if (sideCommunity) openCommunity(sideCommunity.dataset.openCommunity);
  const like = event.target.closest("[data-like]");
  if (like) {
    const post = state.posts.find((item) => item.id === Number(like.dataset.like));
    try { const result = await api(`/api/posts/${post.id}/like`, { method: "POST" }); post.likes = result.likes; renderPosts(); }
    catch (error) { toast(error.message); }
  }
  const comment = event.target.closest("[data-comment]");
  if (comment) {
    const postId = Number(comment.dataset.comment);
    if (state.openComments.has(postId)) { state.openComments.delete(postId); renderPosts(); return; }
    state.openComments.add(postId);
    if (!state.commentsByPost[postId]) {
      renderPosts();
      try { state.commentsByPost[postId] = await api(`/api/posts/${postId}/comments`); }
      catch (error) { toast(error.message); state.openComments.delete(postId); }
      renderPosts();
    } else { renderPosts(); }
  }
  const share = event.target.closest("[data-share]");
  if (share) { const post = state.posts.find((item) => item.id === Number(share.dataset.share)); navigator.clipboard?.writeText(post.text).then(() => toast("Post copied to clipboard")).catch(() => toast("Copy isn't available in this browser")); }
});
document.addEventListener("submit", async (event) => {
  const form = event.target.closest("[data-comment-form]");
  if (!form) return;
  event.preventDefault();
  const postId = Number(form.dataset.commentForm);
  const input = form.querySelector("[data-comment-input]");
  const text = input.value.trim();
  if (!text) return;
  try {
    const newComment = await api(`/api/posts/${postId}/comments`, { method: "POST", body: JSON.stringify({ text }) });
    state.commentsByPost[postId] = [...(state.commentsByPost[postId] || []), newComment];
    const post = state.posts.find((item) => item.id === postId);
    if (post) post.comments += 1;
    input.value = "";
    renderPosts();
  } catch (error) { toast(error.message); }
});

$("#postForm").addEventListener("submit", async (event) => {
  event.preventDefault(); const message = $("#postMessage"); message.textContent = "";
  try { const post = await api("/api/posts", { method: "POST", body: JSON.stringify({ community_id: $("#postCommunity").value, text: $("#postText").value }) });
    state.posts.unshift(post); $("#postText").value = ""; renderAll(); toast("Your post is on the feed");
  } catch (error) { message.textContent = error.message; }
});
function openProfile() { $("#nameInput").value = state.profile.name; $("#bioInput").value = state.profile.bio; $("#profileDialog").showModal(); }
$("#openProfile").addEventListener("click", openProfile);
$("#editProfile").addEventListener("click", openProfile);
$("#closeProfile").addEventListener("click", () => $("#profileDialog").close());
$("#cancelProfile").addEventListener("click", () => $("#profileDialog").close());
$("#profileForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  try { state.profile = await api("/api/profile", { method: "PUT", body: JSON.stringify({ name: $("#nameInput").value, bio: $("#bioInput").value }) });
    $("#profileDialog").close(); renderAll(); toast("Profile updated");
  } catch (error) { toast(error.message); }
});
$("#logoutButton").addEventListener("click", async () => {
  await api("/api/auth/logout", { method: "POST" });
  $("#profileDialog").close();
  showAuthScreen();
});

// --- Auth screen wiring -----------------------------------------------
document.querySelectorAll("[data-auth-tab]").forEach((tab) => tab.addEventListener("click", () => {
  document.querySelectorAll("[data-auth-tab]").forEach((item) => item.classList.toggle("active", item === tab));
  $("#loginForm").classList.toggle("hidden", tab.dataset.authTab !== "login");
  $("#signupForm").classList.toggle("hidden", tab.dataset.authTab !== "signup");
}));

function showAuthScreen() {
  $("#appRoot").classList.add("hidden");
  $("#authScreen").classList.remove("hidden");
}
function showApp() {
  $("#authScreen").classList.add("hidden");
  $("#appRoot").classList.remove("hidden");
}

$("#loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = $("#loginMessage"); message.textContent = "";
  try {
    await api("/api/auth/login", { method: "POST", body: JSON.stringify({ username: $("#loginUsername").value, password: $("#loginPassword").value }) });
    await loadApp(); showApp();
  } catch (error) { message.textContent = error.message; }
});

$("#signupForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const message = $("#signupMessage"); message.textContent = "";
  try {
    await api("/api/auth/signup", { method: "POST", body: JSON.stringify({
      display_name: $("#signupName").value,
      username: $("#signupUsername").value,
      password: $("#signupPassword").value,
      college: $("#signupCollege").value,
    }) });
    await loadApp(); showApp();
  } catch (error) { message.textContent = error.message; }
});

async function loadApp() {
  const data = await api("/api/initial");
  if (!data.authenticated) { state.colleges = data.colleges; $("#signupCollege").innerHTML = state.colleges.map((c) => `<option>${escapeHtml(c)}</option>`).join(""); return false; }
  state.colleges = data.colleges; state.communities = data.communities; state.posts = data.posts; state.joined = new Set(data.joined); state.memberCounts = data.member_counts || {}; state.profile = data.profile; state.activeCommunity = null;
  $("#collegeSelect").innerHTML = state.colleges.map((college) => `<option ${college === data.college ? "selected" : ""}>${escapeHtml(college)}</option>`).join("");
  $("#welcomeCampus").textContent = (data.college || "").toUpperCase();
  renderAll();
  return true;
}

async function start() {
  try {
    const authenticated = await loadApp();
    authenticated ? showApp() : showAuthScreen();
  } catch (error) {
    showAuthScreen();
    $("#loginMessage").textContent = `Couldn't connect to the app: ${error.message}`;
  }
}
start();
