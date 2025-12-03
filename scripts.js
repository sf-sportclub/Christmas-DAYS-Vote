// 1) ใส่ลิงก์ Web App /exec ของคุณตรงนี้
const WEBAPP_URL = "https://script.google.com/macros/s/AKfycbyzydjp198viwySMBhZEgl5RqjLBWW2BfixhPrl1ZWto5A_Ff6DN62nddySDXWCEYH3/exec";

let myChart = null;
let currentScores = {};
let selectedMascot = "";
let allMascots = [];
let currentGalleryIndex = 0;

function makeBadgeId(name){ return 'score-' + encodeURIComponent(String(name||'')); }
function setStatus(text, ok){
  const el = document.getElementById('voteStatus');
  el.textContent = text || "";
  el.className = "statusline " + (ok ? "status-ok" : "status-bad");
}
function showFatal(msg){
  document.getElementById('mascot-grid').innerHTML =
    `<div class="col-12 text-center text-white"><b>เกิดข้อผิดพลาด</b><br><small>${escapeHtml(msg)}</small></div>`;
  alert(msg);
}
function escapeHtml(s){
  return String(s ?? "").replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
}

function getMediaType(url){
  const u = String(url || '').trim();
  if (!u) return "none";
  const lower = u.toLowerCase().split('?')[0];
  if (/\.(jpg|jpeg|png|gif|webp)$/.test(lower)) return "image";
  if (/\.(mp4|webm|ogg)$/.test(lower)) return "video";
  const full = u.toLowerCase();
  if (full.includes('.mp4')) return "video";
  if (full.includes('.jpg') || full.includes('.jpeg') || full.includes('.png') || full.includes('.webp') || full.includes('.gif')) return "image";
  return "unknown";
}

// ---------------- API (POST first, JSONP fallback) ----------------
// POST ใช้ text/plain เพื่อ “หลบ preflight OPTIONS” :contentReference[oaicite:2]{index=2}
async function apiFetch(action, payload = {}) {
  const res = await fetch(WEBAPP_URL, {
    method: "POST",
    redirect: "follow",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify({ action, ...payload })
  });
  const txt = await res.text();
  try { return JSON.parse(txt); } catch { throw new Error("Bad JSON: " + txt.slice(0, 200)); }
}

function apiJsonp(action, payload = {}) {
  return new Promise((resolve, reject) => {
    const cbName = "__cb_" + Math.random().toString(36).slice(2);
    const script = document.createElement("script");
    const timer = setTimeout(() => {
      cleanup();
      reject(new Error("JSONP timeout"));
    }, 12000);

    function cleanup(){
      clearTimeout(timer);
      script.remove();
      try { delete window[cbName]; } catch {}
    }

    window[cbName] = (data) => { cleanup(); resolve(data); };

    const url = new URL(WEBAPP_URL);
    url.searchParams.set("action", action);
    url.searchParams.set("callback", cbName);
    url.searchParams.set("payload", JSON.stringify(payload));

    script.src = url.toString();
    script.onerror = () => { cleanup(); reject(new Error("JSONP error")); };
    document.body.appendChild(script);
  });
}

async function api(action, payload = {}) {
  try {
    return await apiFetch(action, payload);
  } catch (e) {
    // fallback แก้ CORS/OPTIONS บางเครื่อง/บางเครือข่าย :contentReference[oaicite:3]{index=3}
    return await apiJsonp(action, payload);
  }
}

// ---------------- Snow + Gallery ----------------
function createSnowflakes() {
  const snowContainer = document.getElementById('snow-container');
  const particleCount = 30;
  for (let i = 0; i < particleCount; i++) {
    const flake = document.createElement('div');
    flake.classList.add('snowflake');
    flake.innerHTML = '❄';
    flake.style.left = Math.random() * 100 + 'vw';
    flake.style.animationDuration = (Math.random() * 3 + 5) + 's';
    flake.style.fontSize = (Math.random() * 10 + 10) + 'px';
    flake.style.opacity = Math.random();
    flake.style.animationDelay = Math.random() * 5 + 's';
    snowContainer.appendChild(flake);
  }
}

