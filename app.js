
/**
 * KONFIGURASI GOOGLE APPS SCRIPT
 * Sila masukkan URL Web App anda di sini
 */
const GOOGLE_SCRIPT_URL = 'https://script.google.com/macros/s/AKfycbxsRv-G4CAxU27IBLs3MFAfgsUk63mtGi080REhWgRiIA0doOADE9DyZVqph9y6Zq7tGA/exec';

/**
 * LOCAL STORAGE DATABASE MOCK
 */
const DB = {
    key: 'tahdir_app_v2',

    // Initialize with default data if empty
    init() {
        let data;
        try {
            data = JSON.parse(localStorage.getItem(this.key));
        } catch (e) {
            console.error("Data corrupted or empty", e);
        }

        if (!data) {
            const initialData = {
                teachers: [],
                records: []
            };
            localStorage.setItem(this.key, JSON.stringify(initialData));
            return initialData;
        }
        return data;
    },

    get() {
        try {
            const data = JSON.parse(localStorage.getItem(this.key));
            return data || { teachers: [], records: [] };
        } catch (e) {
            return { teachers: [], records: [] };
        }
    },

    save(data) {
        try {
            localStorage.setItem(this.key, JSON.stringify(data));
            updateUI();
            return true;
        } catch (e) {
            if (e.name === 'QuotaExceededError' || e.name === 'NS_ERROR_DOM_QUOTA_REACHED') {
                alert("Ralat Storan Penuh: Sila padam data lama di bahagian Admin atau kurangkan penggunaan gambar.");
                return false;
            } else {
                console.error("Save Error:", e);
                alert("Ralat menyimpan data.");
                return false;
            }
        }
    },

    addRecord(record) {
        const data = this.get();
        data.records.push({ ...record, id: Date.now(), created_at: new Date().toISOString() });
        return this.save(data);
    },

    addTeacher(name) {
        const data = this.get();
        if (data.teachers.some(t => t.name.toLowerCase() === name.toLowerCase())) return false;
        data.teachers.push({ id: Date.now(), name, active: true });
        this.save(data);
        return true;
    },

    deleteTeacher(id) {
        const data = this.get();
        data.teachers = data.teachers.filter(t => t.id !== id);
        this.save(data);
    },

    // Function to Overwrite Data from Cloud
    overwriteFromCloud(teachers, records) {
        const data = this.get();
        // Replace teachers
        data.teachers = teachers.map((t, i) => ({ id: i + 1, name: t.name, active: true }));
        // Replace records if available
        // Replace records (Corrected: Always overwrite to allow deletion)
        if (records && Array.isArray(records)) {
            data.records = records;
        }
        this.save(data);
    }
};

// Global State
let state = DB.init();
let currentProgress = 0;
let uploadedImages = { image1: null, image2: null };
let absentReasons = {}; // Map teacher name to reason
let filterMode = 'day'; // 'day' or 'month'

/**
 * CORE FUNCTIONS
 */
async function init() {
    // Check for Config
    if (!GOOGLE_SCRIPT_URL) {
        document.getElementById('config-alert').classList.remove('hidden');
    } else {
        // Auto Sync on Load (Silent Mode)
        await syncData(true);
    }

    // Set default date to today or specific date
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('duty-date').value = today;

    // Set analytics filters
    const now = new Date();
    document.getElementById('analytics-date').value = today;
    document.getElementById('analytics-month').value = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    updateUI();
}

