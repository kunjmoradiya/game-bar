(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const state = { games: [], allGames: [], categories: [], total: 0, offset: 0, hasMore: false, searchOffset: 0, searchHasMore: false, category: "All", query: "", sort: "newest", loading: false, page: 1, pageSize: 24, favorites: new Set() };
  const icons = { Puzzle:"🧩", Card:"🃏", Board:"♟️", Arcade:"🕹️", Other:"🎮", Racing:"🏎️", Action:"⚔️", Adventure:"🗺️", Sports:"🏆", Casual:"🎯", Strategy:"🧠" };
  const esc = value => String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  function categoryIcon(category) { return icons[category] || "🎮"; }
  function makeCard(game, index) {
    const article = document.createElement("article");
    article.className = "game-card";
    article.style.animationDelay = Math.min(index * 35, 280) + "ms";
    const art = document.createElement("div");
    art.className = "game-art";
    const label = document.createElement("span");
    label.className = "game-category";
    label.textContent = game.category || "Game";
    const emoji = document.createElement("span");
    emoji.className = "game-emoji";
    emoji.textContent = game.cover_emoji || categoryIcon(game.category);
    const overlay = document.createElement("span");
    overlay.className = "play-overlay";
    overlay.innerHTML = "<span aria-hidden=\"true\">▶</span>";
    if(game.thumbnail_url){const image=document.createElement("img");image.className="game-thumbnail";image.src=game.thumbnail_url;image.alt=(game.name||"Game")+" thumbnail";image.loading="lazy";image.onerror=()=>{image.remove();art.classList.remove("has-thumbnail");};art.classList.add("has-thumbnail");art.append(image);}art.append(label, emoji, overlay);
    const body = document.createElement("div");
    body.className = "game-card-body";
    const title = document.createElement("h3");
    title.textContent = game.name || "Untitled game";
    title.title = game.name || "";
    const desc = document.createElement("p");
    desc.textContent = game.description || "Ready to play in your browser.";
    const foot = document.createElement("div");
    foot.className = "game-card-foot";
    const category = document.createElement("span");
    category.textContent = (game.category || "Other") + " · Browser game";
    const fav = document.createElement("button");
    fav.type = "button"; fav.className = "favorite-toggle"; fav.textContent = state.favorites.has(game.id) || guestFavs().includes(game.slug) ? "♥ Saved" : "♡ Save";
    fav.addEventListener("click", async event => { event.stopPropagation(); await toggleFavorite(game, fav); });
    const play = document.createElement("a");
    play.className = "play-link";
    play.href = "/play.html?slug=" + encodeURIComponent(game.slug);
    play.textContent = "PLAY NOW →";
    foot.append(category, fav, play);
    body.append(title, desc, foot);
    article.append(art, body);
    article.tabIndex = 0;
    article.setAttribute("aria-label", "Play " + (game.name || "game"));
    article.addEventListener("click", event => {
      if (!event.target.closest("a")) location.href = play.href;
    });
    article.addEventListener("keydown", event => {
      if (event.target !== article) return;
      if (event.key === "Enter" || event.key === " ") { event.preventDefault(); location.href = play.href; }
    });
    return article;
  }
  function visibleGames() {
    let list = state.games.filter(game => {
      const text = [game.name, game.description, game.category, game.slug, game.developer, game.aliases, game.tags, game.keywords, game.controls, game.instructions, game.engine_id, game.runtime_id, game.game_type, game.id].join(" ").toLowerCase();
      return (state.category === "All" || game.category === state.category) && text.includes(state.query);
    });
    if (state.sort === "popular") list.sort((a,b)=>((b.unique_players||0)*3+(b.play_count||0))-((a.unique_players||0)*3+(a.play_count||0)));
    else if (state.sort === "played") list.sort((a,b)=>(b.play_count||0)-(a.play_count||0));
    else if (state.sort === "az") list.sort((a,b) => String(a.name).localeCompare(String(b.name)));
    else if (state.sort === "za") list.sort((a,b) => String(b.name).localeCompare(String(a.name)));
    else list.sort((a,b) => new Date(b.created_at || b.updated_at || 0) - new Date(a.created_at || a.updated_at || 0));
    return list;
  }
  function renderCategories() {
    const wrap = $("categoryList");
    wrap.replaceChildren();
    const categories = ["All", ...(state.categories.length?state.categories:[...new Set((state.allGames.length?state.allGames:state.games).map(g => g.category).filter(Boolean))].sort((a,b)=>a.localeCompare(b)))];
    categories.forEach(category => {
      const button = document.createElement("button");
      button.className = "category-chip" + (state.category === category ? " selected" : "");
      button.dataset.category = category;
      const icon = document.createElement("span");
      icon.textContent = category === "All" ? "✦" : categoryIcon(category);
      button.append(icon, document.createTextNode(category === "All" ? "All games" : category));
      button.addEventListener("click", () => {
        state.category = category; state.page=1;
        renderCategories();
        renderGames();
        $("games").scrollIntoView({behavior:"smooth",block:"start"});
      });
      wrap.append(button);
    });
    $("categoryCount").textContent = String(categories.length - 1);
  }
  function renderHomeShelves(){const source=state.allGames.length?state.allGames:state.games;const sorted=[...source].sort((a,b)=>new Date(b.created_at||0)-new Date(a.created_at||0));const popular=[...source].sort((a,b)=>(b.play_count||0)-(a.play_count||0));const rec=[];const seen=new Set();for(const g of popular){if(!seen.has(g.category)){seen.add(g.category);rec.push(g);}}const fill=(id,items)=>{const el=$(id);if(!el)return;el.replaceChildren();items.slice(0,4).forEach((g,i)=>el.append(makeCard(g,i)));};fill("featuredGrid",sorted.slice(0,3));fill("popularGrid",popular.slice(0,4));fill("recentGrid",sorted.slice(0,4));fill("recommendedGrid",rec.slice(0,4));}
  function renderGames() {
    const list = visibleGames();
    const shown = list.slice(0, state.page * state.pageSize);
    const grid = $("gameGrid");
    grid.replaceChildren();
    $("resultsCount").textContent = list.length + (list.length === 1 ? " game" : " games") + (state.query ? " matching your search" : " available");
    $("emptyState").hidden = list.length > 0;
    grid.hidden = list.length === 0;
    shown.forEach((game, index) => grid.append(makeCard(game, index)));
    const more = $("loadMore"); if (more) more.hidden = state.query ? !state.searchHasMore : !state.hasMore;
  }
  async function loadGames(showLoading = false) {
    if (state.loading) return;
    state.loading = true;
    if (showLoading) {
      $("gameGrid").hidden = false;
      $("gameGrid").innerHTML = '<div class="loading-card"><span class="loader"></span><p>Refreshing the game library…</p></div>';
    }
    try {
      const response = await fetch("/api/games?limit=24&offset=0", { headers: { "Accept":"application/json" }, cache:"no-store" });
      if (!response.ok) throw new Error("The game library is temporarily unavailable.");
      const data = await response.json();
      state.games = Array.isArray(data.games) ? data.games : [];
      state.allGames = state.games.slice();
      state.categories = Array.isArray(data.categories)?data.categories:[];
      state.total = Number(data.total)||state.games.length;
      state.offset = state.games.length; state.hasMore=!!data.hasMore; state.baseHasMore=state.hasMore;
      state.page = 1;
      try { const auth=window.hatchable&&window.hatchable.auth, s=auth?await auth.getSession():null; if(s&&s.user){const p=await fetch("/api/player",{cache:"no-store"});if(p.ok){const d=await p.json();state.favorites=new Set(d.favorite_ids||[]); const guest=guestFavs(); for(const slug of guest){let g=state.games.find(x=>x.slug===slug);if(!g){try{const sr=await fetch("/api/games?q="+encodeURIComponent(slug)+"&limit=10",{cache:"no-store"});if(sr.ok){const sd=await sr.json();g=(sd.games||[]).find(x=>x.slug===slug);}}catch(e){}}if(g){await fetch("/api/player",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"favorite",game_id:g.id,enabled:true})});state.favorites.add(g.id);}} if(guest.length)localStorage.removeItem("gh_favorites");}} } catch(e) {}
      $("totalCount").textContent = String(state.total);
      $("heroCount").textContent = String(state.total);
      renderCategories();
      renderGames();
      $("year").textContent = String(new Date().getFullYear());
    } catch (error) {
      $("resultsCount").textContent = "Unable to load games";
      $("gameGrid").hidden = false;
      $("gameGrid").innerHTML = '<div class="loading-card"><p>' + esc(error.message) + '</p><button class="button button-secondary" id="retryLoad" type="button">Try again</button></div>';
      $("retryLoad").addEventListener("click", () => loadGames(true));
    } finally {
      state.loading = false;
    }
  }
  let searchTimer=null, suggestionIndex=-1, suggestionRows=[];
  const searchBox=$("searchInput"), suggestionBox=$("searchSuggestions"), clearSearch=$("clearSearch");
  function highlightMatch(value, query){
    const safe=esc(value);const q=String(query||"").trim();if(!q)return safe;
    const at=String(value||"").toLowerCase().indexOf(q.toLowerCase());if(at<0)return safe;
    return esc(String(value).slice(0,at))+"<mark>"+esc(String(value).slice(at,at+q.length))+"</mark>"+esc(String(value).slice(at+q.length));
  }
  function closeSuggestions(){suggestionBox.hidden=true;searchBox.setAttribute("aria-expanded","false");suggestionIndex=-1;}
  function paintSuggestions(rows,q,loading=false){
    suggestionRows=rows||[];suggestionIndex=-1;suggestionBox.replaceChildren();
    if(loading){suggestionBox.innerHTML='<div class="search-message">Searching games…</div>';suggestionBox.hidden=false;searchBox.setAttribute("aria-expanded","true");return;}
    if(!suggestionRows.length){suggestionBox.innerHTML='<div class="search-message">No games found. <button type="button" id="suggestionClear">Clear search</button></div>';suggestionBox.hidden=false;searchBox.setAttribute("aria-expanded","true");$("suggestionClear").onclick=clearSearchNow;return;}
    suggestionRows.forEach((game,index)=>{
      const button=document.createElement("button");button.type="button";button.className="search-suggestion";button.setAttribute("role","option");button.dataset.index=String(index);
      const art=game.thumbnail_url?'<img src="'+esc(game.thumbnail_url)+'" alt="">':'<span class="suggestion-art">'+esc(game.cover_emoji||categoryIcon(game.category))+'</span>';
      button.innerHTML=art+'<span><strong>'+highlightMatch(game.name,q)+'</strong><small>'+esc(game.category||"Game")+'</small></span>';
      button.addEventListener("click",()=>openSuggestion(game));suggestionBox.append(button);
    });
    if(suggestionRows.length>=8){const more=document.createElement("div");more.className="search-message";more.textContent="Showing the most relevant matches";suggestionBox.append(more);}
    suggestionBox.hidden=false;searchBox.setAttribute("aria-expanded","true");
  }
  function openSuggestion(game){if(game&&game.slug)location.href="/play.html?slug="+encodeURIComponent(game.slug);}
  function clearSearchNow(){searchBox.value="";state.query="";state.games=state.allGames.slice();state.hasMore=state.baseHasMore??state.hasMore;state.searchHasMore=false;state.page=1;clearSearch.hidden=true;closeSuggestions();renderGames();searchBox.focus();}
  searchBox.addEventListener("input",()=>{
    const q=searchBox.value.trim().toLowerCase().replace(/\\s+/g," ");state.query=q;state.page=1;clearSearch.hidden=!q;
    if(searchTimer)clearTimeout(searchTimer);
    if(q.length<2){state.games=state.allGames.slice();state.hasMore=state.baseHasMore??state.hasMore;state.searchHasMore=false;closeSuggestions();renderGames();return;}
    paintSuggestions([] ,q,true);
    searchTimer=setTimeout(async()=>{
      try{
        const response=await fetch("/api/games?q="+encodeURIComponent(q)+"&limit=8",{cache:"no-store",headers:{"Accept":"application/json"}});
        if(!response.ok)throw new Error("Search is temporarily unavailable.");
        const data=await response.json();const rows=Array.isArray(data.games)?data.games:[];
        state.games=rows;state.searchOffset=rows.length;state.searchHasMore=!!data.hasMore;renderGames();paintSuggestions(rows.slice(0,8),q);
      }catch(error){suggestionBox.innerHTML='<div class="search-message">'+esc(error.message)+'</div>';suggestionBox.hidden=false;searchBox.setAttribute("aria-expanded","true");}
    },180);
  });
  searchBox.addEventListener("keydown",event=>{
    if(suggestionBox.hidden)return;
    if(event.key==="ArrowDown"&&suggestionRows.length){event.preventDefault();suggestionIndex=Math.min(suggestionIndex+1,suggestionRows.length-1);}
    else if(event.key==="ArrowUp"&&suggestionRows.length){event.preventDefault();suggestionIndex=Math.max(suggestionIndex-1,0);}
    else if(event.key==="Enter"){event.preventDefault();if(suggestionRows[suggestionIndex]||suggestionRows[0])openSuggestion(suggestionRows[suggestionIndex]||suggestionRows[0]);}
    else if(event.key==="Escape"){closeSuggestions();return;}
    suggestionBox.querySelectorAll(".search-suggestion").forEach((el,i)=>{el.setAttribute("aria-selected",String(i===suggestionIndex));if(i===suggestionIndex)el.scrollIntoView({block:"nearest"});});
  });
  clearSearch.addEventListener("click",clearSearchNow);
  document.addEventListener("click",event=>{if(!event.target.closest(".search-wrap"))closeSuggestions();});
  $("sortSelect").addEventListener("change", event => { state.sort = event.target.value; state.page=1; renderGames(); });
  $("loadMore")?.addEventListener("click", async () => {
    const button=$("loadMore");button.disabled=true;button.textContent="Loading…";
    try{
      if(state.query){
        const r=await fetch("/api/games?q="+encodeURIComponent(state.query)+"&limit=24&offset="+state.searchOffset,{cache:"no-store"});
        if(!r.ok)throw new Error("Could not load more search results.");
        const d=await r.json();const next=Array.isArray(d.games)?d.games:[];
        state.games=state.games.concat(next);state.searchOffset+=next.length;state.searchHasMore=!!d.hasMore;
      }else{
        const r=await fetch("/api/games?limit=24&offset="+state.offset,{cache:"no-store"});
        if(!r.ok)throw new Error("Could not load more games.");
        const d=await r.json();const next=Array.isArray(d.games)?d.games:[];
        state.games=state.games.concat(next);state.allGames=state.games.slice();state.offset+=next.length;state.hasMore=!!d.hasMore;state.baseHasMore=state.hasMore;
      }
      renderGames();
    }catch(e){$("resultsCount").textContent=e.message;}
    finally{button.disabled=false;button.textContent="Load more games";}
  });
  $("refreshBtn").addEventListener("click", () => loadGames(true));
  $("clearFilters").addEventListener("click", () => {
    state.category = "All"; state.page=1; state.query = ""; $("searchInput").value = ""; renderCategories(); renderGames();
  });
  $("menuToggle").addEventListener("click", () => {
    const sidebar = $("playerSidebar");
    const open = sidebar.classList.toggle("open");
    $("menuToggle").setAttribute("aria-expanded", String(open));
  });
  document.querySelectorAll("[data-side-nav]").forEach(link => link.addEventListener("click", () => {
    document.querySelectorAll("[data-side-nav]").forEach(item => item.classList.remove("active"));
    link.classList.add("active");
    $("playerSidebar").classList.remove("open");
    $("menuToggle").setAttribute("aria-expanded", "false");
  }));
  function syncActiveNav(){const h=location.hash;document.querySelectorAll("[data-side-nav]").forEach(a=>a.classList.toggle("active",(h==="#games"&&a.dataset.sideNav==="games")||(h!=="#games"&&a.dataset.sideNav==="home")));}
  window.addEventListener("hashchange",syncActiveNav);window.addEventListener("popstate",syncActiveNav);syncActiveNav();
  document.addEventListener("keydown", event => {
    if (event.key === "/" && !["INPUT","TEXTAREA","SELECT"].includes(document.activeElement.tagName)) {
      event.preventDefault(); $("searchInput").focus();
    }
    if (event.key === "Escape") { $("searchInput").blur(); }
  });
  let refreshTimer;
  document.addEventListener("visibilitychange", () => { if (!document.hidden) loadGames(); });
  refreshTimer = window.setInterval(() => { if (!document.hidden) loadGames(); }, 60000);
  function guestFavs(){try{return JSON.parse(localStorage.getItem("gh_favorites")||"[]")}catch{return []}}
  async function toggleFavorite(game,button){const saved=state.favorites.has(game.id)||guestFavs().includes(game.slug);try{const auth=window.hatchable&&window.hatchable.auth,s=auth?await auth.getSession():null;if(s&&s.user){const r=await fetch("/api/player",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"favorite",game_id:game.id,enabled:!saved})});if(!r.ok)throw new Error("Could not update favorites.");if(saved)state.favorites.delete(game.id);else state.favorites.add(game.id);}else{const list=guestFavs().filter(x=>x!==game.slug);if(!saved)list.push(game.slug);localStorage.setItem("gh_favorites",JSON.stringify(list));}button.textContent=saved?"♡ Save":"♥ Saved";}catch(e){alert(e.message||"Please sign in to save favorites.");}}
  async function refreshRequestBadge(){
    try {
      const auth=window.hatchable&&window.hatchable.auth;
      if(!auth)return;
      const session=await auth.getSession();
      if(!session||!session.user)return;
      const response=await fetch("/api/user-requests",{cache:"no-store"});
      if(!response.ok)return;
      const data=await response.json();
      const badge=document.getElementById("sidebarUnread");
      if(badge&&data.unread_count){badge.textContent=String(data.unread_count);}
    } catch(e) {}
  }
  function applySavedTheme(){const t=localStorage.getItem("gh_theme")||"dark";const light=t==="light"||(t==="system"&&window.matchMedia&&window.matchMedia("(prefers-color-scheme: light)").matches);document.documentElement.dataset.theme=light?"light":"dark";}
  applySavedTheme();
  refreshRequestBadge();
  loadGames(true);
})();