function openGallery(index) {
  if (!allMascots || allMascots.length === 0) return;
  currentGalleryIndex = index;
  updateGalleryContent(index);
  document.getElementById('galleryBackdrop').style.display = 'flex';
}
function closeGallery() {
  const video = document.querySelector('#galleryMediaWrapper video');
  if (video) video.pause();
  document.getElementById('galleryBackdrop').style.display = 'none';
}
function updateGalleryContent(index) {
  const mascot = allMascots[index];
  if (!mascot) return;
  const mediaWrapper = document.getElementById('galleryMediaWrapper');
  const titleEl = document.getElementById('galleryTitle');
  const type = getMediaType(mascot.mediaUrl);
  const existingVideo = mediaWrapper.querySelector('video');
  if (existingVideo) existingVideo.pause();

  let mediaHtml = '';
  if (type === 'video') {
    mediaHtml = `<video class="gallery-media" controls autoplay playsinline>
      <source src="${escapeHtml(mascot.mediaUrl)}" type="video/mp4">
      Your browser does not support the video tag.
    </video>`;
  } else {
    const src = mascot.mediaUrl ? mascot.mediaUrl : mascot.placeholderImg;
    mediaHtml = `<img class="gallery-media" src="${escapeHtml(src)}" alt="${escapeHtml(mascot.name)}">`;
  }
  mediaWrapper.innerHTML = mediaHtml;
  titleEl.textContent = `${mascot.name} (ลำดับที่ ${mascot.id})`;
}
function showNextMedia() {
  currentGalleryIndex = (currentGalleryIndex + 1) % allMascots.length;
  updateGalleryContent(currentGalleryIndex);
}
function showPrevMedia() {
  currentGalleryIndex = (currentGalleryIndex - 1 + allMascots.length) % allMascots.length;
  updateGalleryContent(currentGalleryIndex);
}

// ---------------- Vote modal ----------------
function openVoteModal(mascotName){
  selectedMascot = mascotName;
  document.getElementById('voteModalTitle').textContent = `✨ โหวตให้: ${mascotName}`;
  document.getElementById('empIdInput').value = "";
  document.getElementById('birthInput').value = "";
  setStatus("", true);
  document.getElementById('couponDisplay').style.display = 'none';
  document.getElementById('voteStatus').style.display = '';

  const voteBtn = document.getElementById('voteConfirmBtn');
  const randomBtn = document.getElementById('getRandomBtn');
  const cancelBtn = document.getElementById('voteCancelBtn');

  voteBtn.style.display = 'inline-block'; voteBtn.disabled = false;
  randomBtn.style.display = 'inline-block'; randomBtn.disabled = false;
  cancelBtn.style.display = 'inline-block'; cancelBtn.textContent = 'ยกเลิก';

  const back = document.getElementById('voteModalBackdrop');
  back.style.display = "flex"; back.setAttribute("aria-hidden", "false");
  setTimeout(()=>document.getElementById('empIdInput').focus(), 50);
}
function closeVoteModal(){
  const back = document.getElementById('voteModalBackdrop');
  back.style.display = "none"; back.setAttribute("aria-hidden", "true");
  selectedMascot = "";
}