async function syncData(silent = false) {
    if (!GOOGLE_SCRIPT_URL) return;

    // Check if offline before trying to fetch
    if (!navigator.onLine) {
        if (!silent) showToast("Tiada sambungan internet", "error");
        return;
    }

    const statusEl = document.getElementById('sync-status');
    statusEl.classList.remove('hidden');

    try {
        // Anti-cache param
        const targetUrl = `${GOOGLE_SCRIPT_URL}?action=get_data&t=${new Date().getTime()}`;

        // Added redirect: 'follow'
        const response = await fetch(targetUrl, {
            method: 'GET',
            redirect: 'follow'
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();

        console.log("Data fetched from cloud:", data);

        if (data && (Array.isArray(data.teachers) || Array.isArray(data.records))) {
            const validTeachers = Array.isArray(data.teachers) ? data.teachers : [];
            const validRecords = Array.isArray(data.records) ? data.records : [];

            DB.overwriteFromCloud(validTeachers, validRecords);

            if (!silent) showToast("Data disegerakkan dari Cloud!");
        } else {
            console.warn("Format data tidak sah dari Cloud", data);
        }

    } catch (err) {
        // Use console.warn instead of error to avoid red logs for common network issues
        console.warn("Sync Failed (Network/CORS/Offline):", err);
        // Only show toast if user manually clicked the button
        if (!silent) {
            showToast("Gagal menyegerakkan data (Mungkin Offline)", "error");
        }
    } finally {
        statusEl.classList.add('hidden');
        updateUI();
    }
}

function updateUI() {
    state = DB.get();
    renderTeacherList();
    renderAnalytics();
    renderAdminList();
    const dbCount = document.getElementById('db-count');
    if (dbCount) dbCount.textContent = state.records.length;
}

function renderTeacherList() {
    const container = document.getElementById('teacher-checkboxes');
    const absentContainer = document.getElementById('absent-checkboxes');

    if (!state.teachers || state.teachers.length === 0) {
        container.innerHTML = '<p class="text-sm text-gray-400 p-2">Tiada guru dalam sistem. Sila tambah di bahagian Admin atau tunggu sync.</p>';
        return;
    }

    // Render Present Checkboxes
    container.innerHTML = state.teachers.map(t => `
    <label class="flex items-center gap-3 p-3 rounded-xl bg-white border border-slate-100 shadow-sm hover:border-emerald-200 cursor-pointer transition-all group">
      <input type="checkbox" name="teacher" value="${t.name}" class="w-5 h-5 rounded text-emerald-600 focus:ring-emerald-500 border-gray-300 checkbox-custom transition-all">
      <span class="text-sm font-medium text-slate-700 group-hover:text-emerald-700">${t.name}</span>
    </label>
  `).join('');

    // Render Absent Checkboxes
    absentContainer.innerHTML = state.teachers.map(t => `
    <label class="flex items-center gap-3 p-3 rounded-xl bg-white border border-slate-100 shadow-sm hover:border-red-200 cursor-pointer transition-all group">
      <input type="checkbox" name="absent" value="${t.name}" class="w-5 h-5 rounded text-red-600 focus:ring-red-500 border-gray-300 transition-all" onchange="handleAbsentToggle(this)">
      <span class="text-sm font-medium text-slate-700 group-hover:text-red-700">${t.name}</span>
    </label>
  `).join('');
}

function handleAbsentToggle(checkbox) {
    const container = document.getElementById('absent-reasons-container');
    const list = document.getElementById('absence-reasons-list');
    const teacherName = checkbox.value;

    // Update list based on all checked boxes
    const allChecked = Array.from(document.querySelectorAll('input[name="absent"]:checked'));

    if (allChecked.length > 0) {
        container.classList.remove('hidden');
    } else {
        container.classList.add('hidden');
    }

    // Re-render inputs to match checked state
    list.innerHTML = allChecked.map(cb => {
        const name = cb.value;
        const existingVal = absentReasons[name] || '';
        return `
      <div class="bg-white p-3 rounded-lg border border-red-100">
         <label class="text-xs font-bold text-red-700 mb-1 block">${name}</label>
         <input type="text" value="${existingVal}" oninput="absentReasons['${name}'] = this.value" 
           placeholder="Contoh: Sakit, Cuti Rehat" class="w-full text-sm outline-none border-b border-red-200 focus:border-red-500 py-1 text-slate-700 bg-transparent">
      </div>
    `;
    }).join('');
}

function setProgress(val) {
    currentProgress = val;
    document.querySelectorAll('.progress-star').forEach((el, idx) => {
        if (idx < val) el.classList.add('active', 'text-amber-400');
        else el.classList.remove('active', 'text-amber-400');
    });
    document.getElementById('progress-value').textContent = val;
}

function handleImageUpload(input, previewId) {
    if (input.files && input.files[0]) {
        const file = input.files[0];
        const reader = new FileReader();
        reader.onload = (e) => {
            // Create an image object to perform compression
            const img = new Image();
            img.src = e.target.result;
            img.onload = () => {
                // Compress logic using Canvas
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                const MAX_WIDTH = 1200; // High quality for Drive storage
                let width = img.width;
                let height = img.height;

                if (width > MAX_WIDTH) {
                    height *= MAX_WIDTH / width;
                    width = MAX_WIDTH;
                }

                canvas.width = width;
                canvas.height = height;
                ctx.drawImage(img, 0, 0, width, height);

                // Compress to JPEG 0.8 quality (Good quality)
                const compressedDataUrl = canvas.toDataURL('image/jpeg', 0.8);

                // Save to state
                uploadedImages[input.id] = compressedDataUrl;

                // Update Preview with proper layering
                document.getElementById(previewId).innerHTML = `
          <img src="${compressedDataUrl}" class="w-full h-full object-cover absolute inset-0 z-10">
          <div class="flex flex-col items-center justify-center h-full w-full absolute inset-0 z-0">
             <span class="text-2xl mb-1">📷</span>
             <span class="text-xs text-slate-400">Tukar</span>
          </div>
        `;
            };
        };
        reader.readAsDataURL(file);
    }
}

function showToast(msg, type = 'success') {
    const toast = document.getElementById('toast');
    const icon = document.getElementById('toast-icon');
    const text = document.getElementById('toast-msg');

    icon.textContent = type === 'success' ? '✅' : '⚠️';
    text.textContent = msg;
    toast.classList.remove('opacity-0', 'translate-y-4');
    toast.classList.add('opacity-100', 'translate-y-0');

    setTimeout(() => {
        toast.classList.add('opacity-0', 'translate-y-4');
        toast.classList.remove('opacity-100', 'translate-y-0');
    }, 3000);
}

/**
 * FORM SUBMISSION
 */
document.getElementById('attendance-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const teachers = Array.from(document.querySelectorAll('input[name="teacher"]:checked')).map(c => c.value);
    const absent = Array.from(document.querySelectorAll('input[name="absent"]:checked')).map(c => c.value);
    const date = document.getElementById('duty-date').value;
    const subuh = document.getElementById('time-subuh').checked;
    const maghrib = document.getElementById('time-maghrib').checked;
    const notes = document.getElementById('notes').value;
    const submitBtn = document.getElementById('submit-btn');

    // Validation
    if (teachers.length === 0) return showToast('Pilih sekurang-kurangnya seorang guru bertugas', 'error');
    if (!subuh && !maghrib) return showToast('Pilih sesi bertugas (Subuh/Maghrib)', 'error');
    if (currentProgress === 0) return showToast('Sila tetapkan rating kemajuan', 'error');

    // Validate absent reasons
    for (const t of absent) {
        if (!absentReasons[t] || absentReasons[t].trim() === '') {
            return showToast(`Sila isi sebab tidak hadir untuk ${t}`, 'error');
        }
    }

    const timeSlot = [subuh ? 'Subuh' : '', maghrib ? 'Maghrib' : ''].filter(Boolean).join(' & ');
    const absent_data = absent.map(name => ({ name, reason: absentReasons[name] }));

    // Create Base Record for Local Storage
    const baseRecord = {
        date,
        time_slot: timeSlot,
        progress: currentProgress,
        notes,
        image1: uploadedImages.image1,
        image2: uploadedImages.image2,
        absent_data: absent_data
    };

    submitBtn.disabled = true;
    submitBtn.textContent = 'Menghantar...';

    // 1. Send to Google Sheets (if configured)
    if (GOOGLE_SCRIPT_URL) {
        try {
            const payload = {
                action: 'submit_attendance', // Indicate action type
                date: date,
                time_slot: timeSlot,
                progress: currentProgress,
                notes: notes,
                image1: uploadedImages.image1, // Sending base64 might be heavy, be careful
                image2: uploadedImages.image2,
                teachers: teachers, // Array of present/selected teachers
                absent_data: absent_data
            };

            await fetch(GOOGLE_SCRIPT_URL, {
                method: "POST",
                mode: "no-cors", // Standard mode for GAS Simple Web App
                headers: {
                    "Content-Type": "application/json"
                },
                body: JSON.stringify(payload)
            });
            console.log("Sent to Google Sheets");
        } catch (err) {
            console.error("Google Sheets Error:", err);
            showToast('Amaran: Gagal sync ke Google Sheet', 'error');
        }
    }

    // 2. Save to Local Storage
    let success = true;
    for (const name of teachers) {
        const result = DB.addRecord({
            ...baseRecord,
            teacher_name: name,
            type: 'attendance'
        });
        if (!result) {
            success = false;
            break; // Stop saving if quota exceeded
        }
    }

    if (success) {
        // Reset Form
        e.target.reset();
        setProgress(0);
        uploadedImages = { image1: null, image2: null };
        absentReasons = {};
        const resetPreview = (label) => `
        <div class="flex flex-col items-center justify-center h-full w-full absolute inset-0 z-0">
            <span class="text-2xl mb-1">📷</span>
            <span class="text-xs text-slate-400">${label}</span>
        </div>`;
        document.getElementById('preview1').innerHTML = resetPreview('Gambar 1 (Kanan)');
        document.getElementById('preview2').innerHTML = resetPreview('Gambar 2 (Kiri)');
        document.getElementById('absent-reasons-container').classList.add('hidden');

        showToast('Laporan berjaya dihantar!');
    }

    submitBtn.disabled = false;
    submitBtn.textContent = 'Hantar Laporan';
});

// Update handleAddTeacher to sync with Google Sheets
function handleAddTeacher(e) {
    e.preventDefault();
    const name = document.getElementById('new-teacher-name').value.trim();
    if (!name) return;

    if (DB.addTeacher(name)) {
        // Send to Google Sheets if configured
        if (GOOGLE_SCRIPT_URL) {
            fetch(GOOGLE_SCRIPT_URL, {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'add_teacher', teacher_name: name })
            }).catch(err => console.error("Error adding teacher to sheets:", err));
        }

        document.getElementById('new-teacher-name').value = '';
        showToast('Guru ditambah!');
    } else {
        showToast('Guru sudah wujud', 'error');
    }
}