// ---------------- Render / Chart ----------------
function renderMascots(mascots){
  const container = document.getElementById('mascot-grid');
  container.innerHTML = '';
  if (!mascots || mascots.length === 0){
    container.innerHTML = '<div class="col-12 text-center text-white">ไม่พบข้อมูล Mascot ใน Sheet2</div>';
    return;
  }

  mascots.forEach((m, c) => {
    const badgeId = makeBadgeId(m.name);
    const score = currentScores[m.name] || 0;
    const mediaUrl = String(m.mediaUrl || '').trim();

    let mediaHtml = '';
    if (mediaUrl) {
      const type = getMediaType(mediaUrl);
      if (type === 'video') {
        mediaHtml = `<video class="mascot-media" playsinline muted>
          <source src="${escapeHtml(mediaUrl)}" type="video/mp4">
        </video>`;
      } else {
        mediaHtml = `<img class="mascot-media" src="${escapeHtml(mediaUrl)}" alt="${escapeHtml(m.name)}">`;
      }
    } else {
      mediaHtml = `<img class="mascot-media" src="${escapeHtml(m.placeholderImg)}" alt="${escapeHtml(m.name)}">`;
    }

    container.insertAdjacentHTML('beforeend', `
      <div class="col-6 col-md-4 col-lg-3">
        <div class="card mascot-card h-100">
          <div class="mascot-img-wrapper" data-index="${c}">
            <div class="vote-badge" id="${badgeId}">❤️ ${score}</div>
            ${mediaHtml}
          </div>
          <div class="card-body">
            <div class="card-title">${escapeHtml(m.name)}</div>
            <small class="text-muted d-block mb-2">หมายเลข ${escapeHtml(m.id)}</small>
            <button class="btn-vote" type="button" data-action="vote" data-name="${escapeHtml(m.name)}">โหวตเลย</button>
          </div>
        </div>
      </div>
    `);
  });
}

function renderChart(data){
  currentScores = data || {};
  Object.keys(currentScores).forEach(name => {
    const el = document.getElementById(makeBadgeId(name));
    if (el) el.textContent = `❤️ ${currentScores[name]}`;
  });

  const ctx = document.getElementById('voteChart').getContext('2d');
  const labels = Object.keys(currentScores);
  const values = Object.values(currentScores);
  const bgColors = labels.map((_, i) => i % 3 === 0 ? '#D42426' : (i % 3 === 1 ? '#165B33' : '#F8B229'));

  if (myChart){
    myChart.data.labels = labels;
    myChart.data.datasets[0].data = values;
    myChart.data.datasets[0].backgroundColor = bgColors;
    myChart.update();
    return;
  }

  myChart = new Chart(ctx, {
    type: 'bar',
    data: { labels, datasets: [{ label: 'คะแนนโหวต', data: values, backgroundColor: bgColors, borderColor:'#FFF', borderWidth:2, borderRadius:5 }] },
    options: {
      responsive:true,
      plugins:{ legend:{ display:false } },
      scales:{
        y:{ beginAtZero:true, ticks:{ stepSize:1, color: '#0f4023', font: {weight:'bold'} } },
        x:{ grid:{ display:false }, ticks: { color: '#0f4023', font: {family:'Sarabun', weight:'bold'} } }
      }
    }
  });
}

async function updateChartData(){
  const data = await api('getVoteResults');
  renderChart(data);
}

async function refreshVoteStatusUi(){
  const st = await api('getVoteStatus');
  const badge = document.getElementById('voteOpenBadge');
  if (!badge) return;
  if (st && st.open === false) badge.textContent = "⛔ ปิดโหวตตอนนี้ (ยังรับเลขสุ่มได้)";
  else badge.textContent = "✅ เปิดโหวตอยู่ตอนนี้";
}

// ---------------- Events ----------------
document.addEventListener('click', function(e){
  const imgWrapper = e.target.closest('.mascot-img-wrapper');
  if (imgWrapper) {
    const index = parseInt(imgWrapper.getAttribute('data-index'), 10);
    if (!isNaN(index)) openGallery(index);
    return;
  }
  const voteBtn = e.target.closest('[data-action="vote"]');
  if (voteBtn){
    openVoteModal(voteBtn.getAttribute('data-name'));
    return;
  }
  if (e.target.id === 'voteModalBackdrop' || e.target.id === 'voteModalClose' || e.target.id === 'voteCancelBtn'){
    closeVoteModal();
  }
});