/**
 * ANALYTICS LOGIC
 */
// document.getElementById('analytics-month').addEventListener('change', renderAnalytics); - Removed in favor of unified logic

function setFilterMode(mode) {
    filterMode = mode;

    // Toggle Buttons
    const btnDay = document.getElementById('btn-mode-day');
    const btnMonth = document.getElementById('btn-mode-month');

    if (mode === 'day') {
        btnDay.classList.add('bg-white', 'text-emerald-600', 'shadow-sm');
        btnDay.classList.remove('text-slate-500');
        btnMonth.classList.remove('bg-white', 'text-emerald-600', 'shadow-sm');
        btnMonth.classList.add('text-slate-500');

        document.getElementById('filter-day-wrapper').classList.remove('hidden');
        document.getElementById('filter-month-wrapper').classList.add('hidden');
    } else {
        btnMonth.classList.add('bg-white', 'text-emerald-600', 'shadow-sm');
        btnMonth.classList.remove('text-slate-500');
        btnDay.classList.remove('bg-white', 'text-emerald-600', 'shadow-sm');
        btnDay.classList.add('text-slate-500');

        document.getElementById('filter-month-wrapper').classList.remove('hidden');
        document.getElementById('filter-day-wrapper').classList.add('hidden');
    }

    renderAnalytics();
}

function getFilteredRecords() {
    const sessionVal = document.getElementById('analytics-session').value;
    let records = state.records;

    // Filter by Date/Month
    if (filterMode === 'day') {
        const dateVal = document.getElementById('analytics-date').value;
        records = records.filter(r => r.date === dateVal);
    } else {
        const monthVal = document.getElementById('analytics-month').value;
        records = records.filter(r => r.date.startsWith(monthVal));
    }

    // Filter by Session
    if (sessionVal !== 'all') {
        records = records.filter(r => r.time_slot.includes(sessionVal));
    }

    return records;
}

function renderAnalytics() {
    const records = getFilteredRecords();

    // Summary
    document.getElementById('total-attendance').textContent = records.length;
    const totalScore = records.reduce((acc, r) => acc + parseInt(r.progress), 0);
    document.getElementById('avg-progress').textContent = records.length ? (totalScore / records.length).toFixed(1) : '0.0';

    // Leaderboard
    const stats = {};
    state.teachers.forEach(t => stats[t.name] = { count: 0, score: 0 });

    records.forEach(r => {
        if (stats[r.teacher_name]) {
            stats[r.teacher_name].count++;
            stats[r.teacher_name].score += parseInt(r.progress);
        }
    });

    const sortedStats = Object.entries(stats)
        .filter(([_, data]) => data.count > 0)
        .sort((a, b) => b[1].count - a[1].count);

    const statsContainer = document.getElementById('teacher-stats');
    if (sortedStats.length === 0) {
        document.getElementById('no-data-message').classList.remove('hidden');
        statsContainer.innerHTML = '';
    } else {
        document.getElementById('no-data-message').classList.add('hidden');
        statsContainer.innerHTML = sortedStats.map(([name, data], idx) => `
      <div class="flex items-center justify-between p-3 bg-slate-50 rounded-xl border border-slate-100">
        <div class="flex items-center gap-3">
          <div class="w-8 h-8 rounded-full bg-white flex items-center justify-center font-bold text-xs shadow-sm text-slate-600 border border-slate-200">${idx + 1}</div>
          <div>
            <div class="font-semibold text-sm text-slate-700">${name}</div>
            <div class="text-[10px] text-slate-400 font-medium">Avg: ${(data.score / data.count).toFixed(1)} ⭐</div>
          </div>
        </div>
        <div class="text-emerald-600 font-bold text-lg">${data.count} <span class="text-xs font-normal text-slate-400">hadir</span></div>
      </div>
    `).join('');
    }

    // Recent List
    const recentContainer = document.getElementById('recent-records');
    const recent = [...records].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 10);

    if (recent.length === 0) {
        recentContainer.innerHTML = '<p class="text-xs text-slate-400 text-center py-2">Tiada rekod.</p>';
    } else {
        recentContainer.innerHTML = recent.map(r => `
      <div class="p-3 bg-slate-50 rounded-xl border border-slate-100 text-sm">
        <div class="flex justify-between items-start mb-1">
          <span class="font-semibold text-slate-700">${r.teacher_name}</span>
          <span class="text-xs text-slate-400 bg-white px-2 py-0.5 rounded-md border border-slate-200">${formatDate(r.date)}</span>
        </div>
        <div class="flex gap-2 items-center text-xs text-slate-500 mb-2">
          <span>${r.time_slot}</span>
          <span>•</span>
          <span class="text-amber-500 font-bold">${r.progress} ★</span>
        </div>
        ${r.absent_data && r.absent_data.length ? `
          <div class="bg-red-50 p-2 rounded-lg mb-2">
            <span class="text-[10px] font-bold text-red-700 block mb-1">Tidak Hadir:</span>
            ${r.absent_data.map(a => `<div class="text-[10px] text-red-600 flex justify-between"><span>${a.name}</span><span class="italic opacity-80">${a.reason}</span></div>`).join('')}
          </div>
        ` : ''}
        ${r.notes ? `<p class="text-xs text-slate-600 italic bg-white p-2 rounded border border-slate-100">"${r.notes}"</p>` : ''}
      </div>
    `).join('');
    }
}