document.addEventListener('DOMContentLoaded', async () => {
  if (!WEBAPP_URL || WEBAPP_URL.includes("PASTE_")) {
    showFatal("ยังไม่ได้ใส่ WEBAPP_URL ใน scripts.js");
    return;
  }

  createSnowflakes();

  try {
    await refreshVoteStatusUi();

    allMascots = await api('getMascotData');
    renderMascots(allMascots);
    await updateChartData();
    setInterval(updateChartData, 10000);
    setInterval(refreshVoteStatusUi, 15000);
  } catch (err) {
    showFatal(err && err.message ? err.message : String(err));
  }

  document.getElementById('voteConfirmBtn').addEventListener('click', async function(){
    const empId = document.getElementById('empIdInput').value.trim();
    const birth = document.getElementById('birthInput').value.trim();
    if (!selectedMascot || !empId || !birth) { setStatus("กรุณากรอกข้อมูลให้ครบ", false); return; }

    const btn = this;
    btn.disabled = true;
    setStatus("กำลังตรวจสอบ...", true);

    try {
      const resp = await api('submitVote', { empId, birthDate: birth, voteValue: selectedMascot });
      btn.disabled = false;

      if (resp && resp.status === "success") {
        setStatus(resp.message, true);
        btn.style.display = 'none';
        await updateChartData();
      } else {
        setStatus((resp && resp.message) ? resp.message : "รหัสผิด", false);
        if (resp && resp.message && resp.message.includes('โหวตไปแล้ว')) btn.style.display = 'none';
      }
    } catch (err) {
      btn.disabled = false;
      setStatus("เกิดข้อผิดพลาด", false);
      console.error(err);
    }
  });

  document.getElementById('getRandomBtn').addEventListener('click', async function(){
    const empId = document.getElementById('empIdInput').value.trim();
    const birth = document.getElementById('birthInput').value.trim();
    if (!empId || !birth) { setStatus("กรุณากรอกข้อมูลให้ครบ", false); return; }

    const btn = this;
    btn.disabled = true;
    btn.textContent = 'กำลังสุ่ม...';
    setStatus("กำลังสุ่มเลข...", true);

    try {
      const resp = await api('getRandomNumber', { empId, birthDate: birth });
      btn.disabled = false; btn.textContent = 'รับเลขสุ่ม ⭐';

      if (resp && resp.status === "success") {
        setStatus(resp.message || 'สุ่มเลขสำเร็จ!', true);
        document.getElementById('couponNumberValue').textContent = resp.randomNumber;
        document.getElementById('couponDisplay').style.display = 'block';
        document.getElementById('voteConfirmBtn').style.display = 'none';
        btn.style.display = 'none';
        document.getElementById('voteCancelBtn').textContent = 'ปิด';
        document.getElementById('voteStatus').style.display = 'none';
      } else {
        setStatus((resp && resp.message) ? resp.message : "เกิดข้อผิดพลาด", false);
      }
    } catch (err) {
      btn.disabled = false; btn.textContent = 'รับเลขสุ่ม ⭐';
      setStatus("เกิดข้อผิดพลาด", false);
      console.error(err);
    }
  });

  document.getElementById('galleryClose').addEventListener('click', closeGallery);
  document.getElementById('galleryBackdrop').addEventListener('click', (e) => { if (e.target.id === 'galleryBackdrop') closeGallery(); });
  document.getElementById('galleryNext').addEventListener('click', showNextMedia);
  document.getElementById('galleryPrev').addEventListener('click', showPrevMedia);

  document.addEventListener('keydown', (e) => {
    const gallery = document.getElementById('galleryBackdrop');
    if (gallery.style.display === 'flex') {
      if (e.key === 'Escape') closeGallery();
      if (e.key === 'ArrowRight') showNextMedia();
      if (e.key === 'ArrowLeft') showPrevMedia();
    }
  });
});