function formatDate(dateString) {
    const options = { day: 'numeric', month: 'short' };
    return new Date(dateString).toLocaleDateString('ms-MY', options);
}

/**
 * ADMIN LOGIC
 */
function handleAdminLogin(e) {
    e.preventDefault();
    const pass = document.getElementById('admin-password').value;
    if (pass === '123') { // Simple client-side protection
        document.getElementById('admin-login').classList.add('hidden');
        document.getElementById('admin-dashboard').classList.remove('hidden');
        document.getElementById('admin-password').value = '';
        document.getElementById('login-error').classList.add('hidden');
    } else {
        document.getElementById('login-error').classList.remove('hidden');
    }
}

function logout() {
    document.getElementById('admin-dashboard').classList.add('hidden');
    document.getElementById('admin-login').classList.remove('hidden');
}

// NOTE: handleAddTeacher is moved up to allow access to GOOGLE_SCRIPT_URL variable if needed (though it's global)

function deleteTeacher(id) {
    if (confirm('Adakah anda pasti? Rekod kehadiran lama akan kekal.')) {
        DB.deleteTeacher(id);
        showToast('Guru dipadam');
    }
}

function renderAdminList() {
    const list = document.getElementById('admin-teacher-list');
    list.innerHTML = state.teachers.map(t => `
    <div class="flex justify-between items-center bg-slate-50 p-3 rounded-xl border border-slate-100">
      <span class="font-medium text-slate-700 text-sm">${t.name}</span>
      <button onclick="deleteTeacher(${t.id})" class="text-xs text-red-500 hover:bg-red-50 p-2 rounded-lg transition">🗑️ Padam</button>
    </div>
  `).join('');
}

function clearAllData() {
    if (confirm('AMARAN: Semua data akan dipadam kekal. Teruskan?')) {
        localStorage.removeItem(DB.key);
        state = DB.init();
        updateUI();
        showToast('Semua data telah dipadam');
    }
}

/**
 * ROUTING
 */
function router(pageId) {
    document.querySelectorAll('.page').forEach(p => p.classList.add('hidden'));
    document.getElementById(`page-${pageId}`).classList.remove('hidden');

    document.querySelectorAll('.nav-item').forEach(el => {
        el.classList.remove('active', 'text-white', 'shadow-lg');
        el.classList.add('text-slate-400');
        // Reset icon color via class removal/addition logic in CSS
        // Using simple class toggle here for the visual effect
    });

    const activeBtn = document.querySelector(`[data-page="${pageId}"]`);
    activeBtn.classList.add('active', 'text-white');
    activeBtn.classList.remove('text-slate-400', 'hover:bg-slate-50');

    if (pageId === 'analytics') renderAnalytics();
}

/**
 * EXPORT TO PDF
 */
function exportAnalyticsToPDF() {
    const records = getFilteredRecords();

    if (records.length === 0) return showToast('Tiada rekod untuk diexport', 'error');

    // Determine Session String based on Filter Selection OR Logic
    const sessionFilterVal = document.getElementById('analytics-session').value;
    let sessionStr = "";

    if (sessionFilterVal !== 'all') {
        sessionStr = sessionFilterVal.toUpperCase() + " "; // E.g., "SUBUH "
    } else {
        // If "All" selected, try to detect if records are uniform
        const allSessions = records.flatMap(r => r.time_slot ? r.time_slot.split(' & ') : []);
        const uniqueSessions = [...new Set(allSessions)].filter(Boolean).sort().map(s => s.toUpperCase());
        if (uniqueSessions.length > 0) {
            sessionStr = uniqueSessions.join(' & ') + " ";
        }
    }

    // Determine Date String based on Filter Mode
    let reportDate = "";
    if (filterMode === 'day') {
        const dateVal = document.getElementById('analytics-date').value;
        // Parse YYYY-MM-DD
        const parts = dateVal.split('-');
        const dateObj = new Date(parts[0], parts[1] - 1, parts[2]);
        reportDate = dateObj.toLocaleDateString('ms-MY', { day: 'numeric', month: 'long', year: 'numeric' }).toUpperCase();
    } else {
        // Monthly mode
        const monthVal = document.getElementById('analytics-month').value;
        const parts = monthVal.split('-');
        const dateObj = new Date(parts[0], parts[1] - 1, 1);
        reportDate = dateObj.toLocaleDateString('ms-MY', { month: 'long', year: 'numeric' }).toUpperCase();
    }

    const fileName = `TAHDIR ${sessionStr}${reportDate}`;

    // Group by date+slot for cleaner report
    const grouped = {};
    records.forEach(r => {
        const key = `${r.date}_${r.time_slot}`;
        if (!grouped[key]) {
            grouped[key] = {
                date: r.date,
                slot: r.time_slot,
                teachers: [],
                absent: r.absent_data || [],
                notes: r.notes,
                progress: r.progress,
                images: [r.image1, r.image2].filter(Boolean)
            };
        }
        if (!grouped[key].teachers.includes(r.teacher_name)) {
            grouped[key].teachers.push(r.teacher_name);
        }
    });

    // Create a temporary container for the PDF content
    const element = document.createElement('div');
    element.innerHTML = `
    <div style="font-family: sans-serif; padding: 20px; color: #333;">
        <div style="text-align: center; margin-bottom: 30px; border-bottom: 2px solid #059669; padding-bottom: 20px;">
            <h1 style="color: #059669; margin: 0;">TAHDIR</h1>
            <p style="color: #555; font-size: 1.1em; margin-top: 5px; font-weight: bold;">${sessionStr}${reportDate}</p>
        </div>
        ${Object.values(grouped).map(g => {
        const orderedImages = g.images ? [...g.images].reverse() : [];
        return `
            <div style="margin-bottom: 30px; border: 1px solid #eee; padding: 20px; border-radius: 8px; page-break-inside: avoid;">
                <div style="font-size: 14px; color: #666; margin-bottom: 15px; font-weight: bold; border-bottom: 1px solid #eee; padding-bottom: 10px;">
                    ${formatDate(g.date)} • ${g.slot} • Rating: ${g.progress}/5
                </div>
                
                <div style="font-weight: bold; font-size: 12px; color: #059669; text-transform: uppercase; margin-top: 15px;">Guru Bertugas</div>
                <div style="margin-bottom: 5px; font-size: 14px;">${g.teachers.join(', ')}</div>
                
                ${g.absent.length ? `
                    <div style="font-weight: bold; font-size: 12px; color: #dc2626; text-transform: uppercase; margin-top: 15px;">Tidak Hadir</div>
                    ${g.absent.map(a => `<div style="color: #dc2626; font-size: 14px;">${a.name} (${a.reason})</div>`).join('')}
                ` : ''}
                
                ${g.notes ? `
                    <div style="font-weight: bold; font-size: 12px; color: #059669; text-transform: uppercase; margin-top: 15px;">Catatan</div>
                    <div style="margin-bottom: 5px; font-size: 14px;">"${g.notes}"</div>
                ` : ''}

                ${orderedImages.length ? `
                    <div style="font-weight: bold; font-size: 12px; color: #059669; text-transform: uppercase; margin-top: 15px;">Gambar Lampiran</div>
                    <div style="display: flex; gap: 10px; margin-top: 10px;">
                        ${orderedImages.map(src => `<img src="https://corsproxy.io/?${encodeURIComponent(src)}" style="width: 48%; height: auto; border: 1px solid #ccc;">`).join('')}
                    </div>
                ` : ''}
            </div>
        `}).join('')}
    </div>`;

    // Configuration for html2pdf
    const opt = {
        margin: 10,
        filename: `${fileName}.pdf`,
        image: { type: 'jpeg', quality: 0.98 },
        html2canvas: { scale: 2, useCORS: true, allowTaint: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' }
    };

    // Generate and Save
    showToast('Menjana PDF...', 'success');
    html2pdf().set(opt).from(element).save().then(() => {
        showToast('PDF berjaya dimuat turun!');
    });
}

// Start App
init().catch(console.error);